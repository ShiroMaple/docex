import { wpsService } from '../src/services/wpsService.js';

async function testFinal() {
  console.log('🚀 最终验证：用真实业务数据写入 WPS 多维表格...\n');

  const mockIssues = [
    {
      projectName: '某大厦安全巡检',
      issueType: '消防安全',
      inspectionArea: 'B2层车库',
      description: '消防通道被车辆占用，影响紧急疏散。',
      rectificationRequirement: '立即清除占道车辆，划定警示标志。',
      inspector: '张工',
      inspectionDate: '2026-07-10'
    },
    {
      projectName: '某大厦安全巡检',
      issueType: '电气安全',
      inspectionArea: '3楼配电间',
      description: '配电箱未上锁，存在人员触电隐患。',
      rectificationRequirement: '加装安全锁，非专业人员禁止进入。',
      inspector: '张工',
      inspectionDate: '2026-07-10'
    }
  ];

  try {
    const result = await wpsService.appendRecords(mockIssues);
    console.log('✅ 写入完成! 新增行 IDs:', result.data?.records?.map(r => r.id));
  } catch (error) {
    console.error('❌ 失败:', error.response?.data || error.message);
  }
}

testFinal();
