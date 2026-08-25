import type { Schedule, Course, Option, Segment, Category, Meta } from './types';
import { uid, updateCourse, deleteCourse, addOption, updateOption, setSelected } from './mutations';
import { segmentsEqual } from './segment';

// 结构化命令集合 —— AI 与外部工具都通过它修改课程表（DESIGN.md §9.2）
export type Command =
  | { op: 'add_course'; name: string; category: Category; code?: string; credit?: number; color?: string; participating?: boolean; segments?: Segment[]; options?: Array<{ label?: string; rating?: number; enrolled?: number; capacity?: number; selectable?: boolean; segments?: Segment[] }> }
  | { op: 'add_option'; courseId: string; label?: string; rating?: number; segments?: Segment[] }
  | { op: 'update_option'; optionId: string; patch: Partial<Option> }
  | { op: 'set_selected'; optionId: string; selected: boolean }
  | { op: 'set_rating'; optionId: string; rating: number }
  | { op: 'set_enrollment'; optionId: string; enrolled: number; capacity: number }
  | { op: 'set_willing'; courseId: string; willingOverride: number | null }
  | { op: 'update_course'; courseId: string; patch: Partial<Course> }
  | { op: 'delete_course'; courseId: string }
  | { op: 'update_meta'; patch: Partial<Meta> };

export function findCourseByOptionId(schedule: Schedule, optionId: string): Course | undefined {
  return schedule.courses.find((c) => c.options.some((o) => o.id === optionId));
}

function sameOptionContent(a: { label: string; segments: Segment[] }, b: { label: string; segments: Segment[] }): boolean {
  if (a.label !== b.label) return false;
  if (a.segments.length !== b.segments.length) return false;
  for (let i = 0; i < a.segments.length; i++) {
    if (!segmentsEqual(a.segments[i], b.segments[i])) return false;
  }
  return true;
}

export function applyCommand(schedule: Schedule, cmd: Command): Schedule {
  switch (cmd.op) {
    case 'add_course': {
      const opts = cmd.options ?? [];
      const newOpts =
        opts.length > 0
          ? opts.map((o) => ({ label: o.label, rating: o.rating, enrolled: o.enrolled, capacity: o.capacity, selectable: o.selectable, segments: o.segments }))
          : [{ label: undefined, rating: undefined, enrolled: undefined, capacity: undefined, selectable: undefined, segments: cmd.segments }];

      // 查重：同编号（无编号则同名）的课程已存在 → 合并候选，不重复建课
      const existing = schedule.courses.find((c) => (cmd.code ? c.code === cmd.code : c.name === cmd.name));
      if (existing) {
        const merged = [...existing.options];
        for (const no of newOpts) {
          const label = no.label ?? '';
          // 按教学班编号（label，如 U10M11011.01）精确匹配；无编号则按内容去重
          const idx = label
            ? merged.findIndex((o) => o.label === label)
            : merged.findIndex((o) => sameOptionContent(o, { label: '', segments: no.segments ?? [] }));
          if (idx >= 0) {
            // 同编号 → 覆盖：仅替换「识别到」的字段（未识别的保留旧值）
            const prev = merged[idx];
            if (prev.locked === true) continue; // 锁定候选：粘贴/解析不覆盖
            merged[idx] = {
              ...prev,
              ...(label ? { label } : {}),
              ...(no.rating != null ? { rating: no.rating } : {}),
              ...(no.enrolled != null ? { enrolled: no.enrolled } : {}),
              ...(no.capacity != null ? { capacity: no.capacity } : {}),
              ...(no.selectable != null ? { selectable: no.selectable } : {}),
              ...(no.segments != null && no.segments.length > 0 ? { segments: no.segments } : {}),
            };
          } else {
            merged.push({ id: uid('opt'), label, rating: no.rating ?? 0, selected: false, enrolled: no.enrolled ?? 0, capacity: no.capacity ?? 0, selectable: no.selectable, segments: no.segments ?? [] });
          }
        }
        return { ...schedule, courses: schedule.courses.map((c) => (c.id === existing.id ? { ...c, options: merged } : c)) };
      }

      // 新建课程
      const course: Course = {
        id: uid('crs'),
        code: cmd.code ?? '',
        name: cmd.name,
        category: cmd.category,
        credit: cmd.credit ?? 0,
        willingOverride: null,
        participating: cmd.participating ?? (cmd.category === 'elective' ? true : undefined),
        color: cmd.color ?? '#64748b',
        options: newOpts.map((o) => ({ id: uid('opt'), label: o.label ?? '', rating: o.rating ?? 0, selected: false, enrolled: o.enrolled ?? 0, capacity: o.capacity ?? 0, selectable: o.selectable, segments: o.segments ?? [] })),
      };
      if (course.category === 'builtin' && course.options[0]) course.options[0].selected = true;
      return { ...schedule, courses: [...schedule.courses, course] };
    }
    case 'add_option': {
      const course = schedule.courses.find((c) => c.id === cmd.courseId);
      if (!course) return schedule;
      let s = addOption(schedule, cmd.courseId);
      const updated = s.courses.find((c) => c.id === cmd.courseId);
      const opt = updated?.options[updated.options.length - 1];
      if (opt) {
        s = updateOption(s, cmd.courseId, opt.id, {
          label: cmd.label ?? '',
          rating: cmd.rating ?? 0,
          segments: cmd.segments ?? [],
        });
      }
      return s;
    }
    case 'set_selected': {
      const course = findCourseByOptionId(schedule, cmd.optionId);
      if (!course) return schedule;
      return setSelected(schedule, course.id, cmd.optionId, cmd.selected);
    }
    case 'update_option': {
      const course = findCourseByOptionId(schedule, cmd.optionId);
      if (!course) return schedule;
      return updateOption(schedule, course.id, cmd.optionId, cmd.patch);
    }
    case 'set_rating': {
      const course = findCourseByOptionId(schedule, cmd.optionId);
      if (!course) return schedule;
      return updateOption(schedule, course.id, cmd.optionId, { rating: cmd.rating });
    }
    case 'set_enrollment': {
      const course = findCourseByOptionId(schedule, cmd.optionId);
      if (!course) return schedule;
      return updateOption(schedule, course.id, cmd.optionId, { enrolled: cmd.enrolled, capacity: cmd.capacity });
    }
    case 'set_willing':
      return updateCourse(schedule, cmd.courseId, { willingOverride: cmd.willingOverride });
    case 'update_course':
      return updateCourse(schedule, cmd.courseId, cmd.patch);
    case 'delete_course':
      return deleteCourse(schedule, cmd.courseId);
    case 'update_meta':
      return { ...schedule, meta: { ...schedule.meta, ...cmd.patch } };
    default:
      return schedule;
  }
}

export function applyCommands(schedule: Schedule, commands: Command[]): Schedule {
  let s = schedule;
  for (const c of commands) s = applyCommand(s, c);
  return s;
}
