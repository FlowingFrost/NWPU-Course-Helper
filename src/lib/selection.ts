import type { Schedule, Course, Option } from '../../shared/types';

// 校验「确认选 / 内置」课程是否已在教务系统完成选课操作。
export type VerifyStatus = 'builtin' | 'verified' | 'missing' | 'unknown';

// - builtin：内置课 = 已选课成功，恒为完成，无需校验
// - verified：在教务「已选课程」里查到（教学班编号精确匹配，或课程编号兜底匹配）
// - missing：已同步数据，但未查到 → 未完成选课操作（标红）
// - unknown：尚未从插件同步「已选课程」数据，无法校验
export function verifySelection(schedule: Schedule, course: Course, option: Option): VerifyStatus {
  if (course.category === 'builtin') return 'builtin';
  const as = schedule.actualSelection;
  if (!as) return 'unknown';
  const matched =
    (option.label && as.lessonCodes.includes(option.label)) || (course.code && as.courseCodes.includes(course.code));
  return matched ? 'verified' : 'missing';
}

// 目标列表里用到的「完成/未完成/未校验」中文标签
export const VERIFY_LABEL: Record<VerifyStatus, string> = {
  builtin: '已选课成功',
  verified: '已完成',
  missing: '未完成',
  unknown: '未校验',
};
