import type { Schedule, Course, Option } from '../../shared/types';
import { fixedItems, candidateItems, dayBlocks, layoutBlocks, type Item, type LaidBlock } from '../../src/lib/schedule';
import { optionsConflict } from '../../src/lib/algo';
import { resolveCourseColors, tintColor } from '../../src/lib/colors';
import { DAY_FULL } from '../../src/lib/labels';
import { infoOf, coInfoOf, classBadge } from '../../src/lib/display';
import { parseScheduleText } from './scheduleText';
import type { RawLesson } from './model';

// 迷你课表预览渲染器：复用选课助手的 dayBlocks/layoutBlocks 布局与配色，
// 在教务页面里悬停「预览」按钮时，弹出「内置课 + 当前课程高亮 + 其它候选淡化」的小课表。
// 尺寸随视口相对缩放；「均分列宽」跟随设置（meta.evenCardWidth）。
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

  // 教学班匹配：按 courseCode + lessonCode 命中已有候选（内置/确认选/待选），
  // 命中时高亮该已有课程，而不是在旁边新建一个临时课程、再与它自身判冲突。
  let matchedItem: Item | null = null;
  outer: for (const c of schedule.courses) {
    if (lesson.courseCode && c.code !== lesson.courseCode) continue;
    for (const o of c.options) {
      if (lesson.lessonCode && o.label && o.label === lesson.lessonCode) {
        matchedItem = { course: c, option: o };
        break outer;
      }
    }
  }

  const isMatched = (it: Item) =>
    matchedItem != null && it.course.id === matchedItem.course.id && it.option.id === matchedItem.option.id;

  // 固定课（内置 + 确认选）：命中项移出，避免与预览自身重叠/自冲突
  const fixed = fixedItems(schedule).filter((it) => !isMatched(it));
  // 其它候选：排除命中课程本身 + 同课程编号的其它教学班
  let others = candidateItems(schedule, schedule.meta.hideSelectedCandidates !== false)
    .filter((it) => !isMatched(it))
    .filter((it) => it.course.code !== lesson.courseCode);

  // 复用网页显示规则（读存档 meta）：
  // - 显示非必修：关闭时过滤非必修候选
  // - 过滤冲突课程：过滤与固定课冲突的候选
  // - 单/双课表：双课表仅展示左表（固定课 + 当前课程），不展示待选候选
  const view = schedule.meta;
  const info = infoOf(schedule.meta, 'plugin');
  const coInfo = coInfoOf(schedule.meta);
  if (view.showElectives === false) {
    others = others.filter((it) => it.course.category !== 'elective');
  }
  if (view.filterConflicts === true) {
    const fixedOpts = fixed.map((it) => it.option);
    others = others.filter((it) => !fixedOpts.some((fo) => optionsConflict(it.option, fo)));
  }
  if (view.viewMode === 'double') {
    others = [];
  }

  let previewItem: Item;
  if (matchedItem) {
    previewItem = matchedItem;
  } else {
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
    previewItem = { course: previewCourse, option: previewCourse.options[0] };
  }

  const allItems: Item[] = [...fixed, ...others, previewItem];
  const colors = resolveCourseColors(schedule.courses);
  const previewKey = `${previewItem.course.id}:${previewItem.option.id}`;

  // 固定课占用的 (day:node) 集合，用于冲突检测
  const fixedCells = new Set<string>();
  const days = Array.from({ length: daysPerWeek }, (_, i) => i + 1);
  const laidByDay: Array<Array<{ block: LaidBlock; isFixed: boolean; isPreview: boolean }>> = [];
  for (const d of days) {
    const dayArr: Array<{ block: LaidBlock; isFixed: boolean; isPreview: boolean }> = [];
    for (const b of layoutBlocks(dayBlocks(allItems, d, 'all'))) {
      const isPreview = `${b.course.id}:${b.option.id}` === previewKey;
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
    h.textContent = DAY_FULL[i];
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

      const teacherText = [block.teachers, ...(block.coOptions ?? []).map((co) => co.teachers)]
        .map((ts) => ts.join(' '))
        .filter((s) => s !== '')
        .join(' / ');

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
      el.title = `${block.course.name} · ${teacherText} · ${block.weekLabel} · ${block.room}${conflict ? '（与内置课冲突）' : ''}`;

      const nameEl = document.createElement('div');
      nameEl.textContent = block.course.name + (conflict ? ' ⚠' : '');
      nameEl.style.cssText = 'font-weight:600;line-height:1.15;word-break:break-all;';
      el.appendChild(nameEl);

      if (view.showEnrollment === true) {
        const en = document.createElement('div');
        en.textContent = `已选 ${block.option.enrolled}/${block.option.capacity}`;
        en.style.cssText = 'font-size:10px;font-weight:600;color:#475569;text-align:right;';
        el.appendChild(en);
      }

      const meta = (text: string, extra = '') => {
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = 'font-size:10px;opacity:0.85;line-height:1.15;word-break:break-all;' + extra;
        el.appendChild(d);
      };

      // 不同候选信息叠加：每个候选一行「N班徽标 + 教师（空格）+ 地点」
      const coList = block.coOptions ?? [];
      if (coInfo.enabled && coList.length > 0) {
        const line = (option: Option, teachers: string[], room: string) => {
          const d = document.createElement('div');
          d.style.cssText = 'font-size:10px;line-height:1.15;word-break:break-all;';
          const badge = document.createElement('span');
          badge.textContent = classBadge(option.label);
          badge.style.cssText = 'display:inline-block;margin-right:3px;padding:0 3px;border-radius:3px;background:rgba(29,78,216,0.12);color:#1d4ed8;font-weight:700;';
          d.appendChild(badge);
          if (coInfo.showTeacher && teachers.length) {
            const t = document.createElement('span');
            t.textContent = teachers.join(' ');
            d.appendChild(t);
          }
          if (coInfo.showRoom && room) {
            const r = document.createElement('span');
            r.textContent = ' · ' + room;
            r.style.cssText = 'opacity:0.75;';
            d.appendChild(r);
          }
          el.appendChild(d);
        };
        line(block.option, block.teachers, block.room);
        for (const co of coList) line(co.option, co.teachers, co.room);
      } else {
        if (info.teacher && block.teachers.length) meta(block.teachers.join(' '));
        if (info.room && block.room) meta(block.room, 'opacity:0.7;');
      }
      if (info.week && block.weekLabel) meta(block.weekLabel);

      grid.appendChild(el);
    }
  });

  const note = document.createElement('div');
  note.textContent = '橙=当前课程（与内置课重叠标 ⚠），实心=内置课，半透明=其它候选；每格一节。';
  note.style.cssText = 'margin-top:6px;color:#64748b;font-size:11px;';
  wrap.appendChild(note);

  return wrap;
}
