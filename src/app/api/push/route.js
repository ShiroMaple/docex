import { NextResponse } from 'next/server';
import wpsService from '../../../services/wpsService.js';
import { appendToFeishu, getFeishuSchema, getFeishuLastSerialNumber } from '../../../services/feishuService.js';

export async function POST(request) {
  try {
    const { provider, fileId, appToken, tableId, issues, fieldMapping, autoNumber, appId, appSecret } = await request.json();

    if (!issues || issues.length === 0) {
      return NextResponse.json({ error: '没有需要推送的记录' }, { status: 400 });
    }

    const targetProvider = provider || 'wps';
    const resolvedMapping = { ...fieldMapping };
    const modifiedIssues = issues.map(item => ({ ...item }));

    // ── 自动编号逻辑 ──
    if (autoNumber) {
      let serialFieldName = null;

      // 1. 获取目标表的字段，检索是否存在“序号”列
      try {
        if (targetProvider === 'wps' && fileId) {
          wpsService.setFileId(fileId);
          const sheet = await wpsService.getSchema(null, false, appId, appSecret);
          const serialField = sheet.fields.find(f => 
            ['序号', 'no', 'no.', 'id', 'index'].includes(f.name.toLowerCase())
          );
          if (serialField) serialFieldName = serialField.name;
        } else if (targetProvider === 'feishu' && appToken && tableId) {
          const sheet = await getFeishuSchema(appToken, tableId, appId, appSecret);
          const serialField = sheet.fields.find(f => 
            ['序号', 'no', 'no.', 'id', 'index'].includes(f.name.toLowerCase())
          );
          if (serialField) serialFieldName = serialField.name;
        }
      } catch (e) {
        console.warn('获取自动编号字段失败，跳过自增:', e.message);
      }

      // 2. 如果存在“序号”列，获取最新值并自动编号
      if (serialFieldName) {
        let lastNum = 0;
        try {
          if (targetProvider === 'wps' && fileId) {
            lastNum = await wpsService.getWpsLastSerialNumber(fileId, serialFieldName, appId, appSecret);
          } else if (targetProvider === 'feishu' && appToken && tableId) {
            lastNum = await getFeishuLastSerialNumber(appToken, tableId, serialFieldName, appId, appSecret);
          }
        } catch (e) {
          console.warn('查询最后一行序号值出错，从0开始自增:', e.message);
        }

        // 为每行分配新编号并绑定映射
        modifiedIssues.forEach((issue, idx) => {
          const nextVal = lastNum + idx + 1;
          // 新增一个内部自增字段 key 'autoSerialVal'
          issue['autoSerialVal'] = String(nextVal);
        });

        // 强行插入列名映射
        resolvedMapping[serialFieldName] = 'autoSerialVal';
        console.log(`ℹ️ [自动编号] 激活，自动匹配表格列 "${serialFieldName}"，起始编号: ${lastNum + 1}`);
      }
    }

    // ── 执行数据追加 ──
    if (targetProvider === 'wps') {
      if (!fileId) return NextResponse.json({ error: '缺少 fileId' }, { status: 400 });
      wpsService.setFileId(fileId);
      const result = await wpsService.appendRecords(modifiedIssues, null, resolvedMapping, appId, appSecret);
      return NextResponse.json({ success: true, insertedCount: issues.length, result });

    } else if (targetProvider === 'feishu') {
      if (!appToken || !tableId) {
        return NextResponse.json({ error: '缺少 appToken 或 tableId' }, { status: 400 });
      }
      const result = await appendToFeishu(modifiedIssues, appToken, tableId, resolvedMapping, appId, appSecret);
      return NextResponse.json({ success: true, insertedCount: issues.length, result });

    } else {
      return NextResponse.json({ error: '不支持的 provider' }, { status: 400 });
    }

  } catch (err) {
    console.error('❌ 推送数据到多维表格失败:', err);
    const detailMsg = err.response?.data?.msg || err.response?.data?.message || err.message;
    return NextResponse.json({ error: detailMsg }, { status: 500 });
  }
}
