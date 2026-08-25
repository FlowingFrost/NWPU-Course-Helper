import type { Schedule } from '../../shared/types';
import type { Command } from '../../shared/commands';
import type { RawLesson } from './model';
import type { SelectedLessonRef } from './selectionExtractor';

// 一条「已选人数/容量」更新明细
export interface EnrollmentUpdate {
  optionId: string;
  courseName: string;
  label: string; // 教学班编号
  enrolled: number;
  capacity: number;
  oldEnrolled: number;
  oldCapacity: number;
}

// 一条「是否开放选课」更新明细
export interface SelectableUpdate {
  optionId: string;
  courseName: string;
  label: string;
  selectable: boolean; // 目标值
  oldSelectable: boolean;
}

// 未查到的课程（编号没查到，或编号为空）
export interface NotFoundCourse {
  code: string;
  name: string;
}

// 课程查到了，但某些教学班编号没匹配上（同一课程分组，课程名只出现一次）
export interface NotFoundOptions {
  courseName: string;
  labels: string[];
}

export interface UpdateReport {
  updates: EnrollmentUpdate[];
  selectableUpdates: SelectableUpdate[];
  notFoundCourses: NotFoundCourse[];
  notFoundOptions: NotFoundOptions[];
}

// 根据教务查询结果（RawLesson[]，含 courseCode=课程编号 / lessonCode=教学班编号 + enrolled/capacity）
// 匹配存档（course.code == lesson.courseCode，option.label == lesson.lessonCode），返回完整报告。
// 「是否开放选课」同步规则：在选课系统里查到的教学班 → 开放(true)；查不到的 → 不开放(false)。
export function buildEnrollmentReport(schedule: Schedule, lessons: RawLesson[]): UpdateReport {
  const fresh = new Map<string, { enrolled: number; capacity: number }>();
  const foundCourseCodes = new Set<string>();
  for (const l of lessons) {
    if (l.courseCode) foundCourseCodes.add(l.courseCode);
    if (l.lessonCode && l.enrolled != null) {
      fresh.set(l.lessonCode, { enrolled: l.enrolled, capacity: l.capacity ?? 0 });
    }
  }

  const updates: EnrollmentUpdate[] = [];
  const selectableUpdates: SelectableUpdate[] = [];
  const notFoundCourses: NotFoundCourse[] = [];
  const notFoundOptions: NotFoundOptions[] = [];

  for (const course of schedule.courses) {
    const courseFound = course.code ? foundCourseCodes.has(course.code) : false;

    if (!courseFound) {
      notFoundCourses.push({ code: course.code, name: course.name });
      // 整门课未查到 → 所有候选都视为不开放
      for (const option of course.options) {
        const old = option.selectable === true;
        if (old) {
          selectableUpdates.push({ optionId: option.id, courseName: course.name, label: option.label, selectable: false, oldSelectable: true });
        }
      }
      continue;
    }

    const missingLabels: string[] = [];
    for (const option of course.options) {
      const m = option.label ? fresh.get(option.label) : undefined;
      const matched = !!m;
      const old = option.selectable === true;
      if (matched !== old) {
        selectableUpdates.push({
          optionId: option.id,
          courseName: course.name,
          label: option.label,
          selectable: matched,
          oldSelectable: old,
        });
      }

      if (!matched) {
        if (option.label) missingLabels.push(option.label);
        continue;
      }
      if (option.enrolled === m.enrolled && option.capacity === m.capacity) continue; // 无变化则跳过
      updates.push({
        optionId: option.id,
        courseName: course.name,
        label: option.label,
        enrolled: m.enrolled,
        capacity: m.capacity,
        oldEnrolled: option.enrolled,
        oldCapacity: option.capacity,
      });
    }
    if (missingLabels.length) notFoundOptions.push({ courseName: course.name, labels: missingLabels });
  }

  return { updates, selectableUpdates, notFoundCourses, notFoundOptions };
}

export function buildEnrollmentUpdates(schedule: Schedule, lessons: RawLesson[]): EnrollmentUpdate[] {
  return buildEnrollmentReport(schedule, lessons).updates;
}

// 更新明细 → set_enrollment 命令
export function buildEnrollmentCommands(schedule: Schedule, lessons: RawLesson[]): Command[] {
  return buildEnrollmentUpdates(schedule, lessons).map((u) => ({
    op: 'set_enrollment' as const,
    optionId: u.optionId,
    enrolled: u.enrolled,
    capacity: u.capacity,
  }));
}

// 「是否开放选课」同步 → update_option 命令
export function buildSelectableCommands(schedule: Schedule, lessons: RawLesson[]): Command[] {
  return buildEnrollmentReport(schedule, lessons).selectableUpdates.map((u) => ({
    op: 'update_option' as const,
    optionId: u.optionId,
    patch: { selectable: u.selectable },
  }));
}

// 一次性生成「已选人数 + 是否开放选课」的更新命令
export function buildUpdateCommands(schedule: Schedule, lessons: RawLesson[]): Command[] {
  return [...buildEnrollmentCommands(schedule, lessons), ...buildSelectableCommands(schedule, lessons)];
}

// 教务「已选课程」tab 抓取结果 → set_actual_selection 命令（回写实际已完成选课的编号快照）
export function buildActualSelectionCommand(refs: SelectedLessonRef[]): Command {
  return {
    op: 'set_actual_selection',
    lessonCodes: [...new Set(refs.map((r) => r.lessonCode).map((c) => c.trim()).filter((c) => c !== ''))],
    courseCodes: [...new Set(refs.map((r) => r.courseCode).map((c) => c.trim()).filter((c) => c !== ''))],
  };
}

// 统计已选课程引用（供更新结果弹窗展示）
export function summarizeSelectedRefs(refs: SelectedLessonRef[]): { lessons: number; courses: number } {
  return {
    lessons: new Set(refs.map((r) => r.lessonCode).filter((c) => c.trim() !== '')).size,
    courses: new Set(refs.map((r) => r.courseCode).filter((c) => c.trim() !== '')).size,
  };
}

// 存档里所有非空课程编号（用于逐门查询教务接口）
export function courseCodesOf(schedule: Schedule): string[] {
  return [...new Set(schedule.courses.map((c) => c.code).filter((c) => c.trim() !== ''))];
}
