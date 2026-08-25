import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptJsonSearchResponse } from '../src/jsonAdapter';

// 模拟 jwxt 全校开课查询接口的 DataTables 响应（字段结构已从页面渲染代码确认）
const resp = {
  draw: 1,
  recordsTotal: 3,
  recordsFiltered: 3,
  data: [
    {
      id: 340578,
      code: 'D01M11011.01',
      nameZh: '全校',
      course: { id: 63997, code: 'D01M11011', nameZh: '系统可靠性评定方法', credits: 1 },
      stdCount: 0,
      limitCount: 88,
      teacherAssignmentList: [{ person: { nameZh: '薛小锋' }, role: 'MAJOR' }],
      scheduleText: { dateTimePlacePersonText: { textZh: '3~6周 周六 第一节~第四节 友谊校区 诚字楼212 薛小锋' } },
    },
    {
      id: 340579,
      code: 'U01G11001.01',
      nameZh: '25级 航空 数学必修【重修或补修】',
      course: { id: 100, code: 'U01G11001', nameZh: '线性代数', credits: 2.5 },
      stdCount: 0,
      limitCount: 30,
      teacherAssignmentList: [{ person: { nameZh: '李元' }, role: 'MAJOR' }],
      scheduleText: {
        dateTimePlacePersonText: {
          textZh: '2~11周 周二 第十一节~第十二节 长安校区 教西C2-204 李元;\n2~11周 周四 第十一节~第十二节 长安校区 教西C2-204 李元',
        },
      },
    },
    {
      id: 340580,
      code: 'U01G11001.02',
      nameZh: '26级 【1院 黄玉珊班 强基班 必修】',
      course: { id: 100, code: 'U01G11001', nameZh: '线性代数', credits: 2.5 },
      stdCount: 88,
      limitCount: 85,
      teacherAssignmentList: [{ person: { nameZh: '杨扬' }, role: 'MAJOR' }],
      scheduleText: {
        dateTimePlacePersonText: {
          textZh: '2~11周 周一 第十一节~第十二节 长安校区 教西B2-201 杨扬;\n2~11周 周三 第十一节~第十二节 长安校区 教西B2-201 杨扬',
        },
      },
    },
  ],
};

test('接受完整 DataTables 响应对象', () => {
  const lessons = adaptJsonSearchResponse(resp);
  assert.equal(lessons.length, 3);
});

test('字段映射：编号/名称/学分/教学班/教师/已选/容量', () => {
  const lessons = adaptJsonSearchResponse(resp);
  const l = lessons[0];
  assert.equal(l.courseCode, 'D01M11011');
  assert.equal(l.courseName, '系统可靠性评定方法');
  assert.equal(l.credit, 1);
  assert.equal(l.lessonCode, 'D01M11011.01');
  assert.equal(l.lessonName, '全校');
  assert.equal(l.teacher, '薛小锋');
  assert.equal(l.enrolled, 0);
  assert.equal(l.capacity, 88);
  assert.equal(l.scheduleText, '3~6周 周六 第一节~第四节 友谊校区 诚字楼212 薛小锋');
});

test('接受裸数组', () => {
  const lessons = adaptJsonSearchResponse(resp.data);
  assert.equal(lessons.length, 3);
});

test('缺字段时给出 null 而非抛错', () => {
  const lessons = adaptJsonSearchResponse({
    data: [{ course: { code: 'X', nameZh: '缺字段课' } }],
  });
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].enrolled, null);
  assert.equal(lessons[0].capacity, null);
  assert.equal(lessons[0].scheduleText, '');
});
