import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleText } from '../src/scheduleText';

test('单段：友谊校区保留 + 星期/节次/周次解析', () => {
  const segs = parseScheduleText('3~6周 周六 第一节~第四节 友谊校区 诚字楼212 薛小锋');
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0], {
    day: 6,
    startNode: 1,
    step: 4,
    startWeek: 3,
    endWeek: 6,
    room: '友谊校区 诚字楼212',
    teacher: '薛小锋',
  });
});

test('长安校区默认忽略，中文节次「第十一节」', () => {
  const segs = parseScheduleText('2~11周 周二 第十一节~第十二节 长安校区 教西C2-204 李元');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].room, '教西C2-204');
  assert.equal(segs[0].day, 2);
  assert.equal(segs[0].startNode, 11);
  assert.equal(segs[0].step, 2);
  assert.equal(segs[0].teacher, '李元');
});

test('多段 ; 分隔，含单周「9周」与带括号教室', () => {
  const segs = parseScheduleText(
    '2~8周 周二 第一节~第二节 长安校区 教西B1-303 陶亮;  9周 周二 第一节~第二节 长安校区 实验大楼B110（软件实验室） 陶亮',
  );
  assert.equal(segs.length, 2);
  assert.equal(segs[1].startWeek, 9);
  assert.equal(segs[1].endWeek, 9);
  assert.equal(segs[1].room, '实验大楼B110（软件实验室）');
});

test('不同周不同老师拆成多段（第十一节~第十三节 → step=3）', () => {
  const segs = parseScheduleText(
    '10~14周 周二 第十一节~第十三节 长安校区 教西D-104 安伟刚;  15~17周 周二 第十一节~第十三节 长安校区 教西D-104 刘斌',
  );
  assert.equal(segs.length, 2);
  assert.equal(segs[0].teacher, '安伟刚');
  assert.equal(segs[0].startWeek, 10);
  assert.equal(segs[0].endWeek, 14);
  assert.equal(segs[0].step, 3);
  assert.equal(segs[1].teacher, '刘斌');
  assert.equal(segs[1].startWeek, 15);
  assert.equal(segs[1].endWeek, 17);
});

test('单双周：3,6~10(双)周 → 孤立周各自成段', () => {
  const segs = parseScheduleText('3,6~10(双)周 周一 第一节~第二节 长安校区 教东A-101 张三');
  assert.deepEqual(
    segs.map((s) => [s.startWeek, s.endWeek]),
    [
      [3, 3],
      [6, 6],
      [8, 8],
      [10, 10],
    ],
  );
});

test('换行分隔多段（来自 JSON textZh）', () => {
  const segs = parseScheduleText(
    '2~11周 周二 第十一节~第十二节 长安校区 教西C2-204 李元;\n2~11周 周四 第十一节~第十二节 长安校区 教西C2-204 李元',
  );
  assert.equal(segs.length, 2);
  assert.equal(segs[0].day, 2);
  assert.equal(segs[1].day, 4);
});

test('teacherOverride：选课 SPA 文本不含教师，教师来自单独列', () => {
  const segs = parseScheduleText(
    '1~8周 周二 第一节~第二节 长安校区 教东B2-204; 1~8周 周四 第一节~第二节 长安校区 教东B2-204',
    '曲仕茹',
  );
  assert.equal(segs.length, 2);
  assert.equal(segs[0].teacher, '曲仕茹');
  assert.equal(segs[0].room, '教东B2-204');
  assert.equal(segs[0].day, 2);
  assert.equal(segs[0].startNode, 1);
  assert.equal(segs[0].step, 2);
  assert.equal(segs[1].day, 4);
});
