import mammoth from 'mammoth';

/**
 * 从 Word (.docx) 文件中提取图文交织的零件数组
 * @param {string} filePath - docx 文件绝对路径
 * @returns {Promise<Array<{type: string, text?: string, data?: string, mimeType?: string}>>}
 */
export async function extractDocxText(filePath) {
  try {
    // 默认情况下，mammoth.convertToHtml 会将内嵌图片转换为 <img src="data:image/png;base64,..."> 标签
    const result = await mammoth.convertToHtml({ path: filePath });
    const html = result.value;

    // 解析 HTML 为图文交织数组，确保图片和文字的先后物理顺序不变
    return parseHtmlToMultimodalParts(html);
  } catch (error) {
    console.error(`❌ 解析 Word (docx) 文件并提取多模态内容失败: ${filePath}`, error);
    throw error;
  }
}

/**
 * 将 HTML 字符串解析为图文交织的结构化数组
 * @param {string} html - mammoth 生成的 HTML
 * @returns {Array<object>}
 */
function parseHtmlToMultimodalParts(html) {
  const parts = [];
  
  // 匹配带 base64 数据的 <img> 标签的正则表达式
  const imgRegex = /<img[^>]+src=["']data:([^;]+);base64,([^"']+)["'][^>]*>/gi;
  
  let lastIndex = 0;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    // 提取图片之前的 HTML 文本内容
    const textBefore = html.substring(lastIndex, match.index).trim();
    if (textBefore) {
      parts.push({
        type: 'text',
        text: textBefore
      });
    }

    // 提取图片的 mimeType 和 base64 数据
    const mimeType = match[1]; // e.g. "image/png"
    const base64Data = match[2];

    parts.push({
      type: 'image',
      data: base64Data,
      mimeType: mimeType
    });

    lastIndex = imgRegex.lastIndex;
  }

  // 提取剩余的 HTML 文本内容
  const textAfter = html.substring(lastIndex).trim();
  if (textAfter) {
    parts.push({
      type: 'text',
      text: textAfter
    });
  }

  return parts;
}
