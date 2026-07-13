import { NextResponse } from 'next/server';
import wpsService from '../../../services/wpsService.js';
import { getFeishuSchema } from '../../../services/feishuService.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider')?.trim() || 'wps';
  const force = searchParams.get('force') === 'true';

  try {
    if (provider === 'wps') {
      const fileId = searchParams.get('fileId')?.trim();
      if (!fileId) {
        return NextResponse.json({ error: '缺少 fileId 参数' }, { status: 400 });
      }
      
      wpsService.setFileId(fileId);
      const sheet = await wpsService.getSchema(null, force);
      const fields = sheet.fields.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        isReadOnly: ['CreatedTime', 'CreatedBy', 'Creator', 'LastModifiedTime', 'LastModifiedBy', 'Modifier'].includes(f.type)
      }));
      return NextResponse.json({ sheetName: sheet.name, fields });

    } else if (provider === 'feishu') {
      const appToken = searchParams.get('appToken')?.trim();
      const tableId = searchParams.get('tableId')?.trim();
      if (!appToken || !tableId) {
        return NextResponse.json({ error: '缺少 appToken 或 tableId 参数' }, { status: 400 });
      }
      
      const sheet = await getFeishuSchema(appToken, tableId);
      return NextResponse.json({ sheetName: sheet.name, fields: sheet.fields });

    } else {
      return NextResponse.json({ error: '不支持的 provider' }, { status: 400 });
    }
  } catch (err) {
    console.error('获取 Schema 失败:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
