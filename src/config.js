import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 确保在加载配置之前初始化 dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  llmProvider: process.env.LLM_PROVIDER || 'google',

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    baseUrl: process.env.GEMINI_BASE_URL,
  },

  lark: {
    appId: process.env.LARK_APP_ID,
    appSecret: process.env.LARK_APP_SECRET,
    appToken: process.env.LARK_APP_TOKEN,
    tableId: process.env.LARK_TABLE_ID,
  },

  paths: {
    inputDir: path.resolve(__dirname, '../data/input'),
    outputDir: path.resolve(__dirname, '../data/output'),
  }
};

// 基础校验
if (config.llmProvider === 'google' && !config.gemini.apiKey) {
  console.warn('⚠️ 警告: 未检测到 GEMINI_API_KEY 环境变量');
} else if (config.llmProvider === 'openai' && !config.openai.apiKey) {
  console.warn('⚠️ 警告: 未检测到 OPENAI_API_KEY 环境变量');
}
