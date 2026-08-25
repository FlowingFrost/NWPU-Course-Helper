import type { Schedule } from './types';
import type { Command } from './commands';
import { parseWebCoursesText } from './webtext';

export function findCourseByName(schedule: Schedule, name: string): { courseId: string; optionId?: string } | undefined {
  const n = name.trim();
  const c = schedule.courses.find((x) => x.name === n || x.name.includes(n) || n.includes(x.name));
  if (!c) return undefined;
  return { courseId: c.id, optionId: c.options[0]?.id };
}

// —— 解析规则注册表 ——
// 每条规则尝试把文本解析成命令；不匹配时返回 null。
// 新增一种格式/指令，只需新增一个 ParseRule 对象并加入 parseRules 数组。
export interface ParseRule {
  name: string;
  parse: (text: string, schedule: Schedule) => Command[] | null;
}

function norm(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// 规则 1：教务「课程信息表格」网页文本
const webCourseRule: ParseRule = {
  name: '教务网页课程文本',
  parse(text) {
    try {
      const courses = parseWebCoursesText(text);
      if (!courses.length) return null;
      return courses.map((c) => ({
        op: 'add_course' as const,
        name: c.name,
        category: c.category,
        code: c.code,
        credit: c.credit,
        participating: c.participating,
        options: c.options.map((o) => ({
          label: o.label || undefined,
          rating: o.rating,
          enrolled: o.enrolled,
          capacity: o.capacity,
          segments: o.segments,
        })),
      }));
    } catch {
      return null;
    }
  },
};

// 规则 2：添加课程
const addCourseRule: ParseRule = {
  name: '添加课程',
  parse(text) {
    const m = /^(?:添加|新增|创建)课程\s+(.+)$/.exec(norm(text));
    if (!m) return null;
    const rest = m[1];
    let category: 'builtin' | 'required' | 'elective' = 'builtin';
    if (/必修/.test(rest)) category = 'required';
    else if (/非必修|选修|兴趣/.test(rest)) category = 'elective';
    const creditM = /([0-9]+(?:\.[0-9]+)?)\s*学分/.exec(rest);
    const name = rest
      .replace(/必修|非必修|选修|兴趣/g, '')
      .replace(/[0-9]+(?:\.[0-9]+)?\s*学分/g, '')
      .trim();
    if (!name) return null;
    const cmd: Extract<Command, { op: 'add_course' }> = { op: 'add_course', name, category };
    if (creditM) cmd.credit = Number(creditM[1]);
    return [cmd];
  },
};

// 规则 3：删除课程
const deleteCourseRule: ParseRule = {
  name: '删除课程',
  parse(text, schedule) {
    const m = /^(?:删除|移除)课程?\s*(.+)$/.exec(norm(text));
    if (!m) return null;
    const found = findCourseByName(schedule, m[1].trim());
    return found ? [{ op: 'delete_course', courseId: found.courseId }] : null;
  },
};

// 规则 4：改类别
const categoryRule: ParseRule = {
  name: '改类别',
  parse(text, schedule) {
    const m = /^(?:把|将)?(.+?)\s*(?:设为|改为|改成)\s*(内置|必修|非必修)$/.exec(norm(text));
    if (!m) return null;
    const found = findCourseByName(schedule, m[1].trim());
    if (!found) return null;
    return [{ op: 'update_course', courseId: found.courseId, patch: { category: m[2] as 'builtin' | 'required' | 'elective' } }];
  },
};

// 规则 5：已选/容量
const enrollmentRule: ParseRule = {
  name: '已选容量',
  parse(text, schedule) {
    const m = /(.+?)\s*已选\s*(\d+)\s*(?:满|\/)\s*(\d+)/.exec(norm(text));
    if (!m) return null;
    const found = findCourseByName(schedule, m[1].trim());
    if (!found?.optionId) return null;
    return [{ op: 'set_enrollment', optionId: found.optionId, enrolled: Number(m[2]), capacity: Number(m[3]) }];
  },
};

// 规则 6：评分
const ratingRule: ParseRule = {
  name: '评分',
  parse(text, schedule) {
    const m = /(.+?)\s*(?:评|评分)\s*([0-9]+(?:\.[0-9]+)?)\s*分/.exec(norm(text));
    if (!m) return null;
    const found = findCourseByName(schedule, m[1].trim());
    if (!found?.optionId) return null;
    return [{ op: 'set_rating', optionId: found.optionId, rating: Number(m[2]) }];
  },
};

// 规则注册表（按顺序尝试）
export const parseRules: ParseRule[] = [webCourseRule, addCourseRule, deleteCourseRule, categoryRule, enrollmentRule, ratingRule];

export function parseCommands(schedule: Schedule, message: string): Command[] {
  for (const rule of parseRules) {
    const cmds = rule.parse(message, schedule);
    if (cmds && cmds.length > 0) return cmds;
  }
  return [];
}
