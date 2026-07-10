import axios from 'axios';
import { config } from '../config.js';

class WpsService {
  constructor() {
    this.appId = config.wps?.appId;
    this.appSecret = config.wps?.appSecret;
    this.fileId = config.wps?.baseId; // 环境变量 WPS_BASE_ID 存的就是 file_id (分享码)
    this.accessToken = null;
    this.tokenExpireTime = 0;
    // Schema 缓存：避免每次都重新拉取
    this._schemaCache = null;
  }

  /**
   * 获取 WPS 开放平台的 Access Token (带本地缓存优化)
   */
  async getAccessToken() {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpireTime) {
      return this.accessToken;
    }

    if (!this.appId || !this.appSecret) {
      throw new Error('未配置 WPS_APP_ID 或 WPS_APP_SECRET，无法获取 Access Token');
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.appId);
    params.append('client_secret', this.appSecret);

    const response = await axios.post('https://openapi.wps.cn/oauth2/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    this.accessToken = response.data.access_token;
    // 提前 5 分钟过期，确保安全高并发
    this.tokenExpireTime = now + (response.data.expires_in - 300) * 1000;
    return this.accessToken;
  }

  /**
   * 获取多维表格 Schema，找到目标表的 sheet_id 和字段列表
   * @param {string} sheetName 目标数据表名，默认取第一张数据表
   */
  async getSchema(sheetName = null) {
    if (this._schemaCache) return this._schemaCache;

    const token = await this.getAccessToken();
    const url = `https://openapi.wps.cn/v7/coop/dbsheet/${this.fileId}/schema`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const sheets = res.data?.data?.sheets ?? [];
    // 找到目标 sheet（非 Dashboard 类型）
    const sheet = sheetName
      ? sheets.find(s => s.name === sheetName)
      : sheets.find(s => s.sheet_type === 'xlEtDataBaseSheet');

    if (!sheet) throw new Error(`未找到数据表 "${sheetName ?? '(任意数据表)'}"，请检查表名`);

    this._schemaCache = sheet;
    return sheet;
  }

  /**
   * 批量向 WPS 多维表格追加记录
   * @param {Array} issues Zod 校验通过的隐患数组
   * @param {string} sheetName 目标表名，不传则自动取第一张数据表
   */
  async appendRecords(issues, sheetName = null) {
    if (!issues || issues.length === 0) return;
    if (!this.fileId) throw new Error('未配置 WPS_BASE_ID，无法推送记录');

    const token = await this.getAccessToken();
    const sheet = await this.getSchema(sheetName);

    // 构建字段名到字段 id 的映射表，用于将来按 id 写入
    const fieldMap = {};
    for (const f of sheet.fields) {
      fieldMap[f.name] = f.id;
    }

    const url = `https://openapi.wps.cn/v7/coop/dbsheet/${this.fileId}/sheets/${sheet.id}/records/create`;

    // 将 docex 隐患结构映射为多维表格字段名，以 JSON 字符串写入
    const records = issues.map(issue => ({
      fields_value: JSON.stringify({
        '项目名称': issue.projectName,
        '问题类型': issue.issueType,
        '检查区域': issue.inspectionArea,
        '问题描述': issue.description,
        '整改要求': issue.rectificationRequirement,
        '检查人员': issue.inspector,
        '检查日期': issue.inspectionDate
      })
    }));

    const response = await axios.post(url, { prefer_id: false, records }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✨ 成功将 ${issues.length} 条安全隐患数据写入 WPS 多维表格（表：${sheet.name}）`);
    return response.data;
  }
}

export const wpsService = new WpsService();
export default wpsService;
