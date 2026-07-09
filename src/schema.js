import { z } from 'zod';

/**
 * 单个安全隐患的结构化 Schema 定义
 */
export const SafetyIssueSchema = z.object({
  projectName: z.string().describe('隐患对应的项目名称或工程名称。如果文档中未明确提及，可提取总项目名或留空'),
  issueType: z.string().describe('隐患的问题分类或类型，例如：高处作业、临时用电、消防安全、临边防护、文明施工等'),
  inspectionArea: z.string().describe('隐患被发现的检查区域、具体位置、楼层或点位'),
  description: z.string().describe('安全隐患的具体问题描述，说明哪里不符合安全规范、隐患现状等'),
  rectificationRequirement: z.string().describe('针对该隐患提出的整改要求、限期整改措施或整改意见'),
  inspector: z.string().describe('负责进行本次安全检查的人员姓名，可以是多人，若没有则留空'),
  inspectionDate: z.string().describe('发现隐患的检查日期，格式通常为 YYYY-MM-DD 或文中所述的日期')
});

/**
 * 最终隐患列表的 Schema 定义（支持一对多提取）
 */
export const SafetyReportSchema = z.object({
  issues: z.array(SafetyIssueSchema).describe('从文档中提取出的安全隐患列表，若无隐患则返回空数组')
});
