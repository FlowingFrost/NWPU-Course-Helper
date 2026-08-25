import type { Schedule } from '../../shared/types';
import { fixedItems } from './schedule';
import type { Item } from './schedule';

// —— 学期周段 / 占用 / 甘特图 计算（只统计「固定 + 确认选」课程） ——

export interface WeekPartition {
  weeks: number[]; // 该周段包含的周（连续，按时间顺序）
  items: Item[]; // 该周段内上课的课程（段被截断到周段范围）
}

// 周段划分（按时间顺序切成连续周段）：
// - 以「时间段（星期+节次）」为最小单位，先依据连续时间段划分一级范围；
// - 离散时间段（单周/散开）在优化模式下不切分、仅标注，独立模式下每周拆开。
export function weekPartitions(schedule: Schedule, optimize = true): WeekPartition[] {
  const items = fixedItems(schedule);
  const totalWeeks = schedule.meta.totalWeeks;

  const points = new Set<number>([1, totalWeeks + 1]);
  for (const it of items) {
    for (const [s, e] of slotRuns(it, optimize)) {
      if (s >= 1 && s <= totalWeeks) points.add(s);
      if (e >= 1 && e <= totalWeeks) points.add(e + 1);
    }
  }

  const sorted = [...points].sort((a, b) => a - b);
  const out: WeekPartition[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1] - 1;
    if (end < start) continue;
    const weeks: number[] = [];
    for (let w = start; w <= end; w++) weeks.push(w);
    out.push({ weeks, items: itemsInWeekRange(items, start, end) });
  }
  return out;
}

// 按时间段（星期+起始节+连节数）分组，每个时间段内按周次归类为若干区间：
// - 连续多周 → [min,max]（一级边界）
// - 单周 → 优化模式跳过（指定周，不切分），独立模式 [w,w]
// - 离散多周 → 优化模式用「连续段优先、再奇偶」压缩，独立模式每周 [w,w]
function slotRuns(it: Item, optimize: boolean): Array<[number, number]> {
  const bySlot = new Map<string, number[]>();
  for (const s of it.option.segments) {
    const key = `${s.day}:${s.startNode}:${s.step}`;
    const arr = bySlot.get(key) ?? [];
    for (let w = s.startWeek; w <= s.endWeek; w++) arr.push(w);
    bySlot.set(key, arr);
  }
  const out: Array<[number, number]> = [];
  for (const arr of bySlot.values()) {
    const weeks = [...new Set(arr)].sort((a, b) => a - b);
    if (!weeks.length) continue;
    const contiguous = weeks.every((w, i) => i === 0 || w === weeks[i - 1] + 1);
    if (contiguous) {
      if (weeks.length >= 2) out.push([weeks[0], weeks[weeks.length - 1]]);
      else if (!optimize) out.push([weeks[0], weeks[0]]);
    } else if (optimize) {
      out.push(...scatteredRunsFromWeeks(weeks));
    } else {
      for (const w of weeks) out.push([w, w]);
    }
  }
  return out;
}

function collectWeeks(it: Item): number[] {
  const set = new Set<number>();
  for (const s of it.option.segments) for (let w = s.startWeek; w <= s.endWeek; w++) set.add(w);
  return [...set].sort((a, b) => a - b);
}

function isNonContiguous(weeks: number[]): boolean {
  return weeks.some((w, i) => i > 0 && w !== weeks[i - 1] + 1);
}

// 散课 id 集合（上课周次不连续）
export function scatteredCourseIds(schedule: Schedule): Set<string> {
  const out = new Set<string>();
  for (const it of fixedItems(schedule)) {
    const weeks = collectWeeks(it);
    if (weeks.length >= 2 && isNonContiguous(weeks)) out.add(it.course.id);
  }
  return out;
}

// 只出现一次的课程 id 集合（指定周）
export function singleWeekCourseIds(schedule: Schedule): Set<string> {
  const out = new Set<string>();
  for (const it of fixedItems(schedule)) {
    if (collectWeeks(it).length === 1) out.add(it.course.id);
  }
  return out;
}

// 离散周的展示范围：先取「连续段」（步长 1），剩余周再按「同奇偶、步长 2」归并。
// - 连续段 / 多周奇偶段：产生边界（参与切分）。
// - 单个周：视为「指定周」，不产生边界（该周直接并入周围周段，仅标注）。
function scatteredRunsFromWeeks(weeks: number[]): Array<[number, number]> {
  // 连续段（步长 1，长度 ≥2）
  const inContinuous = new Set<number>();
  const runs: Array<[number, number]> = [];
  let i = 0;
  while (i < weeks.length) {
    let j = i;
    while (j + 1 < weeks.length && weeks[j + 1] === weeks[j] + 1) j++;
    if (j > i) {
      runs.push([weeks[i], weeks[j]]);
      for (let k = i; k <= j; k++) inContinuous.add(weeks[k]);
    }
    i = j + 1;
  }

  // 剩余周 → 奇偶段（步长 2）；单周跳过（指定周，不切分）
  const remaining = weeks.filter((w) => !inContinuous.has(w));
  i = 0;
  while (i < remaining.length) {
    let j = i;
    while (j + 1 < remaining.length && remaining[j + 1] === remaining[j] + 2) j++;
    if (j > i) runs.push([remaining[i], remaining[j]]);
    i = j + 1;
  }
  return runs.sort((a, b) => a[0] - b[0]);
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// 某候选（截断后的段）的奇偶标注：仅当 ≥3 周且只上单周/双周时返回「单周」/「双周」，否则 null。
export function parityLabelOf(item: Item): string | null {
  const weeks = collectWeeks(item);
  if (weeks.length < 3) return null;
  const allOdd = weeks.every((w) => w % 2 === 1);
  const allEven = weeks.every((w) => w % 2 === 0);
  if (allOdd) return '单周';
  if (allEven) return '双周';
  return null;
}

// 指定周标注：1 周 →「第X周」，2 周 →「第X,Y周」（比单/双周更直观），否则 null。
export function specifiedWeekLabel(item: Item): string | null {
  const weeks = collectWeeks(item);
  if (weeks.length === 1) return `第${weeks[0]}周`;
  if (weeks.length === 2) return `第${weeks.join(',')}周`;
  return null;
}

// 统一标注：1-2 周显示具体周次，≥3 周同奇偶显示单/双周
export function weekBadge(item: Item): string | null {
  return specifiedWeekLabel(item) ?? parityLabelOf(item);
}

// 同一课程「时段周次分布不同」时的窄时段标注：
// 找出周次范围是课程整体范围「真子集」的时间段，标注其具体周次（如周六只在第15周）。
// 返回 key=`courseId:day:startNode:endNode` → 标注文本。
export function reducedSlotBadges(schedule: Schedule): Map<string, string> {
  const out = new Map<string, string>();
  for (const it of fixedItems(schedule)) {
    const slots = new Map<string, { day: number; startNode: number; endNode: number; min: number; max: number }>();
    for (const s of it.option.segments) {
      const key = `${s.day}:${s.startNode}:${s.startNode + s.step}`;
      let e = slots.get(key);
      if (!e) {
        e = { day: s.day, startNode: s.startNode, endNode: s.startNode + s.step, min: s.startWeek, max: s.endWeek };
        slots.set(key, e);
      } else {
        e.min = Math.min(e.min, s.startWeek);
        e.max = Math.max(e.max, s.endWeek);
      }
    }
    if (slots.size < 2) continue;
    let gMin = Infinity;
    let gMax = -Infinity;
    for (const e of slots.values()) {
      gMin = Math.min(gMin, e.min);
      gMax = Math.max(gMax, e.max);
    }
    for (const [key, e] of slots) {
      if (e.min > gMin || e.max < gMax) {
        const label = e.min === e.max ? `第${e.min}周` : `第${e.min}-${e.max}周`;
        out.set(`${it.course.id}:${e.day}:${e.startNode}:${e.endNode}`, label);
      }
    }
  }
  return out;
}

// 周列表 → 紧凑标签：2-3,6-8,10-11
export function weeksLabel(weeks: number[]): string {
  if (!weeks.length) return '';
  const ranges = mergeRanges(weeks.map((w) => [w, w] as [number, number]));
  return ranges.map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`)).join(',');
}

// 只保留与 [start, end] 有重叠的段，并把段截断到该区间
function itemsInWeekRange(items: Item[], start: number, end: number): Item[] {
  const out: Item[] = [];
  for (const it of items) {
    const segs = it.option.segments
      .filter((s) => s.startWeek <= end && s.endWeek >= start)
      .map((s) => ({ ...s, startWeek: Math.max(s.startWeek, start), endWeek: Math.min(s.endWeek, end) }));
    if (segs.length) out.push({ course: it.course, option: { ...it.option, segments: segs } });
  }
  return out;
}

// 学期占用热力图：grid[day][node] = 该 (星期几, 节次) 有几周「至少有一门课」（0..totalWeeks）
export function occupancyHeatmap(schedule: Schedule): number[][] {
  const { daysPerWeek, nodesPerDay, totalWeeks } = schedule.meta;
  const items = fixedItems(schedule);
  const grid = Array.from({ length: daysPerWeek }, () => Array<number>(nodesPerDay).fill(0));
  for (let w = 1; w <= totalWeeks; w++) {
    const occupied = new Set<string>();
    for (const it of items) {
      for (const s of it.option.segments) {
        if (s.day < 1 || s.day > daysPerWeek) continue;
        if (w < s.startWeek || w > s.endWeek) continue;
        for (let n = s.startNode; n < s.startNode + s.step; n++) {
          if (n >= 1 && n <= nodesPerDay) occupied.add(`${s.day}:${n}`);
        }
      }
    }
    for (const key of occupied) {
      const idx = key.indexOf(':');
      const d = Number(key.slice(0, idx)) - 1;
      const n = Number(key.slice(idx + 1)) - 1;
      grid[d][n]++;
    }
  }
  return grid;
}

export interface GanttBar {
  courseId: string;
  name: string;
  color: string;
  day: number; // 1..7
  start: number; // 起始周
  end: number; // 结束周
}

// 课程甘特图：每个 (课程, 星期几) 的周区间合并后生成一条（或多条）横条。
export function ganttBars(schedule: Schedule): GanttBar[] {
  const items = fixedItems(schedule);
  const byCourseDay = new Map<string, { courseId: string; name: string; color: string; day: number; ranges: Array<[number, number]> }>();
  for (const it of items) {
    for (const s of it.option.segments) {
      const key = `${it.course.id}:${s.day}`;
      let e = byCourseDay.get(key);
      if (!e) {
        e = { courseId: it.course.id, name: it.course.name, color: it.course.color, day: s.day, ranges: [] };
        byCourseDay.set(key, e);
      }
      e.ranges.push([s.startWeek, s.endWeek]);
    }
  }
  const bars: GanttBar[] = [];
  for (const e of byCourseDay.values()) {
    for (const [s, end] of mergeRanges(e.ranges)) {
      bars.push({ courseId: e.courseId, name: e.name, color: e.color, day: e.day, start: s, end });
    }
  }
  return bars;
}
