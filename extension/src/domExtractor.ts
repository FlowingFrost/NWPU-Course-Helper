import type { RawLesson } from './model';

// 从教务「全校开课查询」结果页 DOM 提取 RawLesson[]（兜底路径）。
// 结果表格结构（8 列，已从真实页面确认）：
//   [0] 复选框(model_id) [1] 课程信息 [2] 教学班 [3] 学分 [4] 教师 [5] 期中退课 [6] 周次 [7] 时间地点
// 关键单元格都带 data-text 干净全文，直接读属性即可。

function attr(el: Element | null, name: string): string {
  return (el?.getAttribute(name) ?? '').trim();
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').trim();
}

function numText(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? n : null;
}

export function rowElementToRawLesson(tr: Element): RawLesson | null {
  const name = attr(tr.querySelector('.course-name'), 'data-text');
  if (!name) return null; // 表头/隐藏行等无课程名的行跳过

  const code = text(tr.querySelector('[data-original-title="课程代码"]'));
  const lessonCode = attr(tr.querySelector('.lesson-code'), 'data-text');
  const lessonName = attr(tr.querySelector('.lesson-name'), 'data-text');
  const teacher = attr(tr.querySelector('.course-teacher'), 'data-text');
  const scheduleText = attr(tr.querySelector('.course-datetime-place'), 'data-text');

  const tds = Array.from(tr.querySelectorAll('td'));
  // 列序：0 复选框 / 1 课程信息 / 2 教学班 / 3 学分 / 4 教师 / 5 期中退课 / 6 周次 / 7 时间地点
  const credit = numText(text(tds[3] ?? null)) ?? 0;

  let enrolled: number | null = null;
  let capacity: number | null = null;
  const en = /(\d+)\s*\/\s*(\d+)\s*人/.exec(text(tr.querySelector('[data-original-title="实际/上限人数"]')));
  if (en) {
    enrolled = Number(en[1]);
    capacity = Number(en[2]);
  }

  return {
    courseCode: code,
    courseName: name,
    credit,
    lessonCode,
    lessonName,
    teacher,
    enrolled,
    capacity,
    scheduleText,
  };
}

export function extractLessonsFromRows(rows: Element[]): RawLesson[] {
  return rows.map(rowElementToRawLesson).filter((r): r is RawLesson => r != null);
}

export function extractRawLessonsFromDom(doc: Document): RawLesson[] {
  const rows = Array.from(doc.querySelectorAll('tbody tr[role="row"]'));
  return extractLessonsFromRows(rows);
}

// 只提取页面里被勾选（checkbox name="model_id"）的行
export function extractCheckedLessonsFromDom(doc: Document): RawLesson[] {
  const checked = Array.from(doc.querySelectorAll('input[name="model_id"]:checked'));
  const rows = checked
    .map((cb) => cb.closest('tr'))
    .filter((tr): tr is HTMLTableRowElement => tr != null);
  return extractLessonsFromRows(rows);
}
