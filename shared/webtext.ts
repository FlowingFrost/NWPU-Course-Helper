import type { Segment, Category } from './types';

// 解析结果（比 Course 更原始）：未识别到的字段用 undefined 表示，供合并时「识别到才替换」
export interface ParsedOption {
  label: string;
  rating?: number;
  enrolled?: number; // undefined = 未识别到「N/M人」
  capacity?: number; // undefined = 未识别到容量
  segments: Segment[]; // 空数组 = 未识别到时间段
}

export interface ParsedCourse {
  name: string;
  code: string;
  category: Category;
  credit: number;
  participating?: boolean;
  color: string;
  options: ParsedOption[];
}

// 教务系统「课程信息表格」网页文本解析器。
// 表格固定 7 列，列顺序固定，但 2~7 列可被人为关闭；采用「按模式扫描」逐行识别，健壮性好。

const DAY_MAP: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

const PALETTE = ['#1d4ed8', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#ca8a04'];

function pickColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// 中文数字 → 数字（兼容阿拉伯数字）
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

// 表头行（"1-课程信息"、"6建议排课周次"、"7时间地点" 等，含无连字符）
const HEADER_RE = /^\d+\s*[-—]?\s*(课程信息|教学班|学分|授课教师|是否允许期中退课|建议排课周次|时间地点)\s*$/;

// 时间地点行：周次可为 "11~13周"、"15周"、"3,6~10(双)周" 等；节次支持中文/阿拉伯数字
const SEG_RE = /^(.+?)周\s+周([一二三四五六日天])\s+第([一二三四五六七八九十\d]+)节[~～]第([一二三四五六七八九十\d]+)节\s*(.+)$/;

// 教学班编号：U04M11297.01（字母开头 + 点 + 数字）
const CLASS_ID_RE = /^[A-Za-z][A-Za-z0-9]*\.\d+$/;

// 学分：纯数字
const CREDIT_RE = /^\d+(\.\d+)?$/;

// 建议排课周次：10-16
const WEEKS_RE = /^\d+\s*-\s*\d+$/;

// 解析「周次表达式」为孤立周列表：
//   "15"        → [15]
//   "11~13"     → [11,12,13]
//   "3,6~10(双)" → [3,6,8,10]（双周=偶数周；单周=奇数周）
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

// 把周列表转成若干段：连续周合并为一段，断开的孤立周各自成段
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

// 相邻节次合并：同一 星期/教室/老师/周次覆盖，且节次紧邻（第7-8节 + 第9-10节 → 第7-10节）
function weeksKey(s: Segment): string {
  return s.startWeek === s.endWeek ? `w${s.startWeek}` : `r${s.startWeek}-${s.endWeek}`;
}

function mergeAdjacentSegments(segments: Segment[]): Segment[] {
  const groups = new Map<string, Segment[]>();
  for (const s of segments) {
    const k = `${s.day}|${s.room}|${s.teacher}|${weeksKey(s)}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
  }
  const out: Segment[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.startNode - b.startNode);
    const merged: Segment[] = [];
    for (const s of arr) {
      const last = merged[merged.length - 1];
      if (last && last.startNode + last.step === s.startNode) {
        last.step = last.step + s.step;
      } else {
        merged.push({ ...s });
      }
    }
    out.push(...merged);
  }
  return out;
}

export function parseWebCourseText(text: string): ParsedCourse {
  const raw = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lines = raw.filter((l) => !HEADER_RE.test(l));
  if (lines.length === 0) throw new Error('空文本');

  let name = lines[0] ?? '';
  let code = '';
  let category: Category = 'required';
  let credit = 0;
  let enrolled = 0;
  let capacity = 0;
  let optionLabel = '';
  const segments: Segment[] = [];
  let hasEnrollment = false; // 是否识别到「N/M人」行
  let hasCapacityNote = false; // 是否识别到「选课人数上限」备注

  for (const line of lines) {
    // 时间地点
    const seg = SEG_RE.exec(line);
    if (seg) {
      const weeks = parseWeeks(seg[1]);
      const rest = seg[5].replace(/[;；]\s*$/, '').trim();
      const tokens = rest.split(/\s+/).filter(Boolean);
      const base = {
        day: DAY_MAP[seg[2]] ?? 1,
        startNode: cnNum(seg[3]),
        step: cnNum(seg[4]) - cnNum(seg[3]) + 1,
        room: tokens.length >= 2 ? tokens[tokens.length - 2] : '',
        teacher: tokens[tokens.length - 1] ?? '',
      };
      segments.push(...weeksToSegments(weeks, base));
      continue;
    }

    // 编号行 / 学时容量行（含 "|"）
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      if (/^[A-Za-z0-9]+$/.test(parts[0] ?? '')) code = parts[0];
      const last = parts[parts.length - 1] ?? '';
      if (/选修|任选|通识/.test(last)) category = 'elective';
      else if (/必修/.test(last)) category = 'required';
      const en = /(\d+)\s*\/\s*(\d+)\s*人/.exec(line);
      if (en) {
        hasEnrollment = true;
        enrolled = Number(en[1]);
        capacity = Number(en[2]);
      }
      continue;
    }

    // 教学班编号：U04M11297.01
    if (CLASS_ID_RE.test(line)) {
      optionLabel = line;
      continue;
    }

    // 学分：纯数字
    if (CREDIT_RE.test(line)) {
      credit = Number(line);
      continue;
    }

    // 备注「选课人数上限 N」→ 覆盖容量（如 "备注:选课人数上限140"）
    const capNote = /选课人数上限\s*[:：]?\s*(\d+)/.exec(line);
    if (capNote) {
      hasCapacityNote = true;
      capacity = Number(capNote[1]);
      continue;
    }

    // 建议排课周次 / 期中退课 / 授课教师 / 教学班描述 / "是否必修" 等杂行 → 忽略
  }

  if (!code) throw new Error('未识别到课程编号（「课程信息」列缺失或格式不符）');

  const mergedSegments = mergeAdjacentSegments(segments);

  return {
    code,
    name,
    category,
    credit,
    participating: category === 'elective' ? true : undefined,
    color: pickColor(name),
    options: [
      {
        label: optionLabel,
        enrolled: hasEnrollment ? enrolled : undefined,
        capacity: hasEnrollment || hasCapacityNote ? capacity : undefined,
        segments: mergedSegments,
      },
    ],
  };
}

// 按空行分割成多个「课程块」；再把「无编号行的碎片」合并回上一块（处理块内空行）
function splitBlocks(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (cur.length) {
        blocks.push(cur.join('\n'));
        cur = [];
      }
    } else {
      cur.push(line);
    }
  }
  if (cur.length) blocks.push(cur.join('\n'));

  const merged: string[] = [];
  for (const b of blocks) {
    const hasCode = /^[A-Za-z0-9]+\s*\|/m.test(b);
    if (!hasCode && merged.length > 0) merged[merged.length - 1] += '\n' + b;
    else merged.push(b);
  }
  return merged;
}

// 「识别到才替换」：仅用 next 中已识别的字段覆盖 prev（未识别的字段保留旧值）
function mergeParsedOption(prev: ParsedOption, next: ParsedOption): ParsedOption {
  return {
    label: next.label || prev.label,
    rating: next.rating ?? prev.rating,
    enrolled: next.enrolled ?? prev.enrolled,
    capacity: next.capacity ?? prev.capacity,
    segments: next.segments.length > 0 ? next.segments : prev.segments,
  };
}

// 一次解析多个课程块：同名/同编号的块合并为「一门课 + 多个候选（教学班）」
export function parseWebCoursesText(text: string): ParsedCourse[] {
  const courses: ParsedCourse[] = [];
  for (const block of splitBlocks(text)) {
    const c = parseWebCourseText(block);
    const existing = courses.find((x) => (c.code && x.code === c.code) || (!c.code && x.name === c.name));
    if (existing) {
      for (const o of c.options) {
        const idx = o.label ? existing.options.findIndex((eo) => eo.label === o.label) : -1;
        if (idx >= 0) {
          existing.options[idx] = mergeParsedOption(existing.options[idx], o);
        } else {
          existing.options.push(o);
        }
      }
    } else {
      courses.push(c);
    }
  }
  return courses;
}
