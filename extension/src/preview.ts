import type { Schedule, Course } from '../../shared/types';
import { fixedItems, candidateItems, dayBlocks, layoutBlocks, type Item, type LaidBlock } from '../../src/lib/schedule';
import { resolveCourseColors, tintColor } from '../../src/lib/colors';
import { parseScheduleText } from './scheduleText';
import type { RawLesson } from './model';

// 迷你课表预览渲染器：复用选课助手的 dayBlocks/layoutBlocks 布局与配色，
// 在教务页面里悬停「预览」按钮时，弹出「内置课 + 当前课程高亮 + 其它候选淡化」的小课表。
// 尺寸随视口相对缩放；「均分列宽」跟随设置（meta.evenCardWidth）。
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const HEAD_H = 22;
const PREVIEW_COLOR = '#f59e0b';
const PREVIEW_ID = '__ch_preview__';

export function buildPreviewElement(schedule: Schedule, lesson: RawLesson): HTMLElement {
  const { daysPerWeek, nodesPerDay } = schedule.meta;
  const vw = window.innerWidth || 1200;
  const vh = window.innerHeight || 800;

  // 相对尺寸：节高按视口高度分摊；列宽在算出各天重叠数后再定
  const nodeH = Math.max(26, Math.min(42, Math.floor((vh * 0.62) / nodesPerDay)));
  const gridH = nodesPerDay * nodeH;
  const availW = Math.min(vw * 0.92, 1000) - 16; // 可用网格总宽

  const segments = parseScheduleText(lesson.scheduleText);

  const previewCourse: Course = {
    id: PREVIEW_ID,
    code: lesson.courseCode,
    name: lesson.courseName,
    category: 'elective',
    credit: lesson.credit,
    willingOverride: null,
    color: PREVIEW_COLOR,
    options: [
      {
        id: '__ch_preview_opt__',
        label: lesson.lessonCode,
        rating: 0,
        selected: false,
        enrolled: lesson.enrolled ?? 0,
        capacity: lesson.capacity ?? 0,
        segments,
      },
    ],
  };
  const previewItem: Item = { course: previewCourse, option: previewCourse.options[0] };

  const fixed = fixedItems(schedule);
  const others = candidateItems(schedule).filter((it) => it.course.code !== lesson.courseCode);
  const allItems: Item[] = [...fixed, ...others, previewItem];
  const colors = resolveCourseColors(schedule.courses);

  // 固定课占用的 (day:node) 集合，用于冲突检测
  const fixedCells = new Set<string>();
  const days = Array.from({ length: daysPerWeek }, (_, i) => i + 1);
  const laidByDay: Array<Array<{ block: LaidBlock; isFixed: boolean; isPreview: boolean }>> = [];
  for (const d of days) {
    const dayArr: Array<{ block: LaidBlock; isFixed: boolean; isPreview: boolean }> = [];
    for (const b of layoutBlocks(dayBlocks(allItems, d, 'all'))) {
      const isPreview = b.course.id === PREVIEW_ID;
      const isFixed = !isPreview && b.fixed;
      dayArr.push({ block: b, isFixed, isPreview });
      if (isFixed) for (let n = b.startNode; n < b.endNode; n++) fixedCells.add(`${d}:${n}`);
    }
    laidByDay.push(dayArr);
  }

  // 列宽：均分（默认）或按「当天最大重叠课程数」比例分配（跟随 meta.evenCardWidth）
  const evenCardWidth = schedule.meta.evenCardWidth === true;
  const colWEqual = Math.max(112, Math.floor(availW / daysPerWeek));
  const lanesPerDay = laidByDay.map((arr) => (arr.length ? Math.max(1, ...arr.map((x) => x.block.laneCount)) : 1));
  const laneSum = lanesPerDay.reduce((a, b) => a + b, 0);
  const dayW = lanesPerDay.map((l) => (evenCardWidth ? Math.max(1, Math.floor((availW * l) / laneSum)) : colWEqual));
  const dayLeft: number[] = [0];
  for (let i = 1; i < daysPerWeek; i++) dayLeft.push(dayLeft[i - 1] + dayW[i - 1]);
  const gridW = dayLeft[daysPerWeek - 1] + dayW[daysPerWeek - 1];

  const wrap = document.createElement('div');
  wrap.className = 'ch-preview';
  wrap.style.cssText =
    'background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.22);' +
    'padding:8px 10px;font:12px/1.35 sans-serif;color:#0f172a;cursor:default;' +
    'max-width:92vw;overflow-x:auto;overflow-y:auto;';

  const title = document.createElement('div');
  title.textContent = `${lesson.courseName}（${lesson.courseCode}）· 位置预览`;
  title.style.cssText = 'font-weight:700;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  wrap.appendChild(title);

  // 星期表头（按各天实际列宽）
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;';
  for (let i = 0; i < daysPerWeek; i++) {
    const h = document.createElement('div');
    h.textContent = DAY_NAMES[i];
    h.style.cssText = `flex:0 0 ${dayW[i]}px;text-align:center;font-weight:600;line-height:${HEAD_H}px;`;
    head.appendChild(h);
  }
  wrap.appendChild(head);

  // 网格
  const grid = document.createElement('div');
  grid.style.cssText =
    `position:relative;width:${gridW}px;height:${gridH}px;overflow:hidden;` +
    `background-image:repeating-linear-gradient(to right,#eef2f7 0,#eef2f7 1px,transparent 1px,transparent ${colWEqual}px),` +
    `repeating-linear-gradient(to bottom,#eef2f7 0,#eef2f7 1px,transparent 1px,transparent ${nodeH}px);`;
  wrap.appendChild(grid);

  laidByDay.forEach((dayArr, di) => {
    const d = di + 1;
    for (const { block, isFixed, isPreview } of dayArr) {
      const baseColor = isPreview ? PREVIEW_COLOR : colors.get(block.course.id) ?? block.course.color ?? '#64748b';
      const laneW = dayW[di] / block.laneCount;

      let conflict = false;
      if (isPreview) {
        for (let n = block.startNode; n < block.endNode; n++) if (fixedCells.has(`${d}:${n}`)) conflict = true;
      }

      const el = document.createElement('div');
      el.style.cssText =
        `position:absolute;box-sizing:border-box;left:${dayLeft[di] + block.lane * laneW + 1}px;` +
        `top:${(block.startNode - 1) * nodeH + 1}px;width:${laneW - 2}px;height:${(block.endNode - block.startNode) * nodeH - 2}px;` +
        `border-left:3px solid ${baseColor};background:${tintColor(baseColor)};border-radius:4px;` +
        `padding:1px 4px;overflow:hidden;color:${isPreview ? '#7c4a03' : '#0f172a'};` +
        (isPreview
          ? `box-shadow:0 0 0 2px ${conflict ? '#dc2626' : PREVIEW_COLOR};font-weight:700;`
          : isFixed
            ? 'opacity:1;'
            : 'opacity:0.4;');
      el.title = `${block.course.name} · ${block.teachers.join('/')} · ${block.weekLabel} · ${block.room}${conflict ? '（与内置课冲突）' : ''}`;

      const nameEl = document.createElement('div');
      nameEl.textContent = block.course.name + (conflict ? ' ⚠' : '');
      nameEl.style.cssText = 'font-weight:600;line-height:1.15;word-break:break-all;';
      el.appendChild(nameEl);

      const teachers = block.teachers.join('/');
      if (teachers) {
        const metaEl = document.createElement('div');
        metaEl.textContent = teachers;
        metaEl.style.cssText = 'font-size:10px;opacity:0.85;line-height:1.1;word-break:break-all;';
        el.appendChild(metaEl);
      }

      grid.appendChild(el);
    }
  });

  const note = document.createElement('div');
  note.textContent = '橙=当前课程（与内置课重叠标 ⚠），实心=内置课，半透明=其它候选；每格一节。';
  note.style.cssText = 'margin-top:6px;color:#64748b;font-size:11px;';
  wrap.appendChild(note);

  return wrap;
}
