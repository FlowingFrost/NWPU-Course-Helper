import type { Course, NodeTime, Schedule, Segment } from '../../shared/types';

interface WakeUpCourseInfo {
  id: number;
  courseName: string;
  color: string;
  credit?: number;
  note?: string;
}

interface WakeUpSegment {
  id: number;
  day: number;
  startNode: number;
  step: number;
  startWeek: number;
  endWeek: number;
  room: string;
  teacher: string;
}

interface WakeUpTableConfig {
  school?: string;
  tableName?: string;
  startDate?: string;
  nodes?: number;
  maxWeek?: number;
}

// WakeUp 颜色为 #AARRGGBB（8 位），CSS 需要 #RRGGBB 或 #RRGGBBAA
export function wakeupColorToCss(color: string): string {
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    const alpha = color.slice(1, 3);
    const rgb = color.slice(3, 9);
    return `#${rgb}${alpha}`;
  }
  return color || '#64748b';
}

export function parseWakeUp(text: string): {
  meta: { school?: string; term?: string; startDate?: string; nodesPerDay?: number };
  nodeTimes: NodeTime[];
  courses: Course[];
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 5) throw new Error('文件格式不正确：应包含 5 行 JSON');

  const tableCfg = JSON.parse(lines[2]) as WakeUpTableConfig;
  const rawNodeTimes = JSON.parse(lines[1]) as Array<{ node: number; startTime: string; endTime: string }>;
  const nodeTimes: NodeTime[] = rawNodeTimes
    .slice(0, tableCfg.nodes ?? 13)
    .map((t) => ({ node: t.node, start: t.startTime, end: t.endTime }));
  const infos = JSON.parse(lines[3]) as WakeUpCourseInfo[];
  const rawSegs = JSON.parse(lines[4]) as WakeUpSegment[];

  const infoMap = new Map(infos.map((i) => [i.id, i]));
  const courseMap = new Map<number, Course>();

  for (const rs of rawSegs) {
    const info = infoMap.get(rs.id);
    if (!info) continue;
    let course = courseMap.get(rs.id);
    if (!course) {
      course = {
        id: `crs_wakeup_${rs.id}`,
        code: '',
        name: info.courseName,
        category: 'builtin',
        credit: info.credit ?? 0,
        willingOverride: null,
        color: wakeupColorToCss(info.color),
        options: [{ id: `opt_wakeup_${rs.id}`, label: '', rating: 0, selected: true, enrolled: 0, capacity: 0, segments: [] }],
      };
      courseMap.set(rs.id, course);
    }
    const seg: Segment = {
      day: rs.day,
      startNode: rs.startNode,
      step: rs.step,
      startWeek: rs.startWeek,
      endWeek: rs.endWeek,
      room: rs.room,
      teacher: rs.teacher,
    };
    course.options[0].segments.push(seg);
  }

  return {
    meta: {
      school: tableCfg.school,
      term: tableCfg.tableName,
      startDate: tableCfg.startDate,
      nodesPerDay: tableCfg.nodes,
    },
    nodeTimes,
    courses: [...courseMap.values()],
  };
}

export interface ImportBounds {
  maxNode: number;
  maxWeek: number;
}

export function importBounds(courses: Course[]): ImportBounds {
  let maxNode = 0;
  let maxWeek = 0;
  for (const c of courses) {
    for (const o of c.options) {
      for (const s of o.segments) {
        maxNode = Math.max(maxNode, s.startNode + s.step - 1);
        maxWeek = Math.max(maxWeek, s.endWeek);
      }
    }
  }
  return { maxNode, maxWeek };
}

// 把时段裁剪到 [1..nodesPerDay] 节 / [1..totalWeeks] 周内（截断模式用）
function fitSegments(segments: Segment[], nodesPerDay: number, totalWeeks: number): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const startWeek = Math.max(1, s.startWeek);
    const endWeek = Math.min(totalWeeks, s.endWeek);
    if (startWeek > endWeek) continue;
    if (s.startNode > nodesPerDay) continue;
    const step = Math.min(s.step, nodesPerDay - s.startNode + 1);
    if (step <= 0) continue;
    out.push({ ...s, startWeek, endWeek, step });
  }
  return out;
}

export function applyWakeUpImport(
  current: Schedule,
  text: string,
  mode: 'truncate' | 'widen' = 'truncate',
): Schedule {
  const parsed = parseWakeUp(text);
  const bounds = importBounds(parsed.courses);

  const nodesPerDay = mode === 'widen' ? Math.max(current.meta.nodesPerDay, bounds.maxNode) : current.meta.nodesPerDay;
  const totalWeeks = mode === 'widen' ? Math.max(current.meta.totalWeeks, bounds.maxWeek) : current.meta.totalWeeks;

  const next: Schedule = {
    ...current,
    meta: {
      ...current.meta,
      school: parsed.meta.school ?? current.meta.school,
      term: parsed.meta.term ?? current.meta.term,
      startDate: parsed.meta.startDate ?? current.meta.startDate,
      nodesPerDay,
      totalWeeks,
    },
    nodeTimes: current.nodeTimes,
    courses: [...current.courses],
  };

  // 拓宽节数时，补默认（空时间）节次
  const nodeTimes = [...current.nodeTimes];
  for (let n = current.nodeTimes.length + 1; n <= nodesPerDay; n++) {
    nodeTimes.push({ node: n, start: '', end: '' });
  }
  next.nodeTimes = nodeTimes;

  const sameSegment = (a: Segment, b: Segment) =>
    a.day === b.day &&
    a.startNode === b.startNode &&
    a.step === b.step &&
    a.startWeek === b.startWeek &&
    a.endWeek === b.endWeek &&
    a.room === b.room &&
    a.teacher === b.teacher;

  // 同名课程：合并新文件里的时段（去重后追加），而不是整门跳过
  for (const imported of parsed.courses) {
    const segs = fitSegments(imported.options[0]?.segments ?? [], nodesPerDay, totalWeeks);
    const idx = next.courses.findIndex((c) => c.name.trim() === imported.name.trim());
    if (idx === -1) {
      const opt = imported.options[0];
      next.courses.push({ ...imported, options: opt ? [{ ...opt, segments: segs }] : imported.options });
      continue;
    }
    const existing = next.courses[idx];
    if (segs.length === 0) continue;
    const merged = [...(existing.options[0]?.segments ?? [])];
    for (const seg of segs) {
      if (!merged.some((s) => sameSegment(s, seg))) merged.push(seg);
    }
    next.courses[idx] = {
      ...existing,
      options: existing.options.map((o, i) => (i === 0 ? { ...o, segments: merged } : o)),
    };
  }
  return next;
}
