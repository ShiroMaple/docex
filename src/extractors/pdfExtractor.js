import fs from 'fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfToPng } from 'pdf-to-png-converter';

/**
 * 双路解析 PDF 文件：提取底层字符层文字（辅助通道）与将页面渲染为图片（视觉主通道）
 * @param {string} filePath - PDF 文件绝对路径
 * @returns {Promise<{text: string, images: Array<{data: string, mimeType: string}>}>}
 */
export async function extractPdfText(filePath) {
  let text = '';
  let images = [];

  // 1. 尝试提取底层文字层（作为辅助参考）
  try {
    const dataBuffer = await fs.readFile(filePath);
    // 直接使用相同的 pdfjs-dist 库提取文本，确保没有 API-Worker 版本冲突
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
    }
    text = textBuilder.join('\n\n');
  } catch (error) {
    // 遇到文字解析错误不中断，仅记录警告，进入视觉兜底模式
    console.warn(`⚠️ 无法从 PDF 提取无损文本层，将仅采用纯视觉通道解析。原因:`, error.message);
  }

  // 2. 将 PDF 每一页渲染为 PNG 图片（主通道）
  try {
    // 使用 pdf-to-png-converter (使用 @napi-rs/canvas 避免 node-canvas 的 native 编译坑)
    // 限制 viewportScale: 1.5（大约 1080px 宽度），保持高清晰度并压低 Payload 体积
    const pdfPngPages = await pdfToPng(filePath, {
      viewportScale: 1.5
    });

    images = pdfPngPages.map(page => ({
      data: page.content.toString('base64'),
      mimeType: 'image/png'
    }));
  } catch (error) {
    console.error(`❌ 将 PDF 页面转换为图片时发生错误:`, error);
    throw error;
  }

  return {
    text,
    images
  };
}
