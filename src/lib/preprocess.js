import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfToPng } from 'pdf-to-png-converter';
import mammoth from 'mammoth';
import { getFileRecord, saveFileRecord } from './db.js';

const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PREPROCESS_DIR = path.resolve(__dirname, '../../data/preprocessed');

/**
 * 计算文件的 MD5 值
 */
export function calculateMd5(fileBuffer) {
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

/**
 * 触发异步预处理任务
 */
export function triggerPreprocessing(md5) {
  // 异步执行，不阻塞当前的 HTTP 响应
  preprocessFile(md5).catch(err => {
    console.error(`❌ [MD5: ${md5}] 异步预处理异常:`, err);
  });
}

/**
 * 双路预处理主逻辑：文本提取与图片解析
 */
async function preprocessFile(md5) {
  const record = await getFileRecord(md5);
  if (!record) {
    throw new Error(`未找到 MD5: ${md5} 的记录，无法启动预处理。`);
  }

  const filePath = record.originalPath;
  const ext = path.extname(record.fileName).toLowerCase();
  const outputDir = path.join(PREPROCESS_DIR, md5);
  
  await fs.mkdir(outputDir, { recursive: true });
  
  console.log(`⏳ [MD5: ${md5}] 启动预处理: ${record.fileName}`);
  
  try {
    await saveFileRecord({ md5, status: 'processing', progress: 10, error: null });

    if (ext === '.pdf') {
      await processPdf(filePath, outputDir, md5);
    } else if (ext === '.docx') {
      await processDocx(filePath, outputDir, md5);
    } else {
      throw new Error(`不支持的文件格式: ${ext}`);
    }

    console.log(`✅ [MD5: ${md5}] 预处理成功完成！`);
  } catch (err) {
    console.error(`❌ [MD5: ${md5}] 预处理失败:`, err.message);
    await saveFileRecord({ 
      md5, 
      status: 'failed', 
      progress: 100, 
      error: err.message 
    });
  }
}

/**
 * PDF 预处理
 */
async function processPdf(filePath, outputDir, md5) {
  // 1. 尝试提取文字层
  let text = '';
  try {
    const dataBuffer = await fs.readFile(filePath);
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true
    });
    const doc = await loadingTask.promise;
    
    let textBuilder = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str || '').join(' ');
      textBuilder.push(pageText);
      
      // 更新进度
      const progressPercent = Math.min(10 + Math.floor((i / doc.numPages) * 30), 40);
      await saveFileRecord({ md5, progress: progressPercent });
    }
    text = textBuilder.join('\n\n');
  } catch (error) {
    console.warn(`[MD5: ${md5}] 无法提取 PDF 字符层文字，进入视觉兜底模式:`, error.message);
  }

  // 写入文字层文件
  const textFilePath = path.join(outputDir, 'text.txt');
  await fs.writeFile(textFilePath, text, 'utf-8');

  // 2. 将 PDF 每一页渲染为高精 PNG
  await saveFileRecord({ md5, progress: 50 });
  
  const pdfPngPages = await pdfToPng(filePath, {
    viewportScale: 1.5
  });

  const images = [];
  for (let i = 0; i < pdfPngPages.length; i++) {
    const page = pdfPngPages[i];
    const imgName = `page-${i + 1}.png`;
    const imgPath = path.join(outputDir, imgName);
    
    // 写入图片物理文件
    await fs.writeFile(imgPath, page.content);
    
    images.push({
      path: `data/preprocessed/${md5}/${imgName}`,
      mimeType: 'image/png'
    });

    const progressPercent = Math.min(50 + Math.floor((i / pdfPngPages.length) * 45), 95);
    await saveFileRecord({ md5, progress: progressPercent });
  }

  // 更新数据库记录为 Done
  await saveFileRecord({
    md5,
    status: 'done',
    progress: 100,
    textPath: `data/preprocessed/${md5}/text.txt`,
    images
  });
}

/**
 * DOCX 预处理
 */
async function processDocx(filePath, outputDir, md5) {
  const result = await mammoth.convertToHtml({ path: filePath });
  const html = result.value;
  
  await saveFileRecord({ md5, progress: 40 });

  // 将 HTML 解析为图文交织的结构化数组，并将图片提取保存到本地
  const parts = [];
  const imgRegex = /<img[^>]+src=["']data:([^;]+);base64,([^"']+)["'][^>]*>/gi;
  
  let lastIndex = 0;
  let match;
  let imageCounter = 0;

  while ((match = imgRegex.exec(html)) !== null) {
    const textBefore = html.substring(lastIndex, match.index).trim();
    if (textBefore) {
      parts.push({
        type: 'text',
        text: textBefore
      });
    }

    const mimeType = match[1]; // e.g. "image/png"
    const base64Data = match[2];
    const fileExt = mimeType.split('/')[1] || 'png';
    
    imageCounter++;
    const imgName = `image-${imageCounter}.${fileExt}`;
    const imgPath = path.join(outputDir, imgName);
    
    // 将 base64 转为 Binary 物理写入
    await fs.writeFile(imgPath, Buffer.from(base64Data, 'base64'));

    parts.push({
      type: 'image',
      path: `data/preprocessed/${md5}/${imgName}`,
      mimeType: mimeType
    });

    lastIndex = imgRegex.lastIndex;
    
    // 渐进式更新进度
    await saveFileRecord({ md5, progress: Math.min(40 + imageCounter * 5, 80) });
  }

  const textAfter = html.substring(lastIndex).trim();
  if (textAfter) {
    parts.push({
      type: 'text',
      text: textAfter
    });
  }

  // 写入 DOCX 物理文字参考层（合并所有的文本）
  const plainText = parts
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('\n\n')
    // 去除 HTML 标签作为纯文本保存
    .replace(/<[^>]+>/g, '');

  const textFilePath = path.join(outputDir, 'text.txt');
  await fs.writeFile(textFilePath, plainText, 'utf-8');

  // 保存图文交织的 structure.json 结构
  const structureFilePath = path.join(outputDir, 'structure.json');
  await fs.writeFile(structureFilePath, JSON.stringify(parts, null, 2), 'utf-8');

  await saveFileRecord({
    md5,
    status: 'done',
    progress: 100,
    textPath: `data/preprocessed/${md5}/text.txt`,
    structurePath: `data/preprocessed/${md5}/structure.json`
  });
}
