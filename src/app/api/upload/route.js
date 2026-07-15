import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateMd5, triggerPreprocessing } from '../../../lib/preprocess.js';
import { getFileRecord, saveFileRecord, runTtlCleanup } from '../../../lib/db.js';
import { withLogging, logger } from '../../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.resolve(process.cwd(), 'data/uploads');

async function uploadHandler(request) {
  try {
    // 运行一次 TTL 清理，删除老文件
    await runTtlCleanup().catch(e => {
      logger.error({ 
        event: 'TTL_CLEANUP_ERROR', 
        error: { message: e.message, stack: e.stack } 
      }, 'TTL cleanup failed');
    });

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }

    const fileName = file.name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.pdf', '.docx'].includes(ext)) {
      return NextResponse.json({ error: '仅支持 PDF 和 DOCX 格式' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 1. 计算 MD5
    const md5 = calculateMd5(buffer);
    
    // 2. 检查 MD5 是否已存在且物理文件完备
    const existing = await getFileRecord(md5);
    let physicalExists = false;
    if (existing && existing.status === 'done') {
      const PREPROCESS_DIR = path.resolve(process.cwd(), 'data/preprocessed');
      const targetDir = path.join(PREPROCESS_DIR, md5);
      try {
        if (ext === '.pdf') {
          await fs.access(path.join(targetDir, 'text.txt'));
        } else if (ext === '.docx') {
          await fs.access(path.join(targetDir, 'structure.json'));
        }
        physicalExists = true;
      } catch {
        logger.warn({
          event: 'PREPROCESS_PHYSICAL_MISSING',
          file: { md5, ext }
        }, `⚠️ [MD5: ${md5}] 数据库标记已处理，但物理文件缺失，将重新触发解析。`);
      }
    }

    if (existing && (existing.status !== 'done' || physicalExists)) {
      logger.info({
        event: 'PREPROCESS_CACHE_HIT',
        file: { md5, ext },
        status: existing.status
      }, `🎯 [MD5: ${md5}] 文件已存在且已被预处理，直接复用记录。`);
      return NextResponse.json({ 
        success: true, 
        isDuplicate: true, 
        record: existing 
      });
    }

    // 3. 物理保存原始文件
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const originalPath = path.join(UPLOAD_DIR, `${md5}${ext}`);
    await fs.writeFile(originalPath, buffer);

    // 4. 创建初始数据库登记
    const record = await saveFileRecord({
      md5,
      fileName,
      uploadTime: new Date().toISOString(),
      status: 'processing',
      progress: 0,
      originalPath,
      error: null
    });

    // 5. 后台启动异步预处理脚本
    triggerPreprocessing(md5);

    return NextResponse.json({ 
      success: true, 
      isDuplicate: false, 
      record 
    });

  } catch (err) {
    logger.error({
      event: 'UPLOAD_PROCESSING_ERROR',
      error: { message: err.message, stack: err.stack }
    }, '上传与解析失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = withLogging(uploadHandler);
