import { NextResponse } from 'next/server';
import { readDb, deleteFileRecord } from '../../../lib/db.js';
import { withLogging, logger } from '../../../lib/logger.js';

/**
 * 获取所有文件解析历史列表
 */
async function getFilesHandler() {
  try {
    const db = await readDb();
    // 按照上传时间倒序返回，最新的在前面
    const files = [...db.files].sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
    return NextResponse.json({ files });
  } catch (err) {
    logger.error({
      event: 'GET_FILES_HANDLER_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '获取文件列表失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * 手动删除特定 MD5 记录及物理文件
 */
async function deleteFileHandler(request) {
  try {
    const { searchParams } = new URL(request.url);
    const md5 = searchParams.get('md5');

    if (!md5) {
      return NextResponse.json({ error: '缺少 md5 参数' }, { status: 400 });
    }

    const success = await deleteFileRecord(md5);
    if (!success) {
      return NextResponse.json({ error: '未找到该 MD5 记录' }, { status: 404 });
    }

    logger.info({ event: 'FILE_RECORD_DELETED', md5 }, `手动删除特定 MD5 记录及物理文件成功: ${md5}`);
    return NextResponse.json({ success: true, message: '记录已成功清理' });
  } catch (err) {
    logger.error({
      event: 'DELETE_FILE_HANDLER_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '删除文件记录失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withLogging(getFilesHandler);
export const DELETE = withLogging(deleteFileHandler);
