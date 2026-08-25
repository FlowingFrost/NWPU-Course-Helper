import type { Schedule, Course, Option, Segment } from '../../shared/types';
import { emptyOption } from './mutations';
import { fixedItems as collectFixedItems } from './schedule';

export interface ChosenItem {
  course: Course;
  option: Option;
}

export interface ScheduleResult {
  items: ChosenItem[]; // 全部（内置 + 确认选 + 待选），用于渲染
  chosen: ChosenItem[]; // 仅待选课程（未确认选），用于评分
  ratingAgg: number; // 候选总体评分（学分加权平均）
  willingTotal: number; // 意愿值求和
  totalCredit: number; // 全部课程学分
  electiveCount: number; // 非必修门数
  finalScore: number; // 70% 意愿 + 30% 评分
}

// 意愿值公式（α=0）：m≤n → 0；否则 round(√(m-n)·e^(m/n))，结果能被 5 整除则 +1
export function willingValue(m: number, n: number): number {
  if (m <= n) return 0;
  let v = Math.round(Math.sqrt(m - n) * Math.exp(m / n));
  if (v % 5 === 0) v += 1;
  return v;
}

export function effectiveWilling(course: Course, option: Option): number {
  if (course.willingOverride != null) return course.willingOverride;
  return willingValue(option.enrolled, option.capacity);
}

export function segmentsConflict(a: Segment, b: Segment): boolean {
  if (a.day !== b.day) return false;
  const aEnd = a.startNode + a.step;
  const bEnd = b.startNode + b.step;
  const nodeOverlap = Math.max(a.startNode, b.startNode) < Math.min(aEnd, bEnd);
  const weekOverlap = Math.max(a.startWeek, b.startWeek) <= Math.min(a.endWeek, b.endWeek);
  return nodeOverlap && weekOverlap;
}

export function optionsConflict(a: Option, b: Option): boolean {
  for (const sa of a.segments) {
    for (const sb of b.segments) {
      if (segmentsConflict(sa, sb)) return true;
    }
  }
  return false;
}

export function combinationConflicts(options: Option[]): boolean {
  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      if (optionsConflict(options[i], options[j])) return true;
    }
  }
  return false;
}

export function creditWeightedRating(pairs: Array<{ credit: number; rating: number }>): number {
  const total = pairs.reduce((n, p) => n + p.credit, 0);
  if (total === 0) return 0;
  return pairs.reduce((n, p) => n + p.credit * p.rating, 0) / total;
}

export function scoreCombination(ratingAgg: number, willingTotal: number, budget: number): number {
  const ratingScore = Math.min(5, Math.max(0, ratingAgg)) / 5;
  const willingScore = Math.max(0, 1 - willingTotal / budget);
  return 0.3 * ratingScore + 0.7 * willingScore;
}

// 每个「选择组」是一组可选的 (course, option)；串联课程合并为同一组
function cartesian(groups: ChosenItem[][]): ChosenItem[][] {
  let acc: ChosenItem[][] = [[]];
  for (const group of groups) {
    const next: ChosenItem[][] = [];
    for (const combo of acc) {
      for (const item of group) {
        next.push([...combo, item]);
      }
    }
    acc = next;
  }
  return acc;
}

// 按 linkId 把课程分组成「串联组」（未串联的课各自一组）
function groupCourses(courses: Course[]): Course[][] {
  const byLink = new Map<string, Course[]>();
  const singles: Course[][] = [];
  for (const c of courses) {
    if (c.linkId) {
      const arr = byLink.get(c.linkId) ?? [];
      arr.push(c);
      byLink.set(c.linkId, arr);
    } else {
      singles.push([c]);
    }
  }
  return [...singles, ...byLink.values()];
}

// 一组课程 → 所有可选 (course, option) 列表
function toGroup(courses: Course[]): ChosenItem[] {
  return courses.flatMap((c) => {
    const opts = c.options.length ? c.options : [emptyOption()];
    return opts.map((o) => ({ course: c, option: o }));
  });
}

function subsets<T>(arr: T[], maxSize: number | 'max'): T[][] {
  const n = arr.length;
  const cap = maxSize === 'max' ? n : Math.min(maxSize, n);
  const out: T[][] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    let bits = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) bits++;
    if (bits > cap) continue;
    const sub: T[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(arr[i]);
    out.push(sub);
  }
  return out;
}

// 组合枚举 + 排序：必修各取一候选，非必修取大小≤K 的子集并各取一候选
export function enumerateSchedules(schedule: Schedule, electiveTarget: number | 'max'): ScheduleResult[] {
  const required = schedule.courses.filter((c) => c.category === 'required');
  const allElectives = schedule.courses.filter((c) => c.category === 'elective');

  // 固定课程（内置 + 已确认选的必修/非必修）
  const fixedItems = collectFixedItems(schedule);
  const fixedCourses = fixedItems.map((f) => f.course);

  // 固定课程自身冲突或超学分 → 无解
  if (combinationConflicts(fixedItems.map((f) => f.option))) return [];
  const cap = schedule.meta.creditCap;
  const fixedCredit = fixedCourses.reduce((n, c) => n + c.credit, 0);
  if (fixedCredit > cap) return [];

  // 已被「确认选」的串联组：组内其它课程不再参与排课（只选其一）。
  // 不参与排课的课程不算「已选定」，避免其所在串联组被误判为已敲定。
  const chosenLinkIds = new Set<string>();
  for (const c of schedule.courses) {
    if (c.linkId && c.participating !== false && c.options.some((o) => o.selected)) chosenLinkIds.add(c.linkId);
  }

  const reqChoices = groupCourses(
    required.filter((c) => c.participating !== false && !c.options.some((o) => o.selected) && !(c.linkId && chosenLinkIds.has(c.linkId))),
  ).map(toGroup);

  const elecChoices = groupCourses(
    allElectives.filter((c) => c.participating !== false && !c.options.some((o) => o.selected) && !(c.linkId && chosenLinkIds.has(c.linkId))),
  ).map(toGroup);

  const results: ScheduleResult[] = [];
  const budget = schedule.meta.willingBudget;

  for (const reqCombo of cartesian(reqChoices)) {
    const reqOpts = reqCombo.map((x) => x.option);
    if (combinationConflicts([...fixedItems.map((f) => f.option), ...reqOpts])) continue;
    const reqCredit = reqCombo.reduce((n, x) => n + x.course.credit, 0);
    if (fixedCredit + reqCredit > cap) continue;

    for (const elecSubset of subsets(elecChoices, electiveTarget)) {
      for (const elecCombo of cartesian(elecSubset)) {
        const elecOpts = elecCombo.map((x) => x.option);
        if (combinationConflicts([...fixedItems.map((f) => f.option), ...reqOpts, ...elecOpts])) continue;
        const elecCredit = elecCombo.reduce((n, x) => n + x.course.credit, 0);
        const totalCredit = fixedCredit + reqCredit + elecCredit;
        if (totalCredit > cap) continue;

        const chosen = [...reqCombo, ...elecCombo];
        const ratingAgg = creditWeightedRating(chosen.map((x) => ({ credit: x.course.credit, rating: x.option.rating })));
        // 意愿值：内置课已选课成功（不计）；「确认选」与「待选」的必修/非必修都计入（超容量才产生意愿值）
        const willingTotal = [...fixedItems.filter((f) => f.course.category !== 'builtin'), ...chosen].reduce(
          (n, x) => n + effectiveWilling(x.course, x.option),
          0,
        );
        const finalScore = scoreCombination(ratingAgg, willingTotal, budget);

        results.push({
          items: [...fixedItems, ...chosen],
          chosen,
          ratingAgg,
          willingTotal,
          totalCredit,
          electiveCount: elecCombo.length,
          finalScore,
        });
      }
    }
  }

  results.sort(
    (a, b) =>
      b.finalScore - a.finalScore ||
      a.willingTotal - b.willingTotal ||
      b.ratingAgg - a.ratingAgg ||
      b.electiveCount - a.electiveCount, // 其余相同时，非必修门数多者优先
  );
  return results;
}

export interface DiagnosisItem {
  type: 'credit' | 'fixed-conflict' | 'required-blocked' | 'required-pair';
  message: string;
}

// 无可行组合时的诊断：找出具体冲突或学分原因，供用户排查
export function diagnoseNoSolution(schedule: Schedule): DiagnosisItem[] {
  const items: DiagnosisItem[] = [];
  const required = schedule.courses.filter((c) => c.category === 'required');

  // 固定：内置 + 已确认选的候选
  const fixed = collectFixedItems(schedule);

  const cap = schedule.meta.creditCap;
  const fixedCredit = fixed.reduce((n, f) => n + f.course.credit, 0);
  const reqCourses = required.filter((c) => c.participating !== false && !c.options.some((o) => o.selected));
  const reqCredit = reqCourses.reduce((n, c) => n + c.credit, 0);
  const minCredit = fixedCredit + reqCredit;

  // 1) 学分：必修 + 内置/确认选 的最低学分（非必修可选，不计入最小值）
  if (minCredit > cap) {
    items.push({
      type: 'credit',
      message: `学分超上限：必修 + 内置/确认选课程至少 ${minCredit} 学分，超过上限 ${cap} 学分。`,
    });
  }

  // 2) 固定（内置/确认选）课程互相冲突
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      if (optionsConflict(fixed[i].option, fixed[j].option)) {
        items.push({
          type: 'fixed-conflict',
          message: `固定课程互相冲突：「${fixed[i].course.name}」与「${fixed[j].course.name}」时间重叠。`,
        });
      }
    }
  }

  // 3) 必修课被固定课程堵死：所有候选都与固定课程冲突
  for (const rc of reqCourses) {
    const opts = rc.options.length ? rc.options : [emptyOption()];
    const hasValid = opts.some((o) => fixed.every((f) => !optionsConflict(o, f.option)));
    if (!hasValid) {
      const blockers = new Set<string>();
      for (const o of opts) {
        for (const f of fixed) {
          if (optionsConflict(o, f.option)) blockers.add(f.course.name);
        }
      }
      items.push({
        type: 'required-blocked',
        message: `必修课「${rc.name}」的所有候选都与固定课程冲突${blockers.size ? `（冲突：${[...blockers].join('、')}）` : ''}。`,
      });
    }
  }

  // 4) 必修课两两无法同时安排（各自能与已选共存，但彼此候选全冲突）
  for (let i = 0; i < reqCourses.length; i++) {
    for (let j = i + 1; j < reqCourses.length; j++) {
      const a = reqCourses[i];
      const b = reqCourses[j];
      const aOpts = a.options.length ? a.options : [emptyOption()];
      const bOpts = b.options.length ? b.options : [emptyOption()];
      const aValid = aOpts.filter((o) => fixed.every((f) => !optionsConflict(o, f.option)));
      const bValid = bOpts.filter((o) => fixed.every((f) => !optionsConflict(o, f.option)));
      if (aValid.length === 0 || bValid.length === 0) continue; // 已由步骤 3 覆盖
      const compatible = aValid.some((oa) => bValid.some((ob) => !optionsConflict(oa, ob)));
      if (!compatible) {
        items.push({
          type: 'required-pair',
          message: `必修课「${a.name}」与「${b.name}」无法同时安排：所有候选组合都时间冲突。`,
        });
      }
    }
  }

  return items;
}
