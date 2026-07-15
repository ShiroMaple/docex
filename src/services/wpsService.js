import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// docex 内部字段 key → 常见中文表头关键词（用于模糊自动匹配）
const FIELD_KEYWORDS = {
  projectName:           ['项目', '工程', '项目名', '工程名'],
  issueType:             ['类型', '隐患类型', '问题类型', '安全类型', '类别'],
  inspectionArea:        ['区域', '检查区域', '位置', '地点', '部位'],
  description:           ['描述', '问题描述', '隐患描述', '内容', '情况'],
  rectificationRequirement: ['整改', '整改要求', '整改措施', '整改内容', '要求'],
  inspector:             ['检查人', '检查人员', '巡检人', '记录人', '人员'],
  inspectionDate:        ['日期', '检查日期', '时间', '发现时间', '巡检日期'],
};

class WpsService {
  constructor() {
    this.appId = config.wps?.appId;
    this.appSecret = config.wps?.appSecret;
    this.fileId = config.wps?.baseId;
    this._tokenCache = null; // { token, expireTime, appId }
    this._schemaCache = null;
    this._schemaCacheTime = 0;
  }

  /**
   * 动态设置目标 fileId（来自用户输入的 WPS 分享链接）
   */
  setFileId(fileId) {
    if (fileId !== this.fileId) {
      this.fileId = fileId;
      this._schemaCache = null; // 清除 Schema 缓存
      this._schemaCacheTime = 0;
    }
  }

  /**
   * 从 WPS 分享链接中解析 fileId
   * 例：https://365.kdocs.cn/l/cbGbLglUXASe?R=L1MvMQ== → cbGbLglUXASe
   */
  static parseFileId(url) {
    const match = url.match(/\/l\/([^?#/]+)/);
    return match ? match[1] : url.trim();
  }

  /**
   * 获取 WPS Access Token（带缓存）
   */
  async getAccessToken(appId = null, appSecret = null) {
    const activeAppId = appId || this.appId;
    const activeAppSecret = appSecret || this.appSecret;
    const now = Date.now();

    if (this._tokenCache && this._tokenCache.appId === activeAppId && now < this._tokenCache.expireTime) {
      return this._tokenCache.token;
    }

    if (!activeAppId || !activeAppSecret) {
      throw new Error('未配置 WPS_APP_ID 或 WPS_APP_SECRET，无法获取 Access Token');
    }

    logger.info({
      event: 'WPS_GET_TOKEN_START',
      appId: activeAppId
    }, '开始获取 WPS Access Token');

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', activeAppId);
    params.append('client_secret', activeAppSecret);

    try {
      const response = await axios.post('https://openapi.wps.cn/oauth2/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const token = response.data.access_token;
      const expireTime = now + (response.data.expires_in - 300) * 1000;
      this._tokenCache = { token, expireTime, appId: activeAppId };

      logger.info({
        event: 'WPS_GET_TOKEN_SUCCESS',
        appId: activeAppId
      }, '获取 WPS Access Token 成功');

      return token;
    } catch (error) {
      logger.error({
        event: 'WPS_GET_TOKEN_ERROR',
        appId: activeAppId,
        error: { message: error.message, stack: error.stack }
      }, '获取 WPS Access Token 失败');
      throw error;
    }
  }

  /**
   * 获取多维表格 Schema（带 30 秒缓存）
   */
  async getSchema(sheetName = null, forceRefresh = false, appId = null, appSecret = null) {
    const now = Date.now();
    if (forceRefresh) {
      this._schemaCache = null;
      this._schemaCacheTime = 0;
    }
    if (this._schemaCache && (now - this._schemaCacheTime < 30000)) {
      return this._schemaCache;
    }
    if (!this.fileId) throw new Error('未设置 fileId');

    logger.info({
      event: 'WPS_GET_SCHEMA_START',
      fileId: this.fileId,
      sheetName
    }, '开始获取 WPS 多维表格 Schema');

    try {
      const token = await this.getAccessToken(appId, appSecret);
      const url = `https://openapi.wps.cn/v7/coop/dbsheet/${this.fileId}/schema`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const sheets = res.data?.data?.sheets ?? [];
      const sheet = sheetName
        ? sheets.find(s => s.name === sheetName)
        : sheets.find(s => s.sheet_type === 'xlEtDataBaseSheet');

      if (!sheet) {
        throw new Error(`未找到数据表 "${sheetName ?? '(任意数据表)'}"，请检查表名`);
      }

      this._schemaCache = sheet;
      this._schemaCacheTime = now;

      logger.info({
        event: 'WPS_GET_SCHEMA_SUCCESS',
        fileId: this.fileId,
        sheetName: sheet.name,
        fieldsCount: sheet.fields?.length
      }, '获取 WPS 多维表格 Schema 成功');

      return sheet;
    } catch (error) {
      logger.error({
        event: 'WPS_GET_SCHEMA_ERROR',
        fileId: this.fileId,
        sheetName,
        error: { message: error.message, stack: error.stack }
      }, '获取 WPS 多维表格 Schema 失败');
      throw error;
    }
  }

  /**
   * 自动构建字段映射：将 WPS 实际字段名 与 docex 内部 key 对应（排除只读系统字段）
   * @param {Array} wpsFields WPS Schema 的 fields 数组
   * @returns {Object} { wpsFieldName: docexKey }
   */
  buildAutoFieldMapping(wpsFields) {
    const mapping = {}; // wpsFieldName → docexKey
    const READ_ONLY_TYPES = ['CreatedTime', 'CreatedBy', 'Creator', 'LastModifiedTime', 'LastModifiedBy', 'Modifier'];

    for (const field of wpsFields) {
      if (READ_ONLY_TYPES.includes(field.type)) {
        continue; // 过滤掉创建时间、修改时间等只读系统字段，防止推送报错 CoreExecutionFailed
      }
      const name = field.name;
      for (const [docexKey, keywords] of Object.entries(FIELD_KEYWORDS)) {
        if (keywords.some(kw => name.includes(kw))) {
          mapping[name] = docexKey;
          break;
        }
      }
    }
    return mapping;
  }

  /**
   * 批量写入记录到 WPS 多维表格
   * @param {Array} issues 隐患数组（每项含 projectName/issueType 等 docex 字段）
   * @param {string|null} sheetName 目标表名，null 自动取第一张数据表
   * @param {Object|null} fieldMapping 自定义字段映射 { wpsFieldName: docexKey }，null 时自动推断
   */
  async appendRecords(issues, sheetName = null, fieldMapping = null, appId = null, appSecret = null) {
    if (!issues || issues.length === 0) return;
    if (!this.fileId) throw new Error('未配置 fileId，无法推送记录');

    logger.info({
      event: 'WPS_APPEND_RECORDS_START',
      fileId: this.fileId,
      sheetName,
      recordsCount: issues.length
    }, `开始批量写入 ${issues.length} 条记录至 WPS 多维表格`);

    try {
      const token = await this.getAccessToken(appId, appSecret);
      const sheet = await this.getSchema(sheetName, false, appId, appSecret);

      // 识别只读的系统字段，确保不尝试向其写入任何值
      const READ_ONLY_TYPES = ['CreatedTime', 'CreatedBy', 'Creator', 'LastModifiedTime', 'LastModifiedBy', 'Modifier'];
      const writeableFields = sheet.fields.filter(f => !READ_ONLY_TYPES.includes(f.type));
      const writeableWpsNames = new Set(writeableFields.map(f => f.name));

      // 使用用户传入的映射，或自动推断
      const resolvedMapping = fieldMapping ?? this.buildAutoFieldMapping(sheet.fields);

      // 反转映射：docexKey → wpsFieldName
      const docexToWps = {};
      for (const [wpsName, docexKey] of Object.entries(resolvedMapping)) {
        if (writeableWpsNames.has(wpsName)) {
          docexToWps[docexKey] = wpsName;
        }
      }

      const url = `https://openapi.wps.cn/v7/coop/dbsheet/${this.fileId}/sheets/${sheet.id}/records/create`;

      const records = issues.map(issue => {
        const fields = {};
        for (const [docexKey, wpsName] of Object.entries(docexToWps)) {
          if (issue[docexKey] !== undefined && issue[docexKey] !== '') {
            fields[wpsName] = issue[docexKey];
          }
        }
        return { fields_value: JSON.stringify(fields) };
      });

      const response = await axios.post(url, { prefer_id: false, records }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info({
        event: 'WPS_APPEND_RECORDS_SUCCESS',
        fileId: this.fileId,
        sheetName: sheet.name,
        recordsCount: issues.length
      }, `✨ 成功写入 ${issues.length} 条记录到 WPS 多维表格（表：${sheet.name}）`);

      return response.data;
    } catch (error) {
      logger.error({
        event: 'WPS_APPEND_RECORDS_ERROR',
        fileId: this.fileId,
        sheetName,
        error: { message: error.message, stack: error.stack }
      }, '批量写入 WPS 多维表格失败');
      throw error;
    }
  }

  /**
   * 在 WPS 多维表格中新增一列（文本类型）
   */
  async createField(fileId, fieldName, appId = null, appSecret = null) {
    logger.info({
      event: 'WPS_CREATE_FIELD_START',
      fileId,
      fieldName
    }, `开始在 WPS 多维表格中新建一列: ${fieldName}`);

    try {
      const token = await this.getAccessToken(appId, appSecret);
      const sheet = await this.getSchema(null, false, appId, appSecret);
      const url = `https://openapi.wps.cn/v7/coop/dbsheet/${fileId}/sheets/${sheet.id}/fields/create`;

      const response = await axios.post(url, {
        name: fieldName,
        type: 'Text'
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // 强行清理缓存，使下一次读取能同步到新字段
      this._schemaCache = null;
      this._schemaCacheTime = 0;

      logger.info({
        event: 'WPS_CREATE_FIELD_SUCCESS',
        fileId,
        fieldName
      }, `在 WPS 多维表格中新建列成功: ${fieldName}`);

      return response.data;
    } catch (error) {
      logger.error({
        event: 'WPS_CREATE_FIELD_ERROR',
        fileId,
        fieldName,
        error: { message: error.message, stack: error.stack }
      }, '在 WPS 多维表格中新建列失败');
      throw error;
    }
  }

  /**
   * 获取 WPS 表格最后一行的序号最大值
   */
  async getWpsLastSerialNumber(fileId, serialFieldName, appId = null, appSecret = null) {
    logger.info({
      event: 'WPS_GET_SERIAL_START',
      fileId,
      fieldName: serialFieldName
    }, `开始获取 WPS 多维表格自增序号最大值: ${serialFieldName}`);

    try {
      const token = await this.getAccessToken(appId, appSecret);
      const sheet = await this.getSchema(null, false, appId, appSecret);
      const url = `https://openapi.wps.cn/v7/coop/dbsheet/${fileId}/sheets/${sheet.id}/records`;
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 }
      });
      const records = response.data?.data?.records || [];
      if (records.length === 0) {
        logger.info({
          event: 'WPS_GET_SERIAL_EMPTY',
          fileId
        }, '表格暂无记录，自增序列号返回 0');
        return 0;
      }
      
      let maxVal = 0;
      for (const r of records) {
        try {
          const fields = JSON.parse(r.fields_value);
          const val = parseInt(fields[serialFieldName]);
          if (!isNaN(val) && val > maxVal) {
            maxVal = val;
          }
        } catch {}
      }

      logger.info({
        event: 'WPS_GET_SERIAL_SUCCESS',
        fileId,
        maxVal
      }, `获取 WPS 自增序号最大值成功: ${maxVal}`);

      return maxVal;
    } catch (e) {
      logger.warn({
        event: 'WPS_GET_SERIAL_WARNING',
        fileId,
        error: e.message
      }, 'WPS 获取最后行业务序列号失败，从 0 开始');
      return 0;
    }
  }
}

export const wpsService = new WpsService();
export default wpsService;
