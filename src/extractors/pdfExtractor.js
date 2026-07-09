import fs from 'fs/promises';
import { PDFParse } from 'pdf-parse';

/**
 * 从 PDF 文件中提取纯文本内容
 * @param {string} filePath - PDF 文件绝对路径
 * @returns {Promise<string>} 提取出的文本内容
 */
export async function extractPdfText(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    // pdf-parse v2.4.5+ 需要以 PDFParse 类的形式调用，并传入 Uint8Array 数据
    const pdfParser = new PDFParse({
      data: new Uint8Array(dataBuffer)
    });
    
    const result = await pdfParser.getText();
    return result.text;
  } catch (error) {
    console.error(`❌ 解析 PDF 文件失败: ${filePath}`, error);
    throw error;
  }
}
