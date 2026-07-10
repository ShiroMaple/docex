import axios from 'axios';
import { config } from '../config.js';

/**
 * 获取飞书 Tenant Access Token
 * @returns {Promise<string>} Token 字符串
 */
async function getLarkTenantToken() {
  const { appId, appSecret } = config.lark;
  
  if (!appId || !appSecret) {
    throw new Error('未配置 LARK_APP_ID 或 LARK_APP_SECRET');
  }

  const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: appId,
    app_secret: appSecret
  });

  if (response.data.code !== 0) {
    throw new Error(`获取飞书 Token 失败: ${response.data.msg}`);
  }

  return response.data.tenant_access_token;
}

/**
 * 将安全隐患数据追加到飞书多维表格中
 * @param {Array<object>} issues - 安全隐患列表 (SafetyIssue 数组)
 * @returns {Promise<void>}
 */
export async function appendToTable(issues) {
  const { appToken, tableId } = config.lark;

  // 如果没有配置飞书凭证，则采用 Mock 模式输出，方便本地调试
  if (!appToken || !tableId || !config.lark.appId || !config.lark.appSecret) {
    console.log('\n================ [模拟多维表格追加] ================');
    console.log('💡 提示: 检测到未配置飞书 API 环境变量，已进入 Mock 输出模式。');
    console.log(`准备追加 ${issues.length} 条记录：`);
    issues.forEach((issue, index) => {
      console.log(`\n[记录 #${index + 1}]`);
      console.log(`  🏢 项目名称: ${issue.projectName}`);
      console.log(`  🏷️ 问题类型: ${issue.issueType}`);
      console.log(`  📍 检查区域: ${issue.inspectionArea}`);
      console.log(`  📝 问题描述: ${issue.description}`);
      console.log(`  🔧 整改要求: ${issue.rectificationRequirement}`);
      console.log(`  👷 检查人员: ${issue.inspector}`);
      console.log(`  📅 检查日期: ${issue.inspectionDate}`);
    });
    console.log('===================================================\n');
    return;
  }

  try {
    const tenantToken = await getLarkTenantToken();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;
    
    // 映射 Zod schema 字段到飞书多维表格列名（可根据实际表格列名调整）
    const records = issues.map(issue => ({
      fields: {
        '项目名称': issue.projectName,
        '问题类型': issue.issueType,
        '检查区域': issue.inspectionArea,
        '问题描述': issue.description,
        '整改要求': issue.rectificationRequirement,
        '检查人员': issue.inspector,
        '检查日期': issue.inspectionDate
      }
    }));

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
      console.log(`✨ 成功将 ${issues.length} 条安全隐患数据追加到飞书多维表格！`);
    } else {
      throw new Error(`追加飞书数据失败: [${response.data.code}] ${response.data.msg}`);
    }
  } catch (error) {
    console.error('❌ 追加多维表格数据时发生异常:', error.message);
    throw error;
  }
}
