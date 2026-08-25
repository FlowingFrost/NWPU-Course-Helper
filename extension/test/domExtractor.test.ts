import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { extractRawLessonsFromDom, extractCheckedLessonsFromDom } from '../src/domExtractor';
import { lessonsToCourses } from '../src/model';

// 用真实保存的「全校开课查询」结果页 tbody 做 DOM 抓取测试
const tbody = readFileSync(new URL('./fixtures/query-tbody.html', import.meta.url), 'utf-8');
const dom = new JSDOM(`<!doctype html><html><body><table>${tbody}</table></body></html>`);

test('从真实页面提取 20 个教学班', () => {
  const lessons = extractRawLessonsFromDom(dom.window.document);
  assert.equal(lessons.length, 20);
});

test('首行字段与真实数据一致', () => {
  const lessons = extractRawLessonsFromDom(dom.window.document);
  const l = lessons[0];
  assert.equal(l.courseName, '系统可靠性评定方法');
  assert.equal(l.courseCode, 'D01M11011');
  assert.equal(l.lessonCode, 'D01M11011.01');
  assert.equal(l.lessonName, '全校');
  assert.equal(l.credit, 1);
  assert.equal(l.teacher, '薛小锋');
  assert.equal(l.enrolled, 0);
  assert.equal(l.capacity, 88);
});

test('分组后 15 门课，线性代数 2 候选', () => {
  const lessons = extractRawLessonsFromDom(dom.window.document);
  const courses = lessonsToCourses(lessons, 'elective');
  assert.equal(courses.length, 15);
  const xd = courses.find((c) => c.code === 'U01G11001');
  assert.equal(xd?.options.length, 2);
});

test('只提取被勾选（model_id:checked）的行', () => {
  const doc2 = new JSDOM(`<!doctype html><html><body><table>${tbody}</table></body></html>`).window.document;
  const cbs = doc2.querySelectorAll('input[name="model_id"]');
  (cbs[0] as HTMLInputElement).checked = true;
  (cbs[2] as HTMLInputElement).checked = true;
  const lessons = extractCheckedLessonsFromDom(doc2);
  assert.equal(lessons.length, 2);
  assert.equal(lessons[0].courseCode, 'D01M11011');
  assert.equal(lessons[1].courseCode, 'M01M11023');
});
