import { NextResponse } from 'next/server';
import { getResolvedPreset, getSafePresetForClient } from '../../../../config/presets.js';
import { withLogging, logger } from '../../../../lib/logger.js';

/**
 * GET /api/presets/[id]
 * 获取特定 ID 的预设完整配置（服务端合并 .env 之后）
 */
async function getPresetHandler(request, context) {
  try {
    const params = await context.params;
    const presetId = params.id;

    if (!presetId) {
      return NextResponse.json({ error: '缺少 presetId 参数' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const safeOnly = searchParams.get('safe') === 'true';

    if (safeOnly) {
      const safePreset = getSafePresetForClient(presetId);
      if (!safePreset) {
        return NextResponse.json({ error: `未找到预设 [${presetId}]` }, { status: 404 });
      }
      return NextResponse.json({ preset: safePreset });
    }

    const resolvedPreset = getResolvedPreset(presetId);
    if (!resolvedPreset) {
      return NextResponse.json({ error: `未找到预设 [${presetId}]` }, { status: 404 });
    }

    logger.info({
      event: 'PRESET_LOADED',
      presetId,
      department: resolvedPreset.department
    }, `加载预设配置成功: ${resolvedPreset.name}`);

    return NextResponse.json({ preset: resolvedPreset });

  } catch (err) {
    logger.error({
      event: 'GET_PRESET_EXCEPTION',
      error: { message: err.message, stack: err.stack }
    }, '获取预设配置失败');
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withLogging(getPresetHandler);
