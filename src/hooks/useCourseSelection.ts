import { useState } from 'react';
import type { DayBlock } from '../lib/schedule';

export interface CourseSelection {
  courseId: string;
  optionId: string | null;
}

// 点击选中的课程/候选：同时驱动「课表淡化」与「课程面板打开」。
export function useCourseSelection() {
  const [selection, setSelection] = useState<CourseSelection | null>(null);

  // 课表淡化用的选中课程：只有点到具体候选才非空（打开卡片但不选候选时不淡化）
  const selectedCourseId = selection && selection.optionId ? selection.courseId : null;

  const handleBlockClick = (b: DayBlock) => {
    setSelection({ courseId: b.course.id, optionId: b.option.id });
  };
  const openCourse = (courseId: string) => setSelection({ courseId, optionId: null });
  const closeCourse = () => setSelection(null);

  return { selection, selectedCourseId, handleBlockClick, openCourse, closeCourse };
}
