import OpenAI from 'openai';
import { config } from '../config.js';

/**
 * 通用多模态文档提取服务（解耦业务逻辑）
 * @param {object|Array} multimodalData - 预处理后的多模态对象 { text, images } 或交织数组
 * @param {object} params - 动态参数
 * @param {string} params.systemPrompt - 系统引导词
 * @param {string} params.userPrompt - 用户指令词
 * @param {Array<object>} params.fields - 目标提取字段定义 [{ key, label, desc, example }]
 * @param {object} params.llmConfig - 大模型连接配置 { apiKey, baseUrl, model, supportVision }
 * @returns {Promise<object>} { data: Array<object>, usage: object }
 */
export async function extractCustomFields(multimodalData, { systemPrompt, userPrompt, fields, llmConfig }) {
  const apiKey = llmConfig.apiKey || config.openai.apiKey;
  const baseUrl = llmConfig.baseUrl || config.openai.baseUrl;
  const model = llmConfig.model || config.openai.model;

  if (!apiKey) {
    throw new Error('未配置 API Key，无法调用大模型服务');
  }

  // 动态创建 OpenAI 客户端实例
  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl
  });

  // 1. 根据前端填写的字段列表动态构建 JSON Schema
  const properties = {};
  const required = [];
  
  fields.forEach(f => {
    properties[f.key] = {
      type: 'string',
      description: `${f.desc}${f.example ? `（示例：${f.example}）` : ''}`
    };
    required.push(f.key);
  });

  const jsonSchema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: '从文档中提取的结构化隐患或数据列表',
        items: {
          type: 'object',
          properties: properties,
          required: required,
          additionalProperties: false
        }
      }
    },
    required: ['results'],
    additionalProperties: false
  };

  // 2. 拼装多模态内容列表
  const contentArray = [];
  contentArray.push({ type: 'text', text: userPrompt || '请分析以下文档内容并提取结构化字段：' });

  const isPdf = multimodalData && !Array.isArray(multimodalData) && ('text' in multimodalData || 'images' in multimodalData);
  const supportVision = llmConfig.supportVision !== false;

  if (isPdf) {
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

    if (supportVision && multimodalData.images && multimodalData.images.length > 0) {
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
  } else if (Array.isArray(multimodalData)) {
    // DOCX 图文交织流
    for (const part of multimodalData) {
      if (part.type === 'text') {
        contentArray.push({ type: 'text', text: part.text });
      } else if (part.type === 'image' && supportVision) {
        contentArray.push({
          type: 'image_url',
          image_url: {
            url: `data:${part.mimeType};base64,${part.data}`
          }
        });
      }
    }
  }

  // 3. 执行调用
  const keyInstructions = `\n\n【关键规范】：返回的 JSON 数组中，每一个对象必须严格且只能使用以下指定的英文属性键名（Property Keys），严禁自定义或使用中文列名作为 JSON 的键名：\n${fields.map(f => `- "${f.key}": 对应“${f.label}”（${f.desc || ''}）`).join('\n')}`;
  const enhancedSystemPrompt = `${systemPrompt}${keyInstructions}`;

  try {
    console.log('⏳ 正在尝试使用 Structured Outputs (json_schema) 模式...');
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: enhancedSystemPrompt },
        { role: 'user', content: contentArray }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_extractor',
          strict: true,
          schema: jsonSchema
        }
      }
    });

    const rawContent = response.choices[0].message.content;
    const parsed = JSON.parse(rawContent);
    const results = parsed.results || [];
    
    // 容错处理：大模型有时没有严格遵循 schema key，而是返回了中文列名或别名作为键值，进行防御性转换对齐
    const translated = translateResultKeys(results, fields);

    return {
      data: translated,
      raw: rawContent,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : null
    };

  } catch (parseError) {
    console.warn('⚠️ completions.create (json_schema) 失败或不支持，自动降级为 JSON Mode 兼容提取:', parseError.message);

    // 强引导提示词
    const fallbackSystemPrompt = `${enhancedSystemPrompt}\n\n【关键规范】：你必须且只能返回一个合法的 JSON 格式，顶级键名必须为 "results"，其值是一个数组。不要包含 markdown 格式标记，直接输出 JSON 文本。
每个对象必须包含以下字段: ${JSON.stringify(required)}。若字段在文中未提及，设为空字符串 ""。`;

    let response;
    try {
      response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: fallbackSystemPrompt },
          { role: 'user', content: contentArray }
        ],
        response_format: { type: 'json_object' }
      });
    } catch (apiErr) {
      // 接口调用彻底失败，直接向外抛出
      throw apiErr;
    }

    let rawContent = response.choices[0].message.content;
    const usage = response.usage ? {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens
    } : null;

    if (!rawContent) {
      const err = new Error('降级 JSON Mode 调用未返回任何内容');
      err.usage = usage;
      throw err;
    }

    rawContent = rawContent.trim();
    if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    }

    try {
      const parsed = JSON.parse(rawContent);
      const results = parsed.results || [];
      const translated = translateResultKeys(results, fields);

      return {
        data: translated,
        raw: rawContent,
        usage: usage
      };
    } catch (jsonErr) {
      // JSON 解析失败，仍然需要将已消耗的 token 统计和原始文本挂载至 Error 对象抛出
      const err = new Error(`大模型返回了非法的 JSON 格式，解析失败: ${jsonErr.message}`);
      err.raw = rawContent;
      err.usage = usage;
      throw err;
    }
  }
}

/**
 * 防御性字段键名映射转换器
 */
function translateResultKeys(results, fields) {
  if (!Array.isArray(results)) return [];
  return results.map(item => {
    const newItem = {};
    fields.forEach(f => {
      const targetKey = f.key;
      const targetLabel = f.label;
      let foundValue = undefined;

      // 1. 优先完全匹配 English key
      if (item[targetKey] !== undefined) {
        foundValue = item[targetKey];
      }
      // 2. 其次匹配中文 Label 标签
      else if (item[targetLabel] !== undefined) {
        foundValue = item[targetLabel];
      }
      // 3. 防御性模糊/包含匹配
      else {
        const cleanKey = targetKey.trim().toLowerCase();
        const cleanLabel = targetLabel.trim().toLowerCase();
        for (const itemKey of Object.keys(item)) {
          const cleanItemKey = itemKey.trim().toLowerCase();
          if (cleanItemKey === cleanKey || cleanItemKey === cleanLabel || cleanItemKey.includes(cleanLabel) || cleanLabel.includes(cleanItemKey)) {
            foundValue = item[itemKey];
            break;
          }
        }
      }

      // 确保输出为 String 格式，便于表格就地编辑和防崩溃处理
      newItem[targetKey] = foundValue !== undefined && foundValue !== null ? String(foundValue) : '';
    });
    return newItem;
  });
}

/**
 * 极简兼容方法：适配旧版安全报告调用
 */
export async function extractSafetyIssues(multimodalData) {
  const defaultFields = [
    { key: 'projectName', label: '项目名称', desc: '隐患对应的项目或工程名称', example: '' },
    { key: 'issueType', label: '问题类型', desc: '安全问题分类，如临时用电、高处作业', example: '' },
    { key: 'inspectionArea', label: '检查区域', desc: '问题被发现的具体位置', example: '' },
    { key: 'description', label: '问题描述', desc: '安全隐患的现状具体描述', example: '' },
    { key: 'rectificationRequirement', label: '整改要求', desc: '整改措施或限期完成的要求', example: '' },
    { key: 'inspector', label: '检查人员', desc: '检查人员姓名', example: '' },
    { key: 'inspectionDate', label: '检查日期', desc: '发现隐患的日期 (YYYY-MM-DD)', example: '' }
  ];

  const systemPrompt = `你是一个专业的安全检查报告解析专家。请严格按照提供的结构输出所有的安全隐患。`;
  const userPrompt = `请提取安全隐患：`;

  return await extractCustomFields(multimodalData, {
    systemPrompt,
    userPrompt,
    fields: defaultFields,
    llmConfig: {
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model: config.openai.model,
      supportVision: true
    }
  });
}
