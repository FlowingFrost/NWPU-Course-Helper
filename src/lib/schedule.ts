import type { Schedule, Course, Option, Segment } from '../../shared/types';

export interface Item {
  course: Course;
  option: Option;
}

// 节次区间 [startNode, startNode + step)
export function segmentNodeRange(s: Segment): [number, number] {
  return [s.startNode, s.startNode + s.step];
}

export function segmentInWeek(s: Segment, week: number): boolean {
  return week >= s.startWeek && week <= s.endWeek;
}

// 合并周区间为紧凑标签，如 "1-2,5-8周"
export function mergeWeekRanges(ranges: Array<[number, number]>): string {
  if (ranges.length === 0) return '';
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged.map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`)).join(',') + '周';
}

export interface CellCourse {
  course: Course;
  option: Option;
  segments: Segment[];
  teachers: string[];
  weekLabel: string;
}

// 取某 (day, node) 格子在某周过滤下的条目（供结果区迷你课表使用）
export function itemsInCell(items: Item[], day: number, node: number, weekFilter: 'all' | number): CellCourse[] {
  const out: CellCourse[] = [];
  for (const { course, option } of items) {
    const segs = option.segments.filter((s) => {
      if (s.day !== day) return false;
      const [start, end] = segmentNodeRange(s);
      if (node < start || node >= end) return false;
      return weekFilter === 'all' || segmentInWeek(s, weekFilter);
    });
    if (segs.length === 0) continue;
    const teachers = [...new Set(segs.map((s) => s.teacher).filter((t) => t.trim() !== ''))];
    const weekLabel = mergeWeekRanges(segs.map((s) => [s.startWeek, s.endWeek] as [number, number]));
    out.push({ course, option, segments: segs, teachers, weekLabel });
  }
  return out;
}

export function coursesInCell(schedule: Schedule, day: number, node: number, weekFilter: 'all' | number): CellCourse[] {
  const items: Item[] = [];
  for (const course of schedule.courses) {
    for (const option of course.options) {
      items.push({ course, option });
    }
  }
  return itemsInCell(items, day, node, weekFilter);
}

// 固定课程：内置 + 任何「确认选」的候选
export function fixedItems(schedule: Schedule): Item[] {
  const items: Item[] = [];
  for (const c of schedule.courses) {
    if (c.category === 'builtin') {
      if (c.options[0]) items.push({ course: c, option: c.options[0] });
    } else {
      const sel = c.options.find((o) => o.selected);
      if (sel) items.push({ course: c, option: sel });
    }
  }
  return items;
}

// 待选课程：所有未确认选、非内置的候选（双课表右侧展示用）
export function candidateItems(schedule: Schedule): Item[] {
  const items: Item[] = [];
  for (const c of schedule.courses) {
    if (c.category === 'builtin') continue;
    for (const o of c.options) {
      if (!o.selected) items.push({ course: c, option: o });
    }
  }
  return items;
}

// —— 块式渲染：连堂课合并为一个块、重叠课并排 ——

export interface DayBlock {
  key: string;
  course: Course;
  option: Option;
  startNode: number; // 含
  endNode: number; // 不含（= startNode + step）
  teachers: string[];
  weekLabel: string;
  room: string;
  fixed: boolean;
}

function sameRanges(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  if (a.length !== b.length) return false;
  const k = (r: [number, number]) => `${r[0]}-${r[1]}`;
  const sa = a.map(k).sort();
  const sb = b.map(k).sort();
  return sa.every((x, i) => x === sb[i]);
}

function sameTeachers(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((x, i) => x === sb[i]);
}

export function dayBlocks(items: Item[], day: number, weekFilter: 'all' | number): DayBlock[] {
  interface Entry {
    course: Course;
    option: Option;
    startNode: number;
    endNode: number;
    teachers: string[];
    room: string;
    ranges: Array<[number, number]>;
  }

  const map = new Map<string, Entry>();
  for (const { course, option } of items) {
    for (const seg of option.segments) {
      if (seg.day !== day) continue;
      if (weekFilter !== 'all' && !segmentInWeek(seg, weekFilter)) continue;
      const start = seg.startNode;
      const end = seg.startNode + seg.step;
      const key = `${course.id}:${option.id}:${start}:${end}`;
      const entry = map.get(key);
      if (entry) {
        entry.ranges.push([seg.startWeek, seg.endWeek]);
        if (seg.teacher && !entry.teachers.includes(seg.teacher)) entry.teachers.push(seg.teacher);
        if (!entry.room && seg.room) entry.room = seg.room;
      } else {
        map.set(key, {
          course,
          option,
          startNode: start,
          endNode: end,
          teachers: seg.teacher ? [seg.teacher] : [],
          room: seg.room,
          ranges: [[seg.startWeek, seg.endWeek]],
        });
      }
    }
  }

  // 合并相邻节次：同一课程+候选，且 教师/教室/周次 完全一致的相邻区间连成一个块
  const entries = [...map.values()];
  const byCourse = new Map<string, Entry[]>();
  for (const e of entries) {
    const ck = `${e.course.id}:${e.option.id}`;
    const arr = byCourse.get(ck) ?? [];
    arr.push(e);
    byCourse.set(ck, arr);
  }
  const mergedEntries: Entry[] = [];
  for (const arr of byCourse.values()) {
    arr.sort((a, b) => a.startNode - b.startNode || a.endNode - b.endNode);
    const merged: Entry[] = [];
    for (const e of arr) {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.endNode === e.startNode &&
        sameRanges(last.ranges, e.ranges) &&
        sameTeachers(last.teachers, e.teachers) &&
        last.room === e.room
      ) {
        last.endNode = e.endNode;
      } else {
        merged.push(e);
      }
    }
    mergedEntries.push(...merged);
  }

  // 同一门课在同一格子（星期 + 节次区间）只显示一个块：
  // 有「已确认/fixed」块则只显示它，否则只显示第一个候选块。
  const cells = new Map<string, DayBlock[]>();
  for (const e of mergedEntries) {
    const cellKey = `${e.course.id}:${e.startNode}:${e.endNode}`;
    const block: DayBlock = {
      key: `${e.course.id}:${e.option.id}:${e.startNode}:${e.endNode}`,
      course: e.course,
      option: e.option,
      startNode: e.startNode,
      endNode: e.endNode,
      teachers: e.teachers,
      weekLabel: mergeWeekRanges(e.ranges),
      room: e.room,
      fixed: e.course.category === 'builtin' || e.option.selected,
    };
    const arr = cells.get(cellKey);
    if (arr) arr.push(block);
    else cells.set(cellKey, [block]);
  }
  const out: DayBlock[] = [];
  for (const blocks of cells.values()) {
    out.push(blocks.find((b) => b.fixed) ?? blocks[0]);
  }
  return out;
}

export interface LaidBlock extends DayBlock {
  lane: number;
  laneCount: number;
}

// 区间着色：按「重叠连通簇」分别着色，只有真正重叠的块才分摊宽度
export function layoutBlocks(blocks: DayBlock[]): LaidBlock[] {
  const n = blocks.length;
  if (n === 0) return [];

  const overlaps = (a: DayBlock, b: DayBlock) => a.startNode < b.endNode && b.startNode < a.endNode;

  // 并查集：把互相重叠的块归入同一簇
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (overlaps(blocks[i], blocks[j])) union(i, j);
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = clusters.get(r) ?? [];
    arr.push(i);
    clusters.set(r, arr);
  }

  const laid: LaidBlock[] = [];
  for (const indices of clusters.values()) {
    const members = indices.map((i) => blocks[i]).sort((a, b) => a.startNode - b.startNode || b.endNode - a.endNode);
    const laneEnds: number[] = [];
    const assigned: Array<{ b: DayBlock; lane: number }> = [];
    for (const b of members) {
      let lane = laneEnds.findIndex((e) => e <= b.startNode);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(b.endNode);
      } else {
        laneEnds[lane] = b.endNode;
      }
      assigned.push({ b, lane });
    }
    const laneCount = laneEnds.length || 1;
    for (const a of assigned) laid.push({ ...a.b, lane: a.lane, laneCount });
  }

  laid.sort((a, b) => a.startNode - b.startNode || b.endNode - a.endNode);
  return laid;
}
