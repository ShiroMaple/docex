import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { extractPdfText } from './extractors/pdfExtractor.js';
import { extractDocxText } from './extractors/docxExtractor.js';
import { extractSafetyIssues } from './services/llmService.js';
import { appendToTable } from './services/feishuService.js';

/**
 * 主控制流：扫描并处理输入目录中的所有文档
 */
async function main() {
  console.log('🚀 启动 Document Extractor (docex) 安全检查报告解析服务...');
  console.log(`📂 输入目录: ${config.paths.inputDir}`);
  console.log(`📂 输出目录: ${config.paths.outputDir}`);
  console.log(`🤖 当前大模型服务商: ${config.llmProvider.toUpperCase()}\n`);

  try {
    // 1. 读取输入文件夹
    const files = await fs.readdir(config.paths.inputDir);
    
    // 过滤掉隐藏文件和保留的 .gitkeep
    const targetFiles = files.filter(file => !file.startsWith('.') && file !== '.gitkeep');

    if (targetFiles.length === 0) {
      console.log('💡 提示: 输入目录为空，没有需要处理的报告。请将 PDF 或 DOCX 文件拖入 data/input 目录。');
      return;
    }

    console.log(`🔍 扫描发现 ${targetFiles.length} 个待处理的文件...\n`);

    for (const fileName of targetFiles) {
      const filePath = path.join(config.paths.inputDir, fileName);
      const ext = path.extname(fileName).toLowerCase();
      
      console.log(`--------------------------------------------------`);
      console.log(`📄 正在处理文件: ${fileName}`);

      let multimodalData = null;

      // 2. 根据文件后缀分发给对应的提取器
      try {
        if (ext === '.pdf') {
          console.log(`⏳ [1/4] 正在解析 PDF 双路数据（无损文本与高精截图）...`);
          multimodalData = await extractPdfText(filePath);
          if (!multimodalData || (!multimodalData.text && (!multimodalData.images || multimodalData.images.length === 0))) {
            console.warn(`⚠️ PDF 文件 ${fileName} 中未提取到任何有效参考文本或页面图片，跳过处理。`);
            continue;
          }
          const textLen = multimodalData.text ? multimodalData.text.length : 0;
          const imageCount = multimodalData.images ? multimodalData.images.length : 0;
          console.log(`✅ [1/4] PDF 解析完成：文字参考层共 ${textLen} 字符，页面截图共 ${imageCount} 页。`);
        } else if (ext === '.docx') {
          console.log(`⏳ [1/4] 正在解析 DOCX 并生成多模态图文流...`);
          multimodalData = await extractDocxText(filePath);
          if (!multimodalData || multimodalData.length === 0) {
            console.warn(`⚠️ DOCX 文件 ${fileName} 中未提取到任何有效图文，跳过处理。`);
            continue;
          }
          const textCount = multimodalData.filter(p => p.type === 'text').length;
          const imageCount = multimodalData.filter(p => p.type === 'image').length;
          console.log(`✅ [1/4] DOCX 解析完成，共提取 ${textCount} 个文本/表格段落，${imageCount} 张现场图片。`);
        } else {
          console.warn(`⚠️ 忽略不支持的文件格式: ${fileName}`);
          continue;
        }
      } catch (err) {
        console.error(`❌ 文件提取失败，跳过该文件。原因:`, err.message);
        continue;
      }

      // 3. 提交给 LLM 获取结构化输出
      let safetyReport;
      let tokenUsage = null;
      try {
        console.log(`⏳ [2/4] 正在调用多模态大模型进行安全隐患提取 (Structured Output)...`);
        const result = await extractSafetyIssues(multimodalData);
        safetyReport = result.data;
        tokenUsage = result.usage;
        console.log(`✅ [2/4] 大模型识别完成！共提取出 ${safetyReport.issues.length} 条隐患。`);
        if (tokenUsage) {
          console.log(`📊 Token 消耗: 输入 ${tokenUsage.promptTokens} | 输出 ${tokenUsage.completionTokens} | 总计 ${tokenUsage.totalTokens}`);
        }
      } catch (err) {
        console.error(`❌ 调用大模型提取失败，跳过该文件。原因:`, err.message);
        continue;
      }

      // 4. 将提取结果写入本地 output 目录备份/日志
      try {
        console.log(`⏳ [3/4] 正在保存中间解析结果到本地...`);
        const outputFileName = `${path.basename(fileName, ext)}_result.json`;
        const outputPath = path.join(config.paths.outputDir, outputFileName);
        
        await fs.writeFile(
          outputPath, 
          JSON.stringify({ 
            fileName, 
            processedAt: new Date().toISOString(), 
            tokenUsage,
            issues: safetyReport.issues 
          }, null, 2),
          'utf-8'
        );
        console.log(`✅ [3/4] 备份完成: ${outputFileName}`);
      } catch (err) {
        console.warn(`⚠️ 警告: 备份本地 JSON 结果失败:`, err.message);
      }

      // 5. 将解析出的隐患追加到多维表格
      try {
        if (safetyReport.issues.length > 0) {
          console.log(`⏳ [4/4] 正在将隐患追加到多维表格...`);
          await appendToTable(safetyReport.issues);
        } else {
          console.log(`⏭️ [4/4] 该文件未发现安全隐患，无需追加多维表格。`);
        }
      } catch (err) {
        console.error(`❌ 追加多维表格失败:`, err.message);
      }

      console.log(`🎉 文件 ${fileName} 处理完成！`);
    }

    console.log(`\n==================================================`);
    console.log('✅ 所有文件处理任务完成！');
  } catch (error) {
    console.error('❌ 执行过程中遭遇严重错误:', error);
  }
}

// 启动程序
main();
