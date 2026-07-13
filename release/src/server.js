import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { extractPdfText } from './extractors/pdfExtractor.js';
import { extractDocxText } from './extractors/docxExtractor.js';
import { extractSafetyIssues } from './services/llmService.js';
import wpsService from './services/wpsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 静态文件
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: '10mb' }));

// 文件上传：存入临时目录
const upload = multer({
  dest: path.join(__dirname, '../data/tmp'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 PDF 和 DOCX 格式'));
    }
  }
});

/**
 * POST /api/upload
 * 接收文件 + WPS fileId，完整执行解析流程
 * Body (multipart): file, fileId
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未收到文件' });
    }

    const fileId = req.body.fileId?.trim();
    if (!fileId) {
      return res.status(400).json({ error: '未提供 WPS fileId' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    console.log(`📄 收到文件: ${req.file.originalname} (${ext}), fileId: ${fileId}`);

    // 1. 提取多模态数据
    let multimodalData;
    if (ext === '.pdf') {
      console.log('⏳ 正在解析 PDF...');
      multimodalData = await extractPdfText(tmpPath);
    } else {
      console.log('⏳ 正在解析 DOCX...');
      multimodalData = await extractDocxText(tmpPath);
    }

    // 2. LLM 解析
    console.log('⏳ 正在调用 LLM 提取隐患...');
    const { data: safetyReport, usage } = await extractSafetyIssues(multimodalData);
    console.log(`✅ LLM 返回 ${safetyReport.issues.length} 条隐患`);

    // 3. 获取 WPS Schema（并行）
    let schemaFields = [];
    try {
      wpsService.setFileId(fileId);
      const sheet = await wpsService.getSchema();
      schemaFields = sheet.fields.map(f => ({ id: f.id, name: f.name, type: f.type }));
    } catch (e) {
      console.warn('⚠️ 获取 WPS Schema 失败:', e.message);
    }

    return res.json({
      issues: safetyReport.issues,
      schemaFields,
      tokenUsage: usage,
      fileName: req.file.originalname
    });

  } catch (err) {
    console.error('❌ 处理失败:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    // 清理临时文件
    if (tmpPath) {
      fs.unlink(tmpPath).catch(() => {});
    }
  }
});

/**
 * GET /api/schema?fileId=xxx
 * 获取 WPS 目标表字段列表
 */
app.get('/api/schema', async (req, res) => {
  const fileId = req.query.fileId?.trim();
  if (!fileId) return res.status(400).json({ error: '缺少 fileId 参数' });

  try {
    wpsService.setFileId(fileId);
    const sheet = await wpsService.getSchema();
    const fields = sheet.fields.map(f => ({ id: f.id, name: f.name, type: f.type }));
    res.json({ sheetName: sheet.name, fields });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/push
 * 将确认后的隐患列表写入 WPS 多维表格
 * Body: { fileId, issues, fieldMapping }
 *   fieldMapping: { "项目名称": "projectName", ... } or null (自动匹配)
 */
app.post('/api/push', async (req, res) => {
  const { fileId, issues, fieldMapping } = req.body;

  if (!fileId) return res.status(400).json({ error: '缺少 fileId' });
  if (!issues || issues.length === 0) return res.status(400).json({ error: '没有要推送的数据' });

  try {
    wpsService.setFileId(fileId);
    const result = await wpsService.appendRecords(issues, null, fieldMapping);
    res.json({ success: true, insertedCount: issues.length, result });
  } catch (err) {
    console.error('❌ 推送失败:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.msg || err.message });
  }
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('❌ 服务器错误:', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 DocEx Web 服务已启动！`);
  console.log(`📡 访问地址: http://localhost:${PORT}`);
  console.log(`🤖 使用模型: MiMo-V2.5`);
  console.log(`\n等待文件上传...\n`);
});
