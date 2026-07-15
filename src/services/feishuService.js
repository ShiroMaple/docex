import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

/**
 * 获取飞书 Tenant Access Token
 * @returns {Promise<string>} Token 字符串
 */
async function getLarkTenantToken(appId = null, appSecret = null) {
  const activeAppId = appId || config.lark.appId;
  const activeAppSecret = appSecret || config.lark.appSecret;
  
  if (!activeAppId || !activeAppSecret) {
    throw new Error('未配置 LARK_APP_ID 或 LARK_APP_SECRET');
  }

  logger.info({
    event: 'FEISHU_GET_TOKEN_START',
    appId: activeAppId
  }, '开始获取飞书 Tenant Access Token');

  try {
    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: activeAppId,
      app_secret: activeAppSecret
    });

    if (response.data.code !== 0) {
      logger.error({
        event: 'FEISHU_GET_TOKEN_ERROR',
        appId: activeAppId,
        errorMsg: response.data.msg
      }, `获取飞书 Token 失败: ${response.data.msg}`);
      throw new Error(`获取飞书 Token 失败: ${response.data.msg}`);
    }

    logger.info({
      event: 'FEISHU_GET_TOKEN_SUCCESS',
      appId: activeAppId
    }, '获取飞书 Tenant Access Token 成功');

    return response.data.tenant_access_token;
  } catch (error) {
    logger.error({
      event: 'FEISHU_GET_TOKEN_EXCEPTION',
      appId: activeAppId,
      error: { message: error.message, stack: error.stack }
    }, '获取飞书 Token 发生网络或底层异常');
    throw error;
  }
}

/**
 * 解析飞书 Wiki Token 为实际的多维表格 App Token
 */
async function resolveFeishuAppToken(token, appId = null, appSecret = null) {
  if (!token) return token;
  if (token.startsWith('wik')) {
    logger.info({
      event: 'FEISHU_RESOLVE_WIKI_START',
      wikiToken: token
    }, '开始解析飞书 Wiki Token');

    try {
      const tenantToken = await getLarkTenantToken(appId, appSecret);
      const url = `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${token}`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${tenantToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      });
      if (response.data.code !== 0) {
        logger.error({
          event: 'FEISHU_RESOLVE_WIKI_ERROR',
          wikiToken: token,
          errorMsg: response.data.msg
        }, `解析知识库多维表格失败: ${response.data.msg}`);
        throw new Error(`解析知识库多维表格失败: ${response.data.msg}`);
      }
      const node = response.data.data?.node;
      if (!node || node.obj_type !== 'bitable') {
        throw new Error('指定的知识库文档不是多维表格类型');
      }

      logger.info({
        event: 'FEISHU_RESOLVE_WIKI_SUCCESS',
        wikiToken: token,
        appToken: node.obj_token
      }, '解析知识库多维表格成功');

      return node.obj_token;
    } catch (error) {
      logger.error({
        event: 'FEISHU_RESOLVE_WIKI_EXCEPTION',
        wikiToken: token,
        error: { message: error.message, stack: error.stack }
      }, '解析飞书 Wiki Token 发生异常');
      throw error;
    }
  }
  return token;
}

const FIELD_KEYWORDS = {
  projectName:           ['项目', '工程', '项目名', '工程名'],
  issueType:             ['类型', '隐患类型', '问题类型', '安全类型', '类别'],
  inspectionArea:        ['区域', '检查区域', '位置', '地点', '部位'],
  description:           ['描述', '问题描述', '隐患描述', '内容', '情况'],
  rectificationRequirement: ['整改', '整改要求', '整改措施', '整改内容', '要求'],
  inspector:             ['检查人', '检查人员', '巡检人', '记录人', '人员'],
  inspectionDate:        ['日期', '检查日期', '时间', '发现时间', '巡检日期'],
};

function buildAutoFieldMapping(feishuFields) {
  const mapping = {};
  for (const field of feishuFields) {
    if (field.isReadOnly) continue;
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
 * 获取飞书多维表格 Schema
 * @param {string} appToken 
 * @param {string} tableId 
 * @returns {Promise<object>} { name: string, fields: Array<{id, name, type, isReadOnly}> }
 */
export async function getFeishuSchema(appToken, tableId, appId = null, appSecret = null) {
  logger.info({
    event: 'FEISHU_GET_SCHEMA_START',
    appToken,
    tableId
  }, '开始获取飞书多维表格 Schema');

  try {
    const resolvedAppToken = await resolveFeishuAppToken(appToken, appId, appSecret);
    const token = await getLarkTenantToken(appId, appSecret);
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${resolvedAppToken}/tables/${tableId}/fields`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

    if (response.data.code !== 0) {
      logger.error({
        event: 'FEISHU_GET_SCHEMA_ERROR',
        appToken,
        tableId,
        errorMsg: response.data.msg
      }, `获取飞书 Schema 失败: ${response.data.msg}`);
      throw new Error(`获取飞书 Schema 失败: ${response.data.msg}`);
    }

    const items = response.data.data?.items ?? [];
    const READ_ONLY_TYPES = [1001, 1002, 1003, 1004, 1005];

    const fields = items.map(item => ({
      id: item.field_id,
      name: item.field_name,
      type: item.type,
      isReadOnly: READ_ONLY_TYPES.includes(item.type)
    }));

    logger.info({
      event: 'FEISHU_GET_SCHEMA_SUCCESS',
      appToken,
      tableId,
      fieldsCount: fields.length
    }, '获取飞书多维表格 Schema 成功');

    return {
      name: '数据表',
      fields
    };
  } catch (error) {
    logger.error({
      event: 'FEISHU_GET_SCHEMA_EXCEPTION',
      appToken,
      tableId,
      error: { message: error.message, stack: error.stack }
    }, '获取飞书 Schema 发生异常');
    throw error;
  }
}

/**
 * 将安全隐患数据追加到飞书多维表格中
 * @param {Array<object>} issues - 安全隐患列表
 * @param {string} appToken - 飞书应用 Token
 * @param {string} tableId - 飞书表格 ID
 * @param {object|null} fieldMapping - 自定义映射 { wpsFieldName: docexKey }
 */
export async function appendToFeishu(issues, appToken, tableId, fieldMapping = null, appId = null, appSecret = null) {
  if (!issues || issues.length === 0) return;
  
  logger.info({
    event: 'FEISHU_APPEND_RECORDS_START',
    appToken,
    tableId,
    recordsCount: issues.length
  }, `开始追加 ${issues.length} 条记录至飞书多维表格`);

  try {
    const resolvedAppToken = await resolveFeishuAppToken(appToken, appId, appSecret);
    const tenantToken = await getLarkTenantToken(appId, appSecret);
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${resolvedAppToken}/tables/${tableId}/records/batch_create`;
    
    // 获取字段结构
    const schema = await getFeishuSchema(appToken, tableId, appId, appSecret);
    const writeableFields = schema.fields.filter(f => !f.isReadOnly);
    const writeableNames = new Set(writeableFields.map(f => f.name));

    // 映射关系
    const resolvedMapping = fieldMapping ?? buildAutoFieldMapping(schema.fields);

    // 反转映射
    const docexToFeishu = {};
    for (const [feishuName, docexKey] of Object.entries(resolvedMapping)) {
      if (writeableNames.has(feishuName)) {
        docexToFeishu[docexKey] = feishuName;
      }
    }

    const records = issues.map(issue => {
      const fields = {};
      for (const [docexKey, feishuName] of Object.entries(docexToFeishu)) {
        if (issue[docexKey] !== undefined && issue[docexKey] !== '') {
          // 转换日期字段类型为时间戳（如果是飞书的日期字段类型，虽然传字符串也可以，但传时间戳更稳定）
          const schemaField = writeableFields.find(f => f.name === feishuName);
          if (schemaField && schemaField.type === 5 && typeof issue[docexKey] === 'string') {
            const timestamp = Date.parse(issue[docexKey]);
            if (!isNaN(timestamp)) {
              fields[feishuName] = timestamp;
              continue;
            }
          }
          fields[feishuName] = issue[docexKey];
        }
      }
      return { fields };
    });

    const response = await axios.post(
      url,
      { records },
      {
        headers: {
          'Authorization': `Bearer ${tenantToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      logger.info({
        event: 'FEISHU_APPEND_RECORDS_SUCCESS',
        appToken,
        tableId,
        recordsCount: issues.length
      }, `✨ 成功将 ${issues.length} 条数据追加到飞书多维表格！`);
      return response.data;
    } else {
      logger.error({
        event: 'FEISHU_APPEND_RECORDS_ERROR',
        appToken,
        tableId,
        errorCode: response.data.code,
        errorMsg: response.data.msg
      }, `追加飞书数据失败: [${response.data.code}] ${response.data.msg}`);
      throw new Error(`追加飞书数据失败: [${response.data.code}] ${response.data.msg}`);
    }
  } catch (error) {
    logger.error({
      event: 'FEISHU_APPEND_RECORDS_EXCEPTION',
      appToken,
      tableId,
      error: { message: error.message, stack: error.stack }
    }, '追加飞书数据发生异常');
    throw error;
  }
}

/**
 * 兼容旧版的全局追加方法，直接读取本地 config
 */
export async function appendToTable(issues) {
  const { appToken, tableId } = config.lark;

  if (!appToken || !tableId || !config.lark.appId || !config.lark.appSecret) {
    logger.info({
      event: 'FEISHU_MOCK_APPEND_RECORDS',
      recordsCount: issues.length
    }, '💡 提示: 检测到未配置飞书 API 环境变量，已进入 Mock 输出模式。');
    return;
  }

  return appendToFeishu(issues, appToken, tableId, null);
}

/**
 * 在飞书多维表格中新增一列（文本类型）
 */
export async function createFeishuField(appToken, tableId, fieldName, appId = null, appSecret = null) {
  logger.info({
    event: 'FEISHU_CREATE_FIELD_START',
    appToken,
    tableId,
    fieldName
  }, `开始在飞书多维表格中新建一列: ${fieldName}`);

  try {
    const resolvedAppToken = await resolveFeishuAppToken(appToken, appId, appSecret);
    const token = await getLarkTenantToken(appId, appSecret);
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${resolvedAppToken}/tables/${tableId}/fields`;
    const response = await axios.post(url, {
      field_name: fieldName,
      type: 1 // 1 = 文本
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

    if (response.data.code !== 0) {
      logger.error({
        event: 'FEISHU_CREATE_FIELD_ERROR',
        appToken,
        tableId,
        fieldName,
        errorMsg: response.data.msg
      }, `创建飞书列失败: ${response.data.msg}`);
      throw new Error(`创建飞书列失败: ${response.data.msg}`);
    }

    logger.info({
      event: 'FEISHU_CREATE_FIELD_SUCCESS',
      appToken,
      tableId,
      fieldName
    }, `创建飞书列成功: ${fieldName}`);

    return response.data;
  } catch (error) {
    logger.error({
      event: 'FEISHU_CREATE_FIELD_EXCEPTION',
      appToken,
      tableId,
      fieldName,
      error: { message: error.message, stack: error.stack }
    }, '创建飞书列发生异常');
    throw error;
  }
}

/**
 * 获取飞书表格最后一行的序号最大值
 */
export async function getFeishuLastSerialNumber(appToken, tableId, serialFieldName, appId = null, appSecret = null) {
  logger.info({
    event: 'FEISHU_GET_SERIAL_START',
    appToken,
    tableId,
    fieldName: serialFieldName
  }, `开始获取飞书多维表格自增序号最大值: ${serialFieldName}`);

  try {
    const resolvedAppToken = await resolveFeishuAppToken(appToken, appId, appSecret);
    const token = await getLarkTenantToken(appId, appSecret);
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${resolvedAppToken}/tables/${tableId}/records`;
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page_size: 100 }
    });
    const items = response.data?.data?.items || [];
    if (items.length === 0) {
      logger.info({
        event: 'FEISHU_GET_SERIAL_EMPTY',
        appToken,
        tableId
      }, '表格暂无记录，自增序列号返回 0');
      return 0;
    }
    
    let maxVal = 0;
    for (const item of items) {
      const val = parseInt(item.fields[serialFieldName]);
      if (!isNaN(val) && val > maxVal) {
        maxVal = val;
      }
    }

    logger.info({
      event: 'FEISHU_GET_SERIAL_SUCCESS',
      appToken,
      tableId,
      maxVal
    }, `获取飞书自增序号最大值成功: ${maxVal}`);

    return maxVal;
  } catch (e) {
    logger.warn({
      event: 'FEISHU_GET_SERIAL_WARNING',
      appToken,
      tableId,
      error: e.message
    }, '飞书获取最后一行序号失败，默认从 0 开始');
    return 0;
  }
}
