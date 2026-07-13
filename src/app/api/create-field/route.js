import { NextResponse } from 'next/server';
import { createFeishuField } from '../../../services/feishuService.js';
import wpsService from '../../../services/wpsService.js';

/**
 * 动态在多维表格中新建一列
 */
export async function POST(request) {
  try {
    const { provider, fileId, appToken, tableId, fieldName } = await request.json();

    if (!fieldName) {
      return NextResponse.json({ error: '列名 (fieldName) 不能为空' }, { status: 400 });
    }

    if (provider === 'wps') {
      if (!fileId) return NextResponse.json({ error: '缺少 fileId' }, { status: 400 });
      wpsService.setFileId(fileId);
      const result = await wpsService.createField(fileId, fieldName);
      return NextResponse.json({ success: true, provider: 'wps', result });

    } else if (provider === 'feishu') {
      if (!appToken || !tableId) {
        return NextResponse.json({ error: '缺少 appToken 或 tableId' }, { status: 400 });
      }
      const result = await createFeishuField(appToken, tableId, fieldName);
      return NextResponse.json({ success: true, provider: 'feishu', result });

    } else {
      return NextResponse.json({ error: '不支持的 provider' }, { status: 400 });
    }

  } catch (err) {
    console.error('新建多维表格字段失败:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
