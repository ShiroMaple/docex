import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFileRecord } from '../../../lib/db.js';
import { extractCustomFields } from '../../../services/llmService.js';
import { config } from '../../../config.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PREPROCESS_DIR = path.resolve(__dirname, '../../../../data/preprocessed');

/**
 * 提示词攻击防御网关 (Prompt Injection & Privacy Leak Shield)
 */
function checkPromptSecurity(systemPrompt, userPrompt, fields) {
  const attackPatterns = [
    // 窃取环境变量与隐私
    /\.env/i,
    /env\b/i,
    /process\.env/i,
    /api_key/i,
    /apikey/i,
    /secret/i,
    /password/i,
    /credential/i,
    /token/i,
    // 窃取系统文件
    /\/etc\/passwd/i,
    /system files/i,
    /读取系统文件/i,
    /服务器配置/i,
    // Jailbreak 越狱指令
    /ignore previous/i,
    /bypass safety/i,
    /system prompt/i,
    /system instruction/i,
    /developer mode/i,
    /开发者模式/i,
    /越狱/i,
    /忽略之前的指令/i
  ];

  const contentsToValidate = [
    systemPrompt || '',
    userPrompt || '',
    ...fields.map(f => `${f.label} ${f.desc} ${f.example || ''}`)
  ];

  for (const text of contentsToValidate) {
    for (const pattern of attackPatterns) {
      if (pattern.test(text)) {
        console.warn(`🚨 Prompt Security Shield: 检测到攻击模式匹配 ${pattern}。拦截内容: "${text.substring(0, 100)}..."`);
        return true; // Detected attack!
      }
    }
  }
  return false;
}

/**
 * POST /api/extract
 * 运行大模型识别并提取数据
 */
export async function POST(request) {
  try {
    const { md5, systemPrompt, userPrompt, fields, llmConfig } = await request.json();

    if (!md5) {
      return NextResponse.json({ error: '缺少 md5 参数' }, { status: 400 });
    }
    if (!fields || fields.length === 0) {
      return NextResponse.json({ error: '必须指定待提取的字段' }, { status: 400 });
    }

    const isDefaultKey = !llmConfig?.apiKey || llmConfig.apiKey === config.openai.apiKey;
    if (isDefaultKey) {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
      if (!checkRateLimit(ip)) {
        return NextResponse.json({ 
          error: '⚠️ 访问受限：您当前使用的是系统默认共享 AI 配置，调用太频繁。请稍候再试（限制为 5 次/分钟），或在配置中设置您自有的 API Key 以解除限制。' 
        }, { status: 429 });
      }
    }

    // ── 提示词安全拦截防护 ──
    const isMalicious = checkPromptSecurity(systemPrompt, userPrompt, fields);
    if (isMalicious) {
      return NextResponse.json({ 
        error: '⚠️ 安全拦截：检测到潜在的提示词注入攻击或敏感配置泄露风险（禁止索要 env 环境变量、系统文件或执行越狱指令）。' 
      }, { status: 403 });
    }

    // ── 读取预处理产物 ──
    const record = await getFileRecord(md5);
    if (!record) {
      return NextResponse.json({ error: '未找到文件 MD5 登记记录' }, { status: 404 });
    }
    if (record.status !== 'done') {
      return NextResponse.json({ error: `该文件当前状态为 [${record.status}]，请等待预处理完成。` }, { status: 400 });
    }

    const outputDir = path.join(PREPROCESS_DIR, md5);
    let multimodalData = null;

    const ext = path.extname(record.fileName).toLowerCase();

    if (ext === '.pdf') {
      // 读取 PDF 文字层
      const textPath = path.join(outputDir, 'text.txt');
      const textContent = await fs.readFile(textPath, 'utf-8').catch(() => '');

      // 读取 PNG 截图并转换为 Base64
      const images = [];
      if (record.images && record.images.length > 0) {
        for (const imgRecord of record.images) {
          const imgFileName = path.basename(imgRecord.path);
          const imgFullPath = path.join(outputDir, imgFileName);
          
          const imgBuffer = await fs.readFile(imgFullPath);
          images.push({
            data: imgBuffer.toString('base64'),
            mimeType: imgRecord.mimeType
          });
        }
      }
      multimodalData = { text: textContent, images };

    } else if (ext === '.docx') {
      // 读取 DOCX 结构
      const structurePath = path.join(outputDir, 'structure.json');
      const rawStructure = await fs.readFile(structurePath, 'utf-8');
      const structure = JSON.parse(rawStructure);

      // 读取图片文件转化为 Base64 二进制流，还原图文交织结构
      const parts = [];
      for (const part of structure) {
        if (part.type === 'text') {
          parts.push(part);
        } else if (part.type === 'image') {
          const imgFileName = path.basename(part.path);
          const imgFullPath = path.join(outputDir, imgFileName);
          
          const imgBuffer = await fs.readFile(imgFullPath);
          parts.push({
            type: 'image',
            data: imgBuffer.toString('base64'),
            mimeType: part.mimeType
          });
        }
      }
      multimodalData = parts;
    }

    // ── 调用大模型 ──
    console.log(`🤖 [MD5: ${md5}] 提交大模型提取，字段数: ${fields.length}...`);
    const { data, raw, usage } = await extractCustomFields(multimodalData, {
      systemPrompt,
      userPrompt,
      fields,
      llmConfig
    });

    return NextResponse.json({
      success: true,
      data,
      raw,
      tokenUsage: usage
    });

  } catch (err) {
    console.error('提取失败:', err);
    return NextResponse.json({ 
      error: err.message,
      raw: err.raw || null,
      tokenUsage: err.usage || null
    }, { status: 500 });
  }
}
