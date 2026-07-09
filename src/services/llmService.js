import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { GoogleGenAI, setDefaultBaseUrls } from '@google/genai';
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

// 初始化 Gemini (Google Gen AI) 客户端
let geminiClient = null;
if (config.gemini.apiKey) {
  if (config.gemini.baseUrl) {
    setDefaultBaseUrls({ geminiUrl: config.gemini.baseUrl });
  }
  geminiClient = new GoogleGenAI({
    apiKey: config.gemini.apiKey,
  });
}

/**
 * 将提取出来的文本文档发送给大模型进行结构化数据解析
 * @param {string} text - 报告的纯文本内容
 * @returns {Promise<object>} 解析后的安全隐患结构化数据 (符合 SafetyReportSchema)
 */
export async function extractSafetyIssues(text) {
  const provider = config.llmProvider.toLowerCase();
  
  const systemPrompt = `你是一个专业的安全检查报告解析专家。
任务：从提供的安全检查报告文本中，提取出所有的安全隐患（问题）。
请严格按照提供的 JSON Schema 结构进行输出。每个文件可能包含 1 个或多个安全隐患，请将它们完整地提取到 issues 数组中。
提取规范：
1. 仔细阅读全文，找到所有提到安全隐患、缺陷、整改项的内容。
2. 确保提取出每个隐患的项目名称、隐患类型、检查区域、问题描述、整改要求、检查人员和检查日期。
3. 如果某些字段在文中未提及，请设为空字符串 ""，不要编造数据。
4. 检查日期尽量转化为 YYYY-MM-DD 格式，如无法转化则保持原文。`;

  const userPrompt = `请解析以下安全检查报告内容，并以结构化 JSON 格式返回：\n\n${text}`;

  if (provider === 'openai') {
    return await callOpenAI(systemPrompt, userPrompt);
  } else if (provider === 'google') {
    return await callGemini(systemPrompt, userPrompt);
  } else {
    throw new Error(`未知的 LLM_PROVIDER: ${config.llmProvider}，目前仅支持 google 或 openai`);
  }
}

/**
 * 调用 OpenAI 结构化输出
 */
async function callOpenAI(systemPrompt, userPrompt) {
  if (!openaiClient) {
    throw new Error('未配置 OpenAI API Key 却尝试调用 OpenAI 服务');
  }

  try {
    const response = await openaiClient.beta.chat.completions.parse({
      model: config.openai.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: zodResponseFormat(SafetyReportSchema, 'safety_report'),
    });

    const parsedData = response.choices[0].message.parsed;
    if (!parsedData) {
      throw new Error('OpenAI 未能返回符合 Schema 的数据');
    }
    return parsedData;
  } catch (error) {
    console.error('❌ 调用 OpenAI 提取安全隐患失败:', error);
    throw error;
  }
}

/**
 * 调用 Gemini (Google Gen AI SDK) 结构化输出
 */
async function callGemini(systemPrompt, userPrompt) {
  if (!geminiClient) {
    throw new Error('未配置 Gemini API Key 却尝试调用 Gemini 服务');
  }

  try {
    // 构造符合 Gemini 要求的 responseSchema (OpenAPI 3.0 规范)
    const geminiSchema = {
      type: 'OBJECT',
      properties: {
        issues: {
          type: 'ARRAY',
          description: '从文档中提取出的安全隐患列表，若无隐患则返回空数组',
          items: {
            type: 'OBJECT',
            properties: {
              projectName: { type: 'STRING', description: '隐患对应的项目名称。若未提及，留空 ""' },
              issueType: { type: 'STRING', description: '隐患的分类或类型，例如：高处作业、临时用电、消防安全、临边防护等' },
              inspectionArea: { type: 'STRING', description: '隐患具体的检查区域、点位或楼层' },
              description: { type: 'STRING', description: '安全隐患的具体问题描述' },
              rectificationRequirement: { type: 'STRING', description: '针对该隐患提出的整改要求或限期整改措施' },
              inspector: { type: 'STRING', description: '负责进行本次检查的人员姓名' },
              inspectionDate: { type: 'STRING', description: '发现隐患的检查日期，格式为 YYYY-MM-DD' }
            },
            required: ['projectName', 'issueType', 'inspectionArea', 'description', 'rectificationRequirement', 'inspector', 'inspectionDate']
          }
        }
      },
      required: ['issues']
    };

    const response = await geminiClient.models.generateContent({
      model: config.gemini.model,
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: geminiSchema,
        temperature: 0.1 // 降低温度以提高提取的准确性
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini 未能返回任何内容');
    }

    // 解析并校验返回的 JSON
    const parsedData = JSON.parse(responseText);
    
    // 使用 zod Schema 进行运行时安全校验
    return SafetyReportSchema.parse(parsedData);
  } catch (error) {
    console.error('❌ 调用 Gemini 提取安全隐患失败:', error);
    throw error;
  }
}
