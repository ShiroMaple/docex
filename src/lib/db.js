import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../../data/db.json');
const PREPROCESS_DIR = path.resolve(__dirname, '../../data/preprocessed');
const UPLOAD_DIR = path.resolve(__dirname, '../../data/uploads');

// Ensure database file and directories exist
async function initDb() {
  await fs.mkdir(PREPROCESS_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ files: [] }, null, 2), 'utf-8');
  }
}

export async function readDb() {
  await initDb();
  const content = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(content);
}

export async function writeDb(data) {
  await initDb();
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 增加或更新文件记录
 */
export async function saveFileRecord(record) {
  const db = await readDb();
  const index = db.files.findIndex(f => f.md5 === record.md5);
  
  const newRecord = {
    ...record,
    uploadTime: record.uploadTime || new Date().toISOString()
  };

  if (index >= 0) {
    db.files[index] = { ...db.files[index], ...newRecord };
  } else {
    db.files.push(newRecord);
  }

  await writeDb(db);
  return newRecord;
}

/**
 * 获取特定 MD5 的记录
 */
export async function getFileRecord(md5) {
  const db = await readDb();
  return db.files.find(f => f.md5 === md5) || null;
}

/**
 * 删除文件记录并清理物理文件
 */
export async function deleteFileRecord(md5) {
  const db = await readDb();
  const record = db.files.find(f => f.md5 === md5);
  
  if (record) {
    // 1. 删除上传的原始文件
    if (record.originalPath) {
      await fs.unlink(record.originalPath).catch(() => {});
    }
    
    // 2. 删除预处理文件夹及其内容
    const dirPath = path.join(PREPROCESS_DIR, md5);
    await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
    
    // 3. 从 db.json 中移除
    db.files = db.files.filter(f => f.md5 !== md5);
    await writeDb(db);
    return true;
  }
  return false;
}

/**
 * 7天 TTL 清理任务：自动清理超期的记录和预处理产物
 */
export async function runTtlCleanup() {
  const db = await readDb();
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  
  const keptFiles = [];
  
  for (const file of db.files) {
    const uploadTime = new Date(file.uploadTime).getTime();
    if (now - uploadTime > SEVEN_DAYS_MS) {
      console.log(`🧹 TTL Cleanup: 文件 ${file.fileName} (${file.md5}) 已超期 7 天，自动清理中...`);
      // 清理原始文件
      if (file.originalPath) {
        await fs.unlink(file.originalPath).catch(() => {});
      }
      // 清理预处理文件夹
      const dirPath = path.join(PREPROCESS_DIR, file.md5);
      await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
    } else {
      keptFiles.push(file);
    }
  }

  if (keptFiles.length !== db.files.length) {
    db.files = keptFiles;
    await writeDb(db);
  }
}
