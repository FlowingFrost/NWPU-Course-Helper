import type { Category, Segment } from '../../shared/types';
import type { Command } from '../../shared/commands';
import { parseScheduleText } from './scheduleText';

// 从教务页面/接口提取到的「一行 = 一个教学班（候选）」的规范化中间结构。
// DOM 提取器与 JSON 适配器都先规整成 RawLesson，再统一映射。
export interface RawLesson {
  courseCode: string; // 课程编号，如 D01M11011（查重主键）
  courseName: string; // 课程名称
  credit: number; // 学分
  lessonCode: string; // 教学班编号，如 D01M11011.01（候选去重键）
  lessonName: string; // 教学班名，如「全校」
  teacher: string; // 授课教师（展示用；时间段内已含每段教师）
  enrolled: number | null; // 已选人数（识别不到为 null）
  capacity: number | null; // 容量（识别不到为 null）
  willing?: number | null; // 已投入意愿值（仅在「已选课程」tab 能读到；读不到为 undefined/null）
  infoId?: string | null; // 课程详情 id（用于打开 /lesson-search/info/{id} 提取教材信息）
  scheduleText: string; // 时间地点文本，交给 parseScheduleText 解析
  // 时间地点文本里是否已含教师（默认 true）。选课 SPA 为 false：教师单独成列、文本末尾无教师。
  teacherInScheduleText?: boolean;
}

// 一门课 + 若干候选（直接对齐 add_course 命令的 options 形状）
export interface ImportedOption {
  label: string;
  rating?: number;
  enrolled?: number;
  capacity?: number;
  selectable?: boolean;
  segments: Segment[];
}

export interface ImportedCourse {
  code: string;
  name: string;
  category: Category;
  credit: number;
  options: ImportedOption[];
}

// 单个教学班 → 一个候选；selectable 由来源页决定（选课页=开放，全校开课查询=不开放）
export function rawLessonToOption(raw: RawLesson, selectable?: boolean): ImportedOption {
  const label = raw.lessonCode || raw.lessonName || raw.teacher;
  // 选课 SPA 的文本不含教师 → 用 raw.teacher 作为教师覆盖；否则文本末尾即为教师。
  const teacherOverride = raw.teacherInScheduleText === false ? raw.teacher : undefined;
  const option: ImportedOption = {
    label,
    segments: parseScheduleText(raw.scheduleText, teacherOverride),
  };
  if (raw.enrolled != null) option.enrolled = raw.enrolled;
  if (raw.capacity != null) option.capacity = raw.capacity;
  if (selectable != null) option.selectable = selectable;
  return option;
}

// 把同一门课的多个教学班（多行）合并成一门课 + 多候选。
// 同名课程取第一条的 name/credit；编号相同即视为同一门课。
export function lessonsToCourses(raws: RawLesson[], category: Category, selectable?: boolean): ImportedCourse[] {
  const byCode = new Map<string, RawLesson[]>();
  for (const raw of raws) {
    const key = raw.courseCode || raw.courseName;
    const list = byCode.get(key) ?? [];
    list.push(raw);
    byCode.set(key, list);
  }

  const courses: ImportedCourse[] = [];
  for (const list of byCode.values()) {
    const first = list[0];
    courses.push({
      code: first.courseCode,
      name: first.courseName,
      category,
      credit: first.credit,
      options: list.map((raw) => rawLessonToOption(raw, selectable)),
    });
  }
  return courses;
}

// ImportedCourse[] → add_course 命令（rating/enrolled/capacity/selectable 未识别则不带，保留用户手填值）
export function buildAddCourseCommands(courses: ImportedCourse[]): Command[] {
  return courses.map((c) => ({
    op: 'add_course' as const,
    name: c.name,
    code: c.code,
    category: c.category,
    credit: c.credit,
    options: c.options.map((o) => {
      const opt: Record<string, unknown> = { label: o.label, segments: o.segments };
      if (o.rating != null) opt.rating = o.rating;
      if (o.enrolled != null) opt.enrolled = o.enrolled;
      if (o.capacity != null) opt.capacity = o.capacity;
      if (o.selectable != null) opt.selectable = o.selectable;
      return opt;
    }),
  })) as Command[];
}
