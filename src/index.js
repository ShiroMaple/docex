import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { extractPdfText } from './extractors/pdfExtractor.js';
import { extractDocxText } from './extractors/docxExtractor.js';
import { extractSafetyIssues } from './services/llmService.js';
import { appendToTable } from './services/tableService.js';

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

      let extractedText = '';

      // 2. 根据文件后缀分发给对应的提取器
      try {
        if (ext === '.pdf') {
          console.log(`⏳ [1/4] 正在提取 PDF 文字...`);
          extractedText = await extractPdfText(filePath);
        } else if (ext === '.docx') {
          console.log(`⏳ [1/4] 正在提取 DOCX 文字...`);
          extractedText = await extractDocxText(filePath);
        } else {
          console.warn(`⚠️ 忽略不支持的文件格式: ${fileName}`);
          continue;
        }

        if (!extractedText || extractedText.trim().length === 0) {
          console.warn(`⚠️ 文件 ${fileName} 中未提取到任何有效文本，跳过处理。`);
          continue;
        }

        console.log(`✅ [1/4] 文本提取完成，共计 ${extractedText.length} 字符。`);
      } catch (err) {
        console.error(`❌ 文件提取失败，跳过该文件。原因:`, err.message);
        continue;
      }

      // 3. 提交给 LLM 获取结构化输出
      let safetyReport;
      try {
        console.log(`⏳ [2/4] 正在调用大模型进行安全隐患提取 (Structured Output)...`);
        safetyReport = await extractSafetyIssues(extractedText);
        console.log(`✅ [2/4] 大模型识别完成！共提取出 ${safetyReport.issues.length} 条隐患。`);
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
          JSON.stringify({ fileName, processedAt: new Date().toISOString(), ...safetyReport }, null, 2),
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
