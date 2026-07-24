import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const PRESETS_DIR = path.resolve(process.cwd(), 'presets');

/**
 * 确认 presets 物理目录存在，若不存在则创建
 */
function ensurePresetsDir() {
  try {
    if (!fs.existsSync(PRESETS_DIR)) {
      fs.mkdirSync(PRESETS_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('无法创建 presets 目录:', e);
  }
}

/**
 * 从物理磁盘Presets目录动态加载 ${id}.json 文件内容
 * @param {string} id 预设标识（如 'default', 'hse'）
 * @returns {object|null}
 */
export function loadRawPresetFromDisk(id) {
  ensurePresetsDir();
  const filePath = path.join(PRESETS_DIR, `${id}.json`);

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`读取预设物理文件 [${filePath}] 失败:`, e);
  }

  return null;
}

/**
 * 获取经过物理 JSON 动态加载及 .env 变量强力合并后的完整预设对象
 * @param {string} id 预设标识（如 'hse'）
 * @returns {object|null}
 */
export function getResolvedPreset(id) {
  const targetId = id || 'default';
  const rawPreset = loadRawPresetFromDisk(targetId);

  if (!rawPreset) {
    return null;
  }

  const prefix = targetId.toUpperCase();

  // 读取与合并大模型 API 凭证 (格式如 HSE_OPENAI_API_KEY，无配置则自动回退至通用 OPENAI_API_KEY)
  const provider = process.env[`${prefix}_LLM_PROVIDER`] || process.env.LLM_PROVIDER || config.llmProvider || 'openai';
  const openai = {
    apiKey: process.env[`${prefix}_OPENAI_API_KEY`] || process.env.OPENAI_API_KEY || config.openai.apiKey || '',
    baseUrl: process.env[`${prefix}_OPENAI_BASE_URL`] || process.env.OPENAI_BASE_URL || config.openai.baseUrl || 'https://api.openai.com/v1',
    model: process.env[`${prefix}_OPENAI_MODEL`] || process.env.OPENAI_MODEL || config.openai.model || 'gpt-4o-mini'
  };

  // 读取与合并多维表格凭证 (格式如 HSE_LARK_APP_TOKEN，无配置则自动回退至通用 LARK_APP_TOKEN)
  const lark = {
    appId: process.env[`${prefix}_LARK_APP_ID`] || process.env.LARK_APP_ID || config.lark.appId || '',
    appSecret: process.env[`${prefix}_LARK_APP_SECRET`] || process.env.LARK_APP_SECRET || config.lark.appSecret || '',
    appToken: process.env[`${prefix}_LARK_APP_TOKEN`] || process.env.LARK_APP_TOKEN || config.lark.appToken || '',
    tableId: process.env[`${prefix}_LARK_TABLE_ID`] || process.env.LARK_TABLE_ID || config.lark.tableId || ''
  };

  const wps = {
    appId: process.env[`${prefix}_WPS_APP_ID`] || process.env.WPS_APP_ID || config.wps.appId || '',
    appSecret: process.env[`${prefix}_WPS_APP_SECRET`] || process.env.WPS_APP_SECRET || config.wps.appSecret || '',
    baseId: process.env[`${prefix}_WPS_BASE_ID`] || process.env.WPS_BASE_ID || config.wps.baseId || ''
  };

  const platform = process.env[`${prefix}_TABLE_PLATFORM`] || (lark.appToken && lark.tableId ? 'feishu' : 'wps');

  return {
    ...rawPreset,
    llmProvider: provider,
    openai,
    lark,
    wps,
    platform
  };
}

/**
 * 获取物理 presets/ 目录下所有已注册的预设摘要列表（用于界面版本切换下拉菜单动态渲染）
 */
export function getAllPresetsList() {
  ensurePresetsDir();
  const list = [];

  try {
    const files = fs.readdirSync(PRESETS_DIR);
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('template')) {
        const id = path.basename(file, '.json');
        const raw = loadRawPresetFromDisk(id);
        if (raw) {
          list.push({
            id: raw.id || id,
            name: raw.name || `${id} 预设`,
            department: raw.department || id,
            subtitle: raw.subtitle || '',
            badgeText: raw.badgeText || raw.name,
            icon: raw.icon || (id === 'default' ? '🌐' : '⚙️'),
            locked: Boolean(raw.locked)
          });
        }
      }
    }
  } catch (e) {
    console.error('获取预设文件列表失败:', e);
  }

  return list;
}

/**
 * 客户端安全版本的预设导出一览
 */
export function getSafePresetForClient(id) {
  const resolved = getResolvedPreset(id);
  if (!resolved) return null;

  return {
    id: resolved.id,
    name: resolved.name,
    department: resolved.department,
    subtitle: resolved.subtitle,
    badgeText: resolved.badgeText,
    icon: resolved.icon || (resolved.id === 'default' ? '🌐' : '⚙️'),
    locked: resolved.locked,
    allowCustomModel: resolved.allowCustomModel,
    allowCustomPlatform: resolved.allowCustomPlatform,
    allowCustomFields: resolved.allowCustomFields,
    allowCustomPrompt: resolved.allowCustomPrompt,
    systemPrompt: resolved.systemPrompt,
    userPrompt: resolved.userPrompt,
    fields: resolved.fields,
    fieldMapping: resolved.fieldMapping,
    platform: resolved.platform,
    llmConfig: {
      provider: resolved.llmProvider,
      baseUrl: resolved.openai.baseUrl,
      model: resolved.openai.model,
      hasApiKey: Boolean(resolved.openai.apiKey)
    },
    tableConfig: {
      platform: resolved.platform,
      hasLarkConfig: Boolean(resolved.lark.appToken && resolved.lark.tableId),
      hasWpsConfig: Boolean(resolved.wps.baseId)
    }
  };
}
