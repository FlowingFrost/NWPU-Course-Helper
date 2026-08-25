import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonsToCourses, buildAddCourseCommands } from '../src/model';
import type { RawLesson } from '../src/model';

const raws: RawLesson[] = [
  {
    courseCode: 'U01G11001',
    courseName: '线性代数',
    credit: 2.5,
    lessonCode: 'U01G11001.01',
    lessonName: 'A班',
    teacher: '李元',
    enrolled: 0,
    capacity: 30,
    scheduleText: '2~11周 周二 第十一节~第十二节 长安校区 教西C2-204 李元',
  },
  {
    courseCode: 'U01G11001',
    courseName: '线性代数',
    credit: 2.5,
    lessonCode: 'U01G11001.02',
    lessonName: 'B班',
    teacher: '杨扬',
    enrolled: 88,
    capacity: 85,
    scheduleText: '2~11周 周一 第十一节~第十二节 长安校区 教西B2-201 杨扬',
  },
  {
    courseCode: 'D01M11011',
    courseName: '系统可靠性评定方法',
    credit: 1,
    lessonCode: 'D01M11011.01',
    lessonName: '全校',
    teacher: '薛小锋',
    enrolled: 0,
    capacity: 88,
    scheduleText: '3~6周 周六 第一节~第四节 友谊校区 诚字楼212 薛小锋',
  },
];

test('按课程编号分组成 2 门课，线性代数 2 候选', () => {
  const courses = lessonsToCourses(raws, 'elective');
  assert.equal(courses.length, 2);
  const xd = courses.find((c) => c.code === 'U01G11001');
  assert.equal(xd?.options.length, 2);
  const sys = courses.find((c) => c.code === 'D01M11011');
  assert.equal(sys?.options.length, 1);
});

test('buildAddCourseCommands：形状正确、rating 未识别则不带', () => {
  const courses = lessonsToCourses(raws, 'elective');
  const cmds = buildAddCourseCommands(courses);
  assert.equal(cmds.length, 2);

  const xd = cmds.find((c) => c.op === 'add_course' && c.code === 'U01G11001')!;
  assert.equal(xd.category, 'elective');
  assert.equal(xd.credit, 2.5);
  assert.equal(xd.options.length, 2);
  assert.ok(!('rating' in xd.options[0]), 'rating 不应出现在命令里（保留用户手填值）');
  assert.equal(xd.options[1].enrolled, 88);
  assert.equal(xd.options[1].capacity, 85);

  // segments 已被 parseScheduleText 解析
  assert.equal(xd.options[0].segments.length, 1);
  assert.equal(xd.options[0].segments[0].room, '教西C2-204');
  assert.equal(xd.options[0].segments[0].startNode, 11);
});

test('builtin 类别命令也生成（导入为已选课场景）', () => {
  const courses = lessonsToCourses([raws[2]], 'builtin');
  const cmds = buildAddCourseCommands(courses);
  assert.equal(cmds[0].category, 'builtin');
});
