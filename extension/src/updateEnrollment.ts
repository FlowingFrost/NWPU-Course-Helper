import type { Schedule, Segment, NoticeItem } from '../../shared/types';
import type { Command } from '../../shared/commands';
import type { RawLesson } from './model';
import { lessonsToCourses, buildAddCourseCommands } from './model';
import { segmentsEqual } from '../../shared/segment';
import { parseScheduleText } from './scheduleText';

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

// 一条「时间/地点/教师安排」更新明细
export interface SegmentChange {
  optionId: string;
  courseName: string;
  label: string;
  oldSegments: Segment[];
  newSegments: Segment[];
}

export interface UpdateReport {
  updates: EnrollmentUpdate[];
  selectableUpdates: SelectableUpdate[];
  segmentChanges: SegmentChange[];
  notFoundCourses: NotFoundCourse[];
  notFoundOptions: NotFoundOptions[];
}

// 根据教务查询结果（RawLesson[]，含 courseCode=课程编号 / lessonCode=教学班编号 + enrolled/capacity/scheduleText）
// 匹配存档（course.code == lesson.courseCode，option.label == lesson.lessonCode），返回完整报告。
// 「是否开放选课」同步规则：在选课系统里查到的教学班 → 开放(true)；查不到的 → 不开放(false)。
export function buildEnrollmentReport(schedule: Schedule, lessons: RawLesson[]): UpdateReport {
  const fresh = new Map<string, RawLesson>();
  const foundCourseCodes = new Set<string>();
  for (const l of lessons) {
    if (l.courseCode) foundCourseCodes.add(l.courseCode);
    if (l.lessonCode && l.enrolled != null) {
      fresh.set(l.lessonCode, l);
    }
  }

  const updates: EnrollmentUpdate[] = [];
  const selectableUpdates: SelectableUpdate[] = [];
  const segmentChanges: SegmentChange[] = [];
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

      // 已选人数 / 容量
      const enrolled = m.enrolled ?? 0;
      const capacity = m.capacity ?? 0;
      if (option.enrolled !== enrolled || option.capacity !== capacity) {
        updates.push({
          optionId: option.id,
          courseName: course.name,
          label: option.label,
          enrolled,
          capacity,
          oldEnrolled: option.enrolled,
          oldCapacity: option.capacity,
        });
      }

      // 时间 / 地点 / 教师（segments）
      const newSegments = parseScheduleText(m.scheduleText, m.teacherInScheduleText === false ? m.teacher : undefined);
      if (!sameSegments(option.segments, newSegments)) {
        segmentChanges.push({
          optionId: option.id,
          courseName: course.name,
          label: option.label,
          oldSegments: option.segments,
          newSegments,
        });
      }
    }
    if (missingLabels.length) notFoundOptions.push({ courseName: course.name, labels: missingLabels });
  }

  return { updates, selectableUpdates, segmentChanges, notFoundCourses, notFoundOptions };
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

// 两个时间段数组是否一致（逐段相等）
function sameSegments(a: Segment[], b: Segment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!segmentsEqual(a[i], b[i])) return false;
  }
  return true;
}

const DAY_NAMES: string[] = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 把时间段数组格式化为可读文本（用于更新结果弹窗的「时间/地点」变更明细）
export function formatSegments(segs: Segment[]): string {
  if (!segs.length) return '（无）';
  return segs
    .map((s) => {
      const day = DAY_NAMES[s.day] ?? `周${s.day}`;
      const node = s.step <= 1 ? `第${s.startNode}节` : `第${s.startNode}~${s.startNode + s.step - 1}节`;
      const week = s.startWeek === s.endWeek ? `第${s.startWeek}周` : `第${s.startWeek}~${s.endWeek}周`;
      const parts = [day, node, week];
      if (s.room) parts.push(s.room);
      if (s.teacher) parts.push(s.teacher);
      return parts.join(' ');
    })
    .join('；');
}

// —— 通知生成：把一次更新的明细拆成「已选人数 / 人数上限 / 时间 / 地点 / 教师」条目 ——

const EMPTY_MARK = '无';

function formatSegTime(segs: Segment[]): string {
  if (!segs.length) return EMPTY_MARK;
  return segs
    .map((s) => {
      const day = DAY_NAMES[s.day] ?? `周${s.day}`;
      const node = s.step <= 1 ? `第${s.startNode}节` : `第${s.startNode}~${s.startNode + s.step - 1}节`;
      const week = s.startWeek === s.endWeek ? `第${s.startWeek}周` : `第${s.startWeek}~${s.endWeek}周`;
      return `${day} ${node} ${week}`;
    })
    .join('；');
}

function formatSegRoom(segs: Segment[]): string {
  const rooms = [...new Set(segs.map((s) => s.room).filter((r) => r !== ''))];
  return rooms.length ? rooms.join('；') : EMPTY_MARK;
}

function formatSegTeacher(segs: Segment[]): string {
  const teachers = [...new Set(segs.map((s) => s.teacher).filter((t) => t !== ''))];
  return teachers.length ? teachers.join('；') : EMPTY_MARK;
}

// 时间段差异 → 通知条目（时间 / 地点 / 教师各自独立，仅生成有变化的部分）
function segmentDiffItems(courseName: string, label: string, oldSegs: Segment[], newSegs: Segment[]): NoticeItem[] {
  const items: NoticeItem[] = [];
  const oldTime = formatSegTime(oldSegs);
  const newTime = formatSegTime(newSegs);
  if (oldTime !== newTime) items.push({ kind: 'time', courseName, label, oldText: oldTime, newText: newTime });

  const oldRoom = formatSegRoom(oldSegs);
  const newRoom = formatSegRoom(newSegs);
  if (oldRoom !== newRoom) items.push({ kind: 'room', courseName, label, oldText: oldRoom, newText: newRoom });

  const oldTeacher = formatSegTeacher(oldSegs);
  const newTeacher = formatSegTeacher(newSegs);
  if (oldTeacher !== newTeacher) items.push({ kind: 'teacher', courseName, label, oldText: oldTeacher, newText: newTeacher });
  return items;
}

// 一次「更新课程数据」→ 通知条目（已选人数 / 人数上限 / 时间 / 地点 / 教师）
export function buildNoticeItems(schedule: Schedule, lessons: RawLesson[]): NoticeItem[] {
  const report = buildEnrollmentReport(schedule, lessons);
  const items: NoticeItem[] = [];
  for (const u of report.updates) {
    if (u.oldEnrolled !== u.enrolled) {
      items.push({ kind: 'enrolled', courseName: u.courseName, label: u.label, oldText: String(u.oldEnrolled), newText: String(u.enrolled) });
    }
    if (u.oldCapacity !== u.capacity) {
      items.push({ kind: 'capacity', courseName: u.courseName, label: u.label, oldText: String(u.oldCapacity), newText: String(u.capacity) });
    }
  }
  for (const s of report.segmentChanges) {
    items.push(...segmentDiffItems(s.courseName, s.label, s.oldSegments, s.newSegments));
  }
  return items;
}

// 时间/地点/教师变化 → update_option { segments } 命令。
// 仅当教务解析出非空时间段时才覆写，避免解析失败时把已有安排清空。
export function buildSegmentCommands(schedule: Schedule, lessons: RawLesson[]): Command[] {
  return buildEnrollmentReport(schedule, lessons).segmentChanges
    .filter((s) => s.newSegments.length > 0)
    .map((s) => ({
      op: 'update_option' as const,
      optionId: s.optionId,
      patch: { segments: s.newSegments },
    }));
}

// 一次性生成「已选人数 + 容量 + 是否开放选课 + 时间/地点/教师」的更新命令
export function buildUpdateCommands(schedule: Schedule, lessons: RawLesson[]): Command[] {
  return [
    ...buildEnrollmentCommands(schedule, lessons),
    ...buildSelectableCommands(schedule, lessons),
    ...buildSegmentCommands(schedule, lessons),
  ];
}

// 教务「已选课程」tab 抓取结果 → set_actual_selection 命令（回写实际已完成选课的编号快照）
export function buildActualSelectionCommand(refs: Array<{ courseCode: string; lessonCode: string }>): Command {
  return {
    op: 'set_actual_selection',
    lessonCodes: [...new Set(refs.map((r) => r.lessonCode).map((c) => c.trim()).filter((c) => c !== ''))],
    courseCodes: [...new Set(refs.map((r) => r.courseCode).map((c) => c.trim()).filter((c) => c !== ''))],
  };
}

// 统计已选课程引用（供更新结果弹窗展示）
export function summarizeSelectedRefs(refs: Array<{ courseCode: string; lessonCode: string }>): { lessons: number; courses: number } {
  return {
    lessons: new Set(refs.map((r) => r.lessonCode).filter((c) => c.trim() !== '')).size,
    courses: new Set(refs.map((r) => r.courseCode).filter((c) => c.trim() !== '')).size,
  };
}

// 从「已选课程」抓取结果中，读取每门课已投入的意愿值，生成 set_willing 命令覆写存档。
// 意愿值是课程级属性：同一门课的多个教学班显示相同值，按课程编号去重。
// 仅对存档里已存在的课程生效；缺失课程由 add_course 新建（内置课不计意愿值，无需覆写）。
export function buildWillingCommands(schedule: Schedule, lessons: RawLesson[]): Command[] {
  const byCode = new Map<string, number>();
  for (const l of lessons) {
    if (!l.courseCode || l.willing == null) continue;
    if (!byCode.has(l.courseCode)) byCode.set(l.courseCode, l.willing);
  }

  const commands: Command[] = [];
  for (const [code, willing] of byCode) {
    const course = schedule.courses.find((c) => c.code === code);
    if (!course) continue;
    if (course.willingOverride === willing) continue; // 无变化跳过
    commands.push({ op: 'set_willing', courseId: course.id, willingOverride: willing });
  }
  return commands;
}

// 从「已选课程」抓取结果中，找出存档里不存在的课程，生成 add_course 命令（内置类，完整添加）。
export function buildAddMissingSelectedCommands(schedule: Schedule, lessons: RawLesson[]): Command[] {
  const missing: RawLesson[] = [];
  for (const l of lessons) {
    if (!l.courseCode) continue;
    const course = schedule.courses.find((c) => c.code === l.courseCode);
    if (!course) {
      // 整门课缺失：完整添加（lessonsToCourses 会按课程编号把同一门课的多个教学班合并）
      missing.push(l);
      continue;
    }
    // 课程存在，但该教学班缺失：仅补该教学班
    if (l.lessonCode && !course.options.some((o) => o.label === l.lessonCode)) {
      missing.push(l);
    }
  }
  if (!missing.length) return [];
  return buildAddCourseCommands(lessonsToCourses(missing, 'builtin', true));
}

// 存档里所有非空课程编号（用于逐门查询教务接口）
export function courseCodesOf(schedule: Schedule): string[] {
  return [...new Set(schedule.courses.map((c) => c.code).filter((c) => c.trim() !== ''))];
}
