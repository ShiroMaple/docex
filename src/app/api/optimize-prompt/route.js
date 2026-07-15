import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { config } from '../../../config.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { withLogging, logger } from '../../../lib/logger.js';

/**
 * 大模型辅助一键优化提示词
 */
async function optimizePromptHandler(request) {
  try {
    let { apiKey, baseUrl, model, prompt, fields } = await request.json();

    const isDefaultKey = !apiKey || apiKey === config.openai.apiKey;
    if (isDefaultKey) {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
      if (!checkRateLimit(ip)) {
        logger.warn({ event: 'RATE_LIMIT_EXCEEDED', ip }, '默认 API Key 频次超限被拦截');
        return NextResponse.json({ 
          error: '⚠️ 访问受限：您当前使用的是系统默认共享 AI 配置，调用太频繁。请稍候再试（限制为 5 次/分钟），或在配置中设置您自有的 API Key 以解除限制。' 
        }, { status: 429 });
      }
    }

    if (!apiKey) {
      apiKey = config.openai.apiKey;
    }
    if (!baseUrl) {
      baseUrl = config.openai.baseUrl;
    }
    if (!model) {
      model = config.openai.model;
    }

    if (!apiKey || !model) {
      return NextResponse.json({ error: '未配置大模型 API Key 或模型名称，请先在 LLM 配置页中连接并验证' }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl || 'https://api.openai.com/v1'
    });

    const fieldsDesc = fields.map(f => `- 字段键名: ${f.key}, 描述: ${f.desc}, 示例: ${f.example}`).join('\n');

    const systemPrompt = `你是一个专业的提示词工程专家。
你的任务是：帮助用户优化用于大模型文档结构化数据提取的提示词（Prompt），使其更加精准、清晰，重点规避大模型的提取边界混淆与格式幻觉。

【目标提取字段列表】：
${fieldsDesc}

【当前提示词】：
"${prompt}"

【优化规范】：
1. 优化后的提示词必须能精确引导模型分析提取上述字段。
2. 保持语气专业、指示清晰明确，按合理的步骤进行引导。
3. 必须指导模型：如果字段缺失该如何处理（如留空，不可瞎编）。
4. 只返回优化后的提示词文本正文本身，不要包含任何 markdown 块或解释说明文字。`;

    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请帮我优化上述提示词：' }
      ]
    });

    const optimizedPrompt = response.choices[0]?.message?.content?.trim() || prompt;
    
    logger.info({
      event: 'PROMPT_OPTIMIZED',
      model
    }, '提示词优化成功');

    return NextResponse.json({ success: true, optimizedPrompt });

  } catch (err) {
    logger.error({
      event: 'OPTIMIZE_PROMPT_HANDLER_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '优化提示词失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = withLogging(optimizePromptHandler);
