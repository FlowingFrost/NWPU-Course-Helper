import type { Meta, InfoBits, InfoView, Course, Option } from '../../shared/types';
import { optionsConflict } from './algo';
import { DAY_FULL } from './labels';

// 显示课程信息的默认：教师/周次/地点全开
export const DEFAULT_INFO: InfoBits = { teacher: true, week: true, room: true };

// 取某视图的「显示课程信息」配置（缺省位用默认值补齐）
export function infoOf(meta: Meta, view: InfoView): InfoBits {
  return { ...DEFAULT_INFO, ...(meta.infoConfig?.[view] ?? {}) };
}

// 不同候选信息叠加显示配置（总开关/显示教师/显示地点，默认全开）
export function coInfoOf(meta: Meta): { enabled: boolean; showTeacher: boolean; showRoom: boolean } {
  const c = meta.coInfo ?? {};
  return { enabled: c.enabled !== false, showTeacher: c.showTeacher !== false, showRoom: c.showRoom !== false };
}

// 教学班编号 → 班级序号：'U44G11034.18' → '18'，'U10M11011.01' → '1'（去掉前导 0）
export function classNumberOf(label: string): string {
  const m = /\.(\d+)\s*$/.exec((label ?? '').trim());
  return m ? String(parseInt(m[1], 10)) : '';
}

// 班级徽标：'1班' / '18班'；无点后缀时退回原编号或 '?'
export function classBadge(label: string): string {
  const n = classNumberOf(label);
  if (n) return `${n}班`;
  const t = (label ?? '').trim();
  return t || '?';
}

// 与某候选在时间上重叠的其它候选（同课程、不同教学班）
export function overlappingOptions(course: Course, option: Option): Option[] {
  return course.options.filter((o) => o.id !== option.id && optionsConflict(option, o));
}

// 某候选的完整信息摘要（每段一行：星期几 · 节次 · 周数 · 教师 · 地点）
export function optionSummaryLines(option: Option): string[] {
  if (!option.segments.length) return ['(暂无时间段)'];
  return option.segments.map((s) => {
    const day = DAY_FULL[s.day - 1] ?? `周${s.day}`;
    const parts = [day, `第${s.startNode}-${s.startNode + s.step - 1}节`, `${s.startWeek}-${s.endWeek}周`];
    if (s.teacher) parts.push(s.teacher);
    if (s.room) parts.push(s.room);
    return parts.join(' · ');
  });
}
