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

// 「已选课程」tab 里的一行：实际已完成选课操作的教学班引用（用于前端「选课情况」标红校验）。
export interface SelectedLessonRef {
  courseCode: string;
  lessonCode: string;
  courseName: string;
}

export function elTableRowToSelectedLesson(tr: Element): SelectedLessonRef | null {
  const lesson = elTableRowToRawLesson(tr);
  if (!lesson) return null;
  return { courseCode: lesson.courseCode, lessonCode: lesson.lessonCode, courseName: lesson.courseName };
}

// 从「已选课程」tab 收集实际已选的教学班编号。
// 该 tab 的表格结构与「全部课程」一致（.course-name/.lesson-code 等 class 选择器），
// 区别仅在于状态列为 .drop-label「已选中」，无需过滤即可全部收集。
// 直接以 #selected-lesson 容器为作用域，避免误收其它隐藏 tab 的表格行。
export function extractSelectedLessonsFromDom(doc: Document): SelectedLessonRef[] {
  const root = doc.getElementById('selected-lesson') ?? doc;
  return Array.from(root.querySelectorAll('tr.el-table__row'))
    .map(elTableRowToSelectedLesson)
    .filter((r): r is SelectedLessonRef => r != null);
}
