import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { config } from '../config.js';
import { SafetyReportSchema } from '../schema.js';

// 初始化 OpenAI 客户端
let openaiClient = null;
if (config.openai.apiKey) {
  openaiClient = new OpenAI({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseUrl,
  });
}

/**
 * 将提取出来的多模态数据发送给大模型进行结构化数据解析
 * @param {object} multimodalData - 包含文字参考层及图片数组的多模态对象
 * @returns {Promise<object>} 解析后的安全隐患结构化数据 (符合 SafetyReportSchema)
 */
export async function extractSafetyIssues(multimodalData) {
  const systemPrompt = `你是一个专业的安全检查报告解析专家。
你的任务是：根据输入的报告文档内容（包含文字参考层、表格结构以及视觉截图），提取出所有的安全隐患（问题）。
请严格按照提供的 JSON Schema 结构进行输出。每个文件可能包含 1 个或多个安全隐患，请将它们完整地提取到 issues 数组中。

【关键提取规范】：
1. 仔细结合文字参考层和提供的现场图片/页面截图。安全报告中常常是“一段问题文字描述，紧跟一张现场照片，或照片上有红框圈出具体问题”。请利用图片中的视觉特征辅助理解问题边界和现状描述。
2. 确保提取出每个隐患的项目名称、隐患类型、检查区域、问题描述、整改要求、检查人员和检查日期。
3. 表格和图片中的信息同样重要，必须提取出来。若某些字段在文中未提及，请设为空字符串 ""，绝对不能编造数据。
4. 检查日期尽量转化为 YYYY-MM-DD 格式，如无法转化则保持原文。
5. 必须区分不同的隐患间隔，确保 issues 数组中的每一项都代表一个独立的安全问题。`;

  const userPrompt = `请解析以下安全检查报告内容，结合文字和页面截图，以结构化 JSON 格式返回提取的安全隐患列表：`;

  return await callOpenAI(systemPrompt, userPrompt, multimodalData);
}

/**
 * 调用 OpenAI 结构化输出（带自动降级 JSON Mode 与本地 Zod 校验）
 */
async function callOpenAI(systemPrompt, userPrompt, multimodalData) {
  if (!openaiClient) {
    throw new Error('未配置 OpenAI API Key，无法调用大模型服务');
  }

  try {
    const contentArray = [];
    contentArray.push({ type: 'text', text: userPrompt });

    // 判断是 PDF（结构为 { text, images }）还是 DOCX（结构为交织数组）
    const isPdf = multimodalData && !Array.isArray(multimodalData) && ('text' in multimodalData || 'images' in multimodalData);

    if (isPdf) {
      // 1. 拼装 PDF 提取的辅助文本通道
      if (multimodalData.text && multimodalData.text.trim().length > 0) {
        contentArray.push({
          type: 'text',
          text: `【PDF 原始文档的文字参考层】:\n\`\`\`\n${multimodalData.text}\n\`\`\``
        });
      } else {
        contentArray.push({
          type: 'text',
          text: `【PDF 原始文档的文字参考层】: (未提取到电子文本，请完全依据视觉截图进行 OCR 理解)`
        });
      }

      // 2. 拼装 PDF 提取的页面图片通道（视觉主通道）
      if (multimodalData.images && multimodalData.images.length > 0) {
        contentArray.push({
          type: 'text',
          text: `【PDF 报告的逐页视觉截图】:`
        });
        for (const img of multimodalData.images) {
          contentArray.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType};base64,${img.data}`
            }
          });
        }
      }
    } else {
      // 3. 拼装 DOCX 图文交织流
      for (const part of multimodalData) {
        if (part.type === 'text') {
          contentArray.push({
            type: 'text',
            text: part.text
          });
        } else if (part.type === 'image') {
          contentArray.push({
            type: 'image_url',
            image_url: {
              url: `data:${part.mimeType};base64,${part.data}`
            }
          });
        }
      }
    }

    // 优先使用标准 chat.completions.parse API
    try {
      console.log('⏳ 正在尝试使用 json_schema 结构化输出模式...');
      const response = await openaiClient.chat.completions.parse({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contentArray }
        ],
        response_format: zodResponseFormat(SafetyReportSchema, 'safety_report'),
      });

      const parsedData = response.choices[0].message.parsed;
      if (!parsedData) {
        throw new Error('解析失败: 模型未返回结构化数据');
      }
      return {
        data: parsedData,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : null
      };
    } catch (parseError) {
      console.warn('⚠️ 您的大模型服务商不支持 completions.parse (json_schema)，正在自动降级为标准 JSON Mode 进行兼容提取...');
      
      // 构造降级提示词，明确指示输出符合 Zod Schema
      const fallbackSystemPrompt = `${systemPrompt}\n\n【关键约束】：你必须且只能返回一个合法的 JSON 对象，不要包含 markdown 格式标记，不要包含 json 代码块包裹，直接输出 JSON 文本。其顶级键名必须为 "issues"，值是一个数组。每个隐患对象包含以下字段：
- projectName: 项目名称（若未提及，设为 ""）
- issueType: 安全隐患类型（如临时用电、高处作业、临边防护、机械安全等）
- inspectionArea: 发现的检查区域
- description: 安全隐患描述，结合文字和截图红框中的状况
- rectificationRequirement: 整改要求（若未提及，设为 ""）
- inspector: 检查人员（若未提及，设为 ""）
- inspectionDate: 发现日期 (格式为 YYYY-MM-DD)`;

      const fallbackResponse = await openaiClient.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: fallbackSystemPrompt },
          { role: 'user', content: contentArray }
        ],
        response_format: { type: 'json_object' }
      });

      let rawContent = fallbackResponse.choices[0].message.content;
      if (!rawContent) {
        throw new Error('降级 JSON Mode 调用未返回任何内容');
      }

      rawContent = rawContent.trim();
      // 过滤大模型可能擅自添加的 ```json ... ``` 标记
      if (rawContent.startsWith('```')) {
        rawContent = rawContent.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      }

      const parsedData = JSON.parse(rawContent);
      
      // 本地使用 Zod Schema 运行时强制校对
      const validatedData = SafetyReportSchema.parse(parsedData);

      return {
        data: validatedData,
        usage: fallbackResponse.usage ? {
          promptTokens: fallbackResponse.usage.prompt_tokens,
          completionTokens: fallbackResponse.usage.completion_tokens,
          totalTokens: fallbackResponse.usage.total_tokens
        } : null
      };
    }
  } catch (error) {
    console.error('❌ 多模态安全隐患数据提取失败:', error);
    throw error;
  }
}
