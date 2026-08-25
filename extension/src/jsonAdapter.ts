import type { RawLesson } from './model';

// 教务「全校开课查询」接口响应的 DataTables 行结构（已从页面渲染代码确认字段路径）。
// 响应形如：{ draw, recordsTotal, recordsFiltered, data: [ row, ... ] }
// 每行关键字段：course.code/nameZh/credits、code(教学班编号)、nameZh(教学班名)、
//   stdCount(已选)、limitCount(容量)、teacherAssignmentList、scheduleText.dateTimePlacePersonText.textZh

interface JsonRow {
  id?: unknown;
  code?: unknown;
  nameZh?: unknown;
  course?: {
    code?: unknown;
    nameZh?: unknown;
    credits?: unknown;
  };
  stdCount?: unknown;
  limitCount?: unknown;
  teacherAssignmentList?: Array<{ person?: { nameZh?: unknown; nameEn?: unknown }; role?: unknown }>;
  scheduleText?: {
    dateTimePlacePersonText?: { textZh?: unknown; textEn?: unknown } | string;
  };
}

type JsonResponse = { data?: JsonRow[] } | JsonRow[];

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 授课教师：teacherAssignmentList 里按 role 拼 person.nameZh
function teacherName(list: JsonRow['teacherAssignmentList']): string {
  if (!Array.isArray(list)) return '';
  return list
    .map((item) => {
      const p = item?.person;
      return str(p?.nameZh || p?.nameEn);
    })
    .filter(Boolean)
    .join(',');
}

function scheduleTextOf(row: JsonRow): string {
  const st = row.scheduleText;
  if (st == null) return '';
  if (typeof st === 'string') return st;
  const d = st.dateTimePlacePersonText;
  if (typeof d === 'string') return d;
  return str(d?.textZh || d?.textEn);
}

export function rowToRawLesson(row: JsonRow): RawLesson | null {
  const courseName = str(row.course?.nameZh);
  const courseCode = str(row.course?.code);
  if (!courseCode && !courseName) return null;
  return {
    courseCode,
    courseName,
    credit: num(row.course?.credits) ?? 0,
    lessonCode: str(row.code),
    lessonName: str(row.nameZh),
    teacher: teacherName(row.teacherAssignmentList),
    enrolled: num(row.stdCount),
    capacity: num(row.limitCount),
    scheduleText: scheduleTextOf(row),
  };
}

// 接受完整 DataTables 响应对象或裸数组
export function adaptJsonSearchResponse(resp: JsonResponse): RawLesson[] {
  const rows: JsonRow[] = Array.isArray(resp) ? resp : (resp?.data ?? []);
  return rows.map(rowToRawLesson).filter((r): r is RawLesson => r != null);
}
