import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { extractSelectionLessons } from '../src/selectionExtractor';
import { lessonsToCourses } from '../src/model';

// 用真实保存的「选课 SPA 已选课程」el-table 做提取测试
const tbody = readFileSync(new URL('./fixtures/selection-tbody.html', import.meta.url), 'utf-8');
const dom = new JSDOM(`<!doctype html><html><body><table>${tbody}</table></body></html>`);

test('选课 SPA el-table 提取 21 个教学班', () => {
  const lessons = extractSelectionLessons(dom.window.document);
  assert.equal(lessons.length, 21);
});

test('首行字段：名称/代码/学分/教学班/教师/已选容量/状态', () => {
  const lessons = extractSelectionLessons(dom.window.document);
  const first = lessons[0];
  assert.equal(first.lesson.courseName, 'AutoCAD软件及应用');
  assert.equal(first.lesson.courseCode, 'U09M11042');
  assert.equal(first.lesson.credit, 2);
  assert.equal(first.lesson.lessonCode, 'U09M11042.01');
  assert.equal(first.lesson.teacher, '曲仕茹');
  assert.equal(first.lesson.enrolled, 1);
  assert.equal(first.lesson.capacity, 30);
  assert.equal(first.status, '待选课');
});

test('映射后：教师来自单独列，教室正确（时间地点文本不含教师）', () => {
  const lessons = extractSelectionLessons(dom.window.document);
  const courses = lessonsToCourses(
    lessons.map((l) => l.lesson),
    'elective',
  );
  const first = courses.find((c) => c.code === 'U09M11042');
  assert.ok(first);
  assert.equal(first.options[0].segments.length, 2);
  assert.equal(first.options[0].segments[0].teacher, '曲仕茹');
  assert.equal(first.options[0].segments[0].room, '教东B2-204');
  assert.equal(first.options[0].segments[0].day, 2);
  assert.equal(first.options[0].segments[0].startNode, 1);
  assert.equal(first.options[0].segments[0].step, 2);
});

test('回归：课程名不包含注入的按钮文字', () => {
  const doc2 = new JSDOM(`<!doctype html><html><body><table>${tbody}</table></body></html>`).window.document;
  const row = doc2.querySelector('tr.el-table__row')!;
  // 模拟内容脚本把「加入候选/预览」按钮注入到 .course-name 内部
  const nameEl = row.querySelector('.course-name')!;
  const fake = doc2.createElement('span');
  fake.className = 'ch-row-actions';
  fake.innerHTML = '<button>加入候选</button><button>预览</button>';
  nameEl.appendChild(fake);

  const lessons = extractSelectionLessons(doc2);
  assert.equal(lessons[0].lesson.courseName, 'AutoCAD软件及应用');
  assert.ok(!lessons[0].lesson.courseName.includes('加入候选'));
});
