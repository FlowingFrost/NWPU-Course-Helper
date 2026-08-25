// 集成测试：真实 fixture → 解析/映射 → POST /api/command → 落盘验证。
// 依赖服务端已运行（npm start / tsx server/index.ts）。运行后自动恢复原存档。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lessonsToCourses, buildAddCourseCommands } from '../src/model';
import type { RawLesson } from '../src/model';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3001';

const fixture: RawLesson[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/real-rows.json'), 'utf-8'),
).map((r: any) => ({
  courseCode: r.courseCode,
  courseName: r.courseName,
  credit: Number(r.credit),
  lessonCode: r.lessonCode,
  lessonName: r.lessonName,
  teacher: r.teacher,
  enrolled: r.enrolled,
  capacity: r.capacity,
  scheduleText: r.scheduleText,
}));

async function main() {
  const before = await (await fetch(`${BASE}/api/schedule`)).json();

  const courses = lessonsToCourses(fixture, 'elective');
  const commands = buildAddCourseCommands(courses);
  console.log('命令数（课程数）:', commands.length, ' 候选数:', courses.reduce((n, c) => n + c.options.length, 0));

  const r = await fetch(`${BASE}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const resp = await r.json();
  if (!r.ok || !resp.ok) {
    throw new Error('POST /api/command 失败: ' + JSON.stringify(resp));
  }

  const after = await (await fetch(`${BASE}/api/schedule`)).json();
  const added = after.courses.length - before.courses.length;
  console.log('落盘前课程数:', before.courses.length, ' 后:', after.courses.length, ' 新增:', added);

  const xd = after.courses.find((c: any) => c.code === 'U01G11001');
  if (!xd) throw new Error('未找到线性代数');
  console.log('线性代数候选数:', xd.options.length, ' 首候选段数:', xd.options[0].segments.length);
  console.log('首候选 label:', xd.options[0].label, ' enrolled:', xd.options[0].enrolled, ' capacity:', xd.options[0].capacity);
  console.log('首候选 room:', xd.options[0].segments[0]?.room, ' teacher:', xd.options[0].segments[0]?.teacher);

  const sys = after.courses.find((c: any) => c.code === 'D01M11011');
  console.log('系统可靠性评定方法 room:', sys?.options[0]?.segments[0]?.room);

  // 恢复原存档
  await fetch(`${BASE}/api/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(before),
  });
  console.log('已恢复原存档（课程数回到', before.courses.length, '）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
