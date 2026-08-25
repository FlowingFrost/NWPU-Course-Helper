import { useState } from 'react';
import type { DayBlock } from '../lib/schedule';

export interface CourseSelection {
  courseId: string;
  optionId: string | null; // 主候选（点击的那个块），用于「淡化其它课程」
  optionIds: string[]; // 该时间（星期+节次）开课的所有候选，用于详情里一起描边
}

// 点击选中的课程/候选：同时驱动「课表淡化」与「课程面板打开」。
export function useCourseSelection() {
  const [selection, setSelection] = useState<CourseSelection | null>(null);

  // 课表淡化用的选中课程：只有点到具体候选才非空（打开卡片但不选候选时不淡化）
  const selectedCourseId = selection && selection.optionId ? selection.courseId : null;

  const handleBlockClick = (b: DayBlock) => {
    const optionIds = [b.option.id, ...(b.coOptions ?? []).map((co) => co.option.id)];
    setSelection({ courseId: b.course.id, optionId: b.option.id, optionIds });
  };
  const openCourse = (courseId: string) => setSelection({ courseId, optionId: null, optionIds: [] });
  const closeCourse = () => setSelection(null);

  return { selection, selectedCourseId, handleBlockClick, openCourse, closeCourse };
}
