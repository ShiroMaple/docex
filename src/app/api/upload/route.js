import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateMd5, triggerPreprocessing } from '../../../lib/preprocess.js';
import { getFileRecord, saveFileRecord, runTtlCleanup } from '../../../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.resolve(process.cwd(), 'data/uploads');

export async function POST(request) {
  try {
    // 运行一次 TTL 清理，删除老文件
    await runTtlCleanup().catch(e => console.error('TTL cleanup error:', e));

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
    
    // 2. 检查 MD5 是否已存在
    const existing = await getFileRecord(md5);
    if (existing) {
      console.log(`🎯 [MD5: ${md5}] 文件已存在且已被预处理，直接复用记录。`);
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
    console.error('上传与解析失败:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
