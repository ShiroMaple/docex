import { NextResponse } from 'next/server';
import { getAllPresetsList } from '../../../config/presets.js';
import { withLogging, logger } from '../../../lib/logger.js';

/**
 * GET /api/presets
 * 获取物理磁盘 presets/ 目录下所有已注册的预设列表信息
 */
async function getAllPresetsHandler() {
  try {
    const list = getAllPresetsList();
    logger.info({
      event: 'PRESETS_LIST_LOADED',
      count: list.length
    }, `成功加载物理预设列表，共 ${list.length} 个`);

    return NextResponse.json({ presets: list });
  } catch (err) {
    logger.error({
      event: 'GET_PRESETS_LIST_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '获取预设列表失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withLogging(getAllPresetsHandler);
