import type { Schedule, Course, Goal } from '../../shared/types';

// 目标状态：未填入候选方案 → 未敲定教学班 → 已完成（纯本地推导，不涉及教务系统）
export type GoalState = 'no-candidate' | 'undecided' | 'done';

export const GOAL_STATE_LABEL: Record<GoalState, string> = {
  'no-candidate': '未填入候选方案',
  'undecided': '未敲定教学班',
  'done': '已完成',
};

// 目标命中的课程集合：按课程编号（code）或串联组标识（linkId）
export function goalCourses(schedule: Schedule, goal: Goal): Course[] {
  if (goal.targetType === 'link') {
    return schedule.courses.filter((c) => c.linkId === goal.target);
  }
  return schedule.courses.filter((c) => c.code === goal.target);
}

// 目标当前状态：
// - 没有命中的课程，或命中的课程都没填候选方案 → 未填入候选方案
// - 有候选方案但没有任何教学班被「确认选」 → 未敲定教学班
// - 任一命中课程有「确认选」的教学班 → 已完成
export function goalState(schedule: Schedule, goal: Goal): GoalState {
  const courses = goalCourses(schedule, goal);
  if (courses.length === 0) return 'no-candidate';
  const hasOption = courses.some((c) => c.options.length > 0);
  if (!hasOption) return 'no-candidate';
  const hasSelected = courses.some((c) => c.options.some((o) => o.selected));
  return hasSelected ? 'done' : 'undecided';
}

// 目标显示名推导：优先取命中的课程名（串联组则拼接成员名）
export function goalDisplayName(schedule: Schedule, goal: Goal): string {
  if (goal.name && goal.name !== goal.target) return goal.name;
  const courses = goalCourses(schedule, goal);
  if (courses.length === 1) return courses[0].name || goal.target;
  if (courses.length > 1) {
    const names = [...new Set(courses.map((c) => c.name).filter(Boolean))];
    if (names.length) return names.join(' / ');
  }
  return goal.target;
}
