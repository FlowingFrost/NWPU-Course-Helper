import type { Segment } from '../../shared/types';

// 解析教务系统「时间地点」文本 → Segment[]。
// 输入形如：
//   "3~6周 周六 第一节~第四节 友谊校区 诚字楼212 薛小锋"
//   "2~11周 周二 第十一节~第十二节 长安校区 教西C2-204 李元;  2~11周 周四 第十一节~第十二节 长安校区 教西C2-204 李元"
// 规则（与 docs/西工大课程网页文本读取说明.md 对齐）：
//   - 多条时间段以 `;`/`；`/换行 分隔
//   - 周次支持 `N`、`N~M`、`N,M`、`N~M(单/双)`
//   - 节次支持中文数字（第十一节）与阿拉伯数字
//   - 校区：`长安校区` 为默认校区，忽略；`友谊校区` 等非默认校区保留为 room 前缀

const DAY_MAP: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const DEFAULT_CAMPUS = '长安校区';

// 中文数字 → 数字（兼容阿拉伯数字，支持 1~99 内的中文写法）
function cnNum(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (s === '十') return 10;
  if (s.startsWith('十')) return 10 + (map[s[1]] ?? 0);
  if (s.endsWith('十')) return (map[s[0]] ?? 0) * 10;
  if (s.includes('十')) {
    const [t, o] = s.split('十');
    return (map[t] ?? 0) * 10 + (map[o] ?? 0);
  }
  return map[s] ?? 0;
}

// 周次表达式 → 孤立周列表： "15"→[15]；"11~13"→[11,12,13]；"3,6~10(双)"→[3,6,8,10]
function parseWeeks(expr: string): number[] {
  const result: number[] = [];
  for (const rawPart of expr.split(/[,，]/)) {
    const part = rawPart.trim();
    if (!part) continue;
    let parity: 'all' | 'even' | 'odd' = 'all';
    if (/\(双\)/.test(part)) parity = 'even';
    else if (/\(单\)/.test(part)) parity = 'odd';
    const clean = part.replace(/\([单双]\)/g, '').trim();
    const m = /^(\d+)(?:[-~～](\d+))?$/.exec(clean);
    if (!m) continue;
    const s = Number(m[1]);
    const e = m[2] ? Number(m[2]) : s;
    for (let w = s; w <= e; w++) {
      if (parity === 'even' && w % 2 !== 0) continue;
      if (parity === 'odd' && w % 2 !== 1) continue;
      result.push(w);
    }
  }
  return [...new Set(result)].sort((a, b) => a - b);
}

// 孤立周列表 → 若干「连续周区间」段：连续周合并，断点各自成段
function weeksToSegments(weeks: number[], base: Omit<Segment, 'startWeek' | 'endWeek'>): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  while (i < weeks.length) {
    let j = i;
    while (j + 1 < weeks.length && weeks[j + 1] === weeks[j] + 1) j++;
    out.push({ ...base, startWeek: weeks[i], endWeek: weeks[j] });
    i = j + 1;
  }
  return out;
}

// 单段时间地点：周次 + 星期 + 起止节 + 「校区 教室 教师」
const SEG_RE = /^(.+?)周\s+周([一二三四五六日天])\s+第([一二三四五六七八九十\d]+)节[~～\-]第([一二三四五六七八九十\d]+)节\s*(.*)$/;

// teacherOverride：选课 SPA 的「时间地点」文本不含教师（教师单独成列），
// 此时外部把教师传入；否则把最后一个 token 视为教师（全校开课查询的格式）。
export function parseScheduleText(text: string, teacherOverride?: string): Segment[] {
  const parts = text
    .split(/[;；\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const segments: Segment[] = [];
  for (const part of parts) {
    const m = SEG_RE.exec(part);
    if (!m) continue;
    const weeks = parseWeeks(m[1]);
    const startNode = cnNum(m[3]);
    const endNode = cnNum(m[4]);
    if (!weeks.length || endNode < startNode) continue;

    const tokens = (m[5] ?? '').trim().split(/\s+/).filter(Boolean);
    const teacher = teacherOverride ?? (tokens.length ? tokens[tokens.length - 1] : '');
    const middle = teacherOverride !== undefined ? tokens : tokens.slice(0, -1);
    const campuses = middle.filter((t) => t.endsWith('校区') && t !== DEFAULT_CAMPUS);
    const roomParts = middle.filter((t) => !t.endsWith('校区'));
    const room = [...campuses, ...roomParts].join(' ');

    segments.push(
      ...weeksToSegments(weeks, { day: DAY_MAP[m[2]] ?? 1, startNode, step: endNode - startNode + 1, room, teacher }),
    );
  }
  return segments;
}
