// 选课助手 · 浏览器插件核心（可测试、环境无关）导出。
// 后续 content script / background 都从这里取逻辑。
export { parseScheduleText } from './scheduleText';
export type { RawLesson, ImportedOption, ImportedCourse } from './model';
export { rawLessonToOption, lessonsToCourses, buildAddCourseCommands } from './model';
export { rowToRawLesson, adaptJsonSearchResponse } from './jsonAdapter';
export { rowElementToRawLesson, extractRawLessonsFromDom } from './domExtractor';
export { elTableRowToRawLesson, extractSelectionLessons, elTableRowToSelectedLesson, extractSelectedLessonsFromDom } from './selectionExtractor';
export type { SelectionLesson, SelectedLessonRef } from './selectionExtractor';
export { buildEnrollmentCommands, buildEnrollmentReport, buildEnrollmentUpdates, buildSelectableCommands, buildUpdateCommands, buildActualSelectionCommand, summarizeSelectedRefs, courseCodesOf } from './updateEnrollment';
export type { EnrollmentUpdate, SelectableUpdate, NotFoundCourse, NotFoundOptions, UpdateReport } from './updateEnrollment';
