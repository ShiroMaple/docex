import mammoth from 'mammoth';

/**
 * 从 Word (.docx) 文件中提取纯文本内容
 * @param {string} filePath - docx 文件绝对路径
 * @returns {Promise<string>} 提取出的文本内容
 */
export async function extractDocxText(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    // result.value 包含提取的纯文本
    // result.messages 包含解析中的警告信息
    return result.value;
  } catch (error) {
    console.error(`❌ 解析 Word (docx) 文件失败: ${filePath}`, error);
    throw error;
  }
}
