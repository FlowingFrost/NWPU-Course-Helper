import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnrollmentCommands, buildEnrollmentReport, buildUpdateCommands, courseCodesOf } from '../src/updateEnrollment';
import type { Schedule } from '../../shared/types';
import type { RawLesson } from '../src/model';

const schedule: Schedule = {
  meta: {
    school: '测试', term: '大三上', startDate: '2026-09-02', daysPerWeek: 7, nodesPerDay: 13,
    totalWeeks: 16, creditCap: 30, willingBudget: 150,
  },
  nodeTimes: [],
  teacherRatings: [],
  courses: [
    {
      id: 'crs_a', code: 'U01G11001', name: '线性代数', category: 'required', credit: 2.5,
      willingOverride: null, color: '#f00',
      options: [
        { id: 'opt_a1', label: 'U01G11001.01', rating: 4, selected: false, enrolled: 0, capacity: 30, segments: [] },
        { id: 'opt_a2', label: 'U01G11001.02', rating: 4, selected: false, enrolled: 88, capacity: 85, segments: [] },
      ],
    },
    {
      id: 'crs_b', code: 'D01M11011', name: '系统可靠性评定方法', category: 'elective', credit: 1,
      willingOverride: null, color: '#0f0',
      options: [
        { id: 'opt_b1', label: 'D01M11011.01', rating: 0, selected: false, enrolled: 5, capacity: 88, segments: [] },
      ],
    },
    {
      id: 'crs_c', code: '', name: '无编号课程', category: 'elective', credit: 1,
      willingOverride: null, color: '#00f',
      options: [
        { id: 'opt_c1', label: '张三 班', rating: 0, selected: false, enrolled: 0, capacity: 0, segments: [] },
      ],
    },
  ],
};

const lessons: RawLesson[] = [
  { courseCode: 'U01G11001', courseName: '线性代数', credit: 2.5, lessonCode: 'U01G11001.01', lessonName: 'A', teacher: '李元', enrolled: 12, capacity: 30, scheduleText: '2~11周 周二 第十一节~第十二节 长安校区 教西C2-204 李元' },
  { courseCode: 'U01G11001', courseName: '线性代数', credit: 2.5, lessonCode: 'U01G11001.02', lessonName: 'B', teacher: '杨扬', enrolled: 90, capacity: 85, scheduleText: '2~11周 周一 第十一节~第十二节 长安校区 教西B2-201 杨扬' },
  { courseCode: 'D01M11011', courseName: '系统可靠性评定方法', credit: 1, lessonCode: 'D01M11011.01', lessonName: '全校', teacher: '薛小锋', enrolled: 5, capacity: 88, scheduleText: '3~6周 周六 第一节~第四节 友谊校区 诚字楼212 薛小锋' },
];

test('courseCodesOf：只返回非空课程编号并去重', () => {
  assert.deepEqual(courseCodesOf(schedule), ['U01G11001', 'D01M11011']);
});

test('buildEnrollmentCommands：只更新有变化的候选', () => {
  const cmds = buildEnrollmentCommands(schedule, lessons);
  // opt_a1: 0→12 变化；opt_a2: 88→90 变化；opt_b1: 5→5 无变化；opt_c1 label 无匹配
  assert.equal(cmds.length, 2);
  assert.equal(cmds[0].op, 'set_enrollment');
  assert.equal(cmds[0].optionId, 'opt_a1');
  assert.equal(cmds[0].enrolled, 12);
  assert.equal(cmds[0].capacity, 30);
  assert.equal(cmds[1].optionId, 'opt_a2');
  assert.equal(cmds[1].enrolled, 90);
});

test('无匹配时返回空命令', () => {
  const cmds = buildEnrollmentCommands(schedule, []);
  assert.equal(cmds.length, 0);
});

test('buildEnrollmentReport：未查到课程（无编号）单独列出', () => {
  const report = buildEnrollmentReport(schedule, lessons);
  assert.equal(report.updates.length, 2);
  assert.equal(report.notFoundCourses.length, 1);
  assert.equal(report.notFoundCourses[0].name, '无编号课程');
  assert.equal(report.notFoundCourses[0].code, '');
  assert.equal(report.notFoundOptions.length, 0);
});

test('buildEnrollmentReport：课程查到但部分教学班未匹配', () => {
  const sched: Schedule = {
    ...schedule,
    courses: [
      {
        id: 'crs_x', code: 'X123', name: '某课程', category: 'elective', credit: 1,
        willingOverride: null, color: '#000',
        options: [
          { id: 'opt_x1', label: 'X123.01', rating: 0, selected: false, enrolled: 0, capacity: 30, segments: [] },
          { id: 'opt_x2', label: 'X123.02', rating: 0, selected: false, enrolled: 0, capacity: 30, segments: [] },
        ],
      },
    ],
  };
  const ls: RawLesson[] = [
    { courseCode: 'X123', courseName: '某课程', credit: 1, lessonCode: 'X123.01', lessonName: 'A', teacher: '王', enrolled: 10, capacity: 30, scheduleText: '1~8周 周一 第一节~第二节 长安校区 教A-101 王' },
  ];
  const report = buildEnrollmentReport(sched, ls);
  assert.equal(report.updates.length, 1); // X123.01 0→10
  assert.equal(report.notFoundCourses.length, 0); // 课程查到了
  assert.equal(report.notFoundOptions.length, 1); // X123.02 没匹配
  assert.equal(report.notFoundOptions[0].courseName, '某课程');
  assert.deepEqual(report.notFoundOptions[0].labels, ['X123.02']);
});

test('buildEnrollmentReport：开放选课同步（匹配→开放，未匹配→不开放）', () => {
  const sched: Schedule = {
    ...schedule,
    courses: [
      {
        id: 'crs_x', code: 'X123', name: '某课程', category: 'elective', credit: 1,
        willingOverride: null, color: '#000',
        options: [
          // 已标开放、但这次查到了 → 保持开放，无变化
          { id: 'opt_x1', label: 'X123.01', rating: 0, selected: false, enrolled: 0, capacity: 30, selectable: true, segments: [] },
          // 未标、查到了 → 改为开放
          { id: 'opt_x2', label: 'X123.02', rating: 0, selected: false, enrolled: 0, capacity: 30, segments: [] },
          // 已标开放、但这次没查到 → 改为不开放
          { id: 'opt_x3', label: 'X123.03', rating: 0, selected: false, enrolled: 0, capacity: 30, selectable: true, segments: [] },
        ],
      },
    ],
  };
  const ls: RawLesson[] = [
    { courseCode: 'X123', courseName: '某课程', credit: 1, lessonCode: 'X123.01', lessonName: 'A', teacher: '王', enrolled: 10, capacity: 30, scheduleText: '1~8周 周一 第一节~第二节 长安校区 教A-101 王' },
    { courseCode: 'X123', courseName: '某课程', credit: 1, lessonCode: 'X123.02', lessonName: 'B', teacher: '李', enrolled: 5, capacity: 30, scheduleText: '1~8周 周二 第一节~第二节 长安校区 教A-101 李' },
  ];
  const report = buildEnrollmentReport(sched, ls);
  // opt_x1: matched + already true → no change
  // opt_x2: matched + undefined → true
  // opt_x3: not matched + true → false
  assert.equal(report.selectableUpdates.length, 2);
  assert.equal(report.selectableUpdates[0].label, 'X123.02');
  assert.equal(report.selectableUpdates[0].selectable, true);
  assert.equal(report.selectableUpdates[1].label, 'X123.03');
  assert.equal(report.selectableUpdates[1].selectable, false);
});

test('buildUpdateCommands：包含 set_enrollment 与 update_option(selectable)', () => {
  const sched: Schedule = {
    ...schedule,
    courses: [
      {
        id: 'crs_x', code: 'X123', name: '某课程', category: 'elective', credit: 1,
        willingOverride: null, color: '#000',
        options: [
          { id: 'opt_x1', label: 'X123.01', rating: 0, selected: false, enrolled: 0, capacity: 30, selectable: true, segments: [] },
        ],
      },
    ],
  };
  const ls: RawLesson[] = [
    { courseCode: 'X123', courseName: '某课程', credit: 1, lessonCode: 'X123.01', lessonName: 'A', teacher: '王', enrolled: 10, capacity: 30, scheduleText: '1~8周 周一 第一节~第二节 长安校区 教A-101 王' },
  ];
  const cmds = buildUpdateCommands(sched, ls);
  // 一条 set_enrollment（0→10），一条 update_option（selectable 已 true，无变化 → 没有）
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0].op, 'set_enrollment');
  assert.equal(cmds[0].enrolled, 10);
});
