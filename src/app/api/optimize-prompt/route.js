import { NextResponse } from 'next/server';
import OpenAI from 'openai';

/**
 * 大模型辅助一键优化提示词
 */
export async function POST(request) {
  try {
    const { apiKey, baseUrl, model, prompt, fields } = await request.json();

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
    
    return NextResponse.json({ success: true, optimizedPrompt });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
