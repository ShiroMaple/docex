import { NextResponse } from 'next/server';
import { getFileRecord } from '../../../../../lib/db.js';

/**
 * 轮询接口：获取特定 MD5 文件的预处理状态与进度
 */
export async function GET(request, context) {
  try {
    const params = await context.params;
    const md5 = params.md5;

    if (!md5) {
      return NextResponse.json({ error: '缺少 md5 参数' }, { status: 400 });
    }

    const record = await getFileRecord(md5);
    if (!record) {
      return NextResponse.json({ error: '未找到该 MD5 的记录' }, { status: 404 });
    }

    return NextResponse.json({
      status: record.status,
      progress: record.progress,
      error: record.error,
      fileName: record.fileName
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
