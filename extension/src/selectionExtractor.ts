import type { RawLesson } from './model';

// 选课 SPA（course-selection）「全部课程 / 已选课程」的 el-table 行 → RawLesson。
// 表格 8 列：课程信息 / 教学班 / 授课教师 / 时间地点 / 已选人数上限 / 是否期中退课 / 选课状态 / 操作
// 注意：此处「时间地点」文本不含教师（教师单独一列），需用 parseScheduleText(text, teacher)。

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// 课程代码：td[0] 里形如 U09M11042 的 el-tooltip 文本
function findCode(tr: Element): string {
  for (const t of Array.from(tr.querySelectorAll('.el-tooltip'))) {
    const v = textOf(t);
    if (/^[A-Za-z][A-Za-z0-9]*\d+$/.test(v)) return v;
  }
  return '';
}

function findCredit(tr: Element): number {
  const m = /(\d+(?:\.\d+)?)\s*学分/.exec(tr.textContent ?? '');
  return m ? Number(m[1]) : 0;
}

function findEnrollment(tr: Element): { enrolled: number | null; capacity: number | null } {
  for (const td of Array.from(tr.querySelectorAll('td'))) {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(textOf(td));
    if (m) return { enrolled: Number(m[1]), capacity: Number(m[2]) };
  }
  return { enrolled: null, capacity: null };
}

export function elTableRowToRawLesson(tr: Element): RawLesson | null {
  // 课程名取 .course-name 里的 <a> 链接文本，避免读到注入的「加入候选/预览」按钮文字
  const name = textOf(tr.querySelector('.course-name a') ?? tr.querySelector('.course-name'));
  if (!name) return null;
  const lessonName = textOf(tr.querySelector('.lesson-name .normal-lesson-name') ?? tr.querySelector('.lesson-name'));
  const teacher = textOf(tr.querySelector('.course-teacher .normal-teachers') ?? tr.querySelector('.course-teacher'));
  const scheduleText = textOf(
    tr.querySelector('.dateTimePlace .normal-dateTimePlace') ?? tr.querySelector('.dateTimePlace'),
  );
  const { enrolled, capacity } = findEnrollment(tr);
  return {
    courseCode: findCode(tr),
    courseName: name,
    credit: findCredit(tr),
    lessonCode: textOf(tr.querySelector('.lesson-code')),
    lessonName,
    teacher,
    enrolled,
    capacity,
    scheduleText,
    teacherInScheduleText: false, // 选课 SPA 教师单独成列，文本末尾无教师
  };
}

export interface SelectionLesson {
  lesson: RawLesson;
  status: string; // 选课状态：待选课 / 已选 / …
}

export function elTableRowToSelectionLesson(tr: Element): SelectionLesson | null {
  const lesson = elTableRowToRawLesson(tr);
  if (!lesson) return null;
  const status = textOf(tr.querySelector('.select-label'));
  return { lesson, status };
}

export function extractSelectionLessons(doc: Document): SelectionLesson[] {
  return Array.from(doc.querySelectorAll('tr.el-table__row'))
    .map(elTableRowToSelectionLesson)
    .filter((r): r is SelectionLesson => r != null);
}
