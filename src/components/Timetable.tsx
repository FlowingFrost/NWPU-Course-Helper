import { Fragment, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Schedule } from '../../shared/types';
import { dayBlocks, layoutBlocks } from '../lib/schedule';
import type { Item, DayBlock } from '../lib/schedule';
import { resolveCourseColors, comboColor, minWeekday, tintColor } from '../lib/colors';

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const ROW_H = 52;
const GAP = 2;
const DIVIDER_H = 2; // 分割线占位高度

export default function Timetable({
  schedule,
  weekFilter,
  items,
  className,
  showInfo = true,
  showEnrollment = false,
  candidate = false,
  style,
  onBlockClick,
  focusCourseId = null,
  colors,
}: {
  schedule: Schedule;
  weekFilter: 'all' | number;
  items?: Item[];
  className?: string;
  showInfo?: boolean;
  showEnrollment?: boolean;
  candidate?: boolean;
  style?: CSSProperties;
  onBlockClick?: (b: DayBlock) => void;
  focusCourseId?: string | null;
  colors?: Map<string, string>;
}) {
  const { nodesPerDay, daysPerWeek } = schedule.meta;
  const rowH = schedule.meta.rowHeight ?? ROW_H;
  const days = Array.from({ length: daysPerWeek }, (_, i) => i + 1);
  const nodes = Array.from({ length: nodesPerDay }, (_, i) => i + 1);
  const dividerNodes = (schedule.meta.dividerNodes ?? []).filter((n) => n >= 1 && n < nodesPerDay).sort((a, b) => a - b);
  const dividerSet = new Set(dividerNodes);
  // 第 n 节顶部的 y 坐标（含其上方分割线占位高度）
  const nodeTop = (n: number) => (n - 1) * rowH + dividerNodes.filter((dn) => dn < n).length * DIVIDER_H;
  const totalHeight = nodesPerDay * rowH + dividerNodes.length * DIVIDER_H;
  const srcItems: Item[] = (items ?? schedule.courses.flatMap((c) => c.options.map((o): Item => ({ course: c, option: o }))))
    .filter((it) => it.course.category === 'builtin' || it.course.participating !== false);
  const [hoverCourseId, setHoverCourseId] = useState<string | null>(null);

  // 均分卡片宽度：对所有课表模式生效（单课表 / 双课表 / 结果叠加层）。
  // 天列宽按「每天最大重叠课程数」比例分配。
  const evenCardWidth = schedule.meta.evenCardWidth === true;
  const dayData = days.map((d) => {
    const blocks = layoutBlocks(dayBlocks(srcItems, d, weekFilter));
    let lanes = 1;
    if (evenCardWidth) {
      for (let n = 1; n <= nodesPerDay; n++) {
        let count = 0;
        for (const b of blocks) if (b.startNode <= n && n < b.endNode) count++;
        if (count > lanes) lanes = count;
      }
    }
    return { day: d, blocks, lanes };
  });

  // 同一课表内课程颜色不重复：灰色/重复颜色自动补齐唯一色。
  // 双课表右侧传入独立配色（colors），其余模式（单课表/双课表左侧/叠加层）按全部课程配色，保持一致。
  const courseColors = useMemo(() => colors ?? resolveCourseColors(schedule.courses.filter((c) => c.participating !== false)), [colors, schedule.courses]);
  // 星期组合区分：仅双课表右侧候选课表启用（开关默认开）
  const comboEnabled = candidate && schedule.meta.weekComboColors !== false;
  // 聚焦淡化（所有课表模式一致）：悬停优先、其次点击聚焦的课程保持全亮，
  // 其余课程块按 focusDimOpacity 降透明度。
  const dimOpacity = schedule.meta.focusDimOpacity ?? 0.5;
  const focusId = hoverCourseId ?? focusCourseId;
  const dimActive = focusId != null && srcItems.some((it) => it.course.id === focusId);

  const borderColor = (b: DayBlock): string | undefined => {
    const base = courseColors.get(b.course.id) ?? b.course.color;
    if (candidate) {
      return comboEnabled ? comboColor(base, minWeekday(b.option)) : base;
    }
    // 其它模式（双课表左侧 / 结果叠加层 / 单课表）：固定课与非内置候选都按课程色着色。
    // 非内置候选仍带 .candidate 的虚线 + 半透明，与固定课（实心）区分视觉层级。
    return base;
  };

  return (
    <div className={`timetable ${className ?? ''}`} style={style}>
      <div className="tt-head">
        <div className="tt-time-head">节次</div>
        {dayData.map(({ day, lanes }) => (
          <div key={day} className="tt-day-head" style={evenCardWidth ? { flexGrow: lanes, minWidth: 0 } : undefined}>
            {DAY_NAMES[day - 1]}
          </div>
        ))}
      </div>
      <div className="tt-body">
        <div className="tt-time">
          {nodes.map((n) => {
            const t = schedule.nodeTimes.find((x) => x.node === n);
            return (
              <Fragment key={n}>
                <div className="tt-time-row" style={{ height: rowH }}>
                  <div className="node">{n}</div>
                  {t && (
                    <div className="clock">
                      {t.start}
                      <br />
                      {t.end}
                    </div>
                  )}
                </div>
                {dividerSet.has(n) && <div className="tt-time-divider" style={{ height: DIVIDER_H }} />}
              </Fragment>
            );
          })}
        </div>
        {dayData.map(({ day, blocks, lanes }) => {
          return (
            <div key={day} className="tt-day" style={{ height: totalHeight, flexGrow: evenCardWidth ? lanes : undefined, minWidth: evenCardWidth ? 0 : undefined }}>
              {dividerNodes.map((n) => (
                <div key={`div-${n}`} className="tt-divider" style={{ top: nodeTop(n) + rowH, height: DIVIDER_H }} />
              ))}
              {blocks.map((b) => {
                const color = borderColor(b);
                const bg = color ? tintColor(color) : undefined;
                const focused = dimActive && b.course.id === focusId;
                const dimmed = dimActive && !focused;
                return (
                <div
                  key={b.key}
                  className={`block ${!candidate && !b.fixed ? 'candidate' : ''}${candidate ? ' cand-table' : ''}${onBlockClick ? ' clickable' : ''}`}
                  style={{
                    top: nodeTop(b.startNode) + GAP / 2,
                    height: nodeTop(b.endNode - 1) + rowH - nodeTop(b.startNode) - GAP,
                    left: `calc(${(b.lane * 100) / b.laneCount}% + 1px)`,
                    width: `calc(${100 / b.laneCount}% - 2px)`,
                    borderLeftColor: color,
                    background: bg,
                    opacity: dimmed ? dimOpacity : focused ? 1 : undefined,
                  }}
                  title={`${b.course.name} · ${b.teachers.join('/')} · ${b.weekLabel} · ${b.room}`}
                  onClick={onBlockClick ? () => onBlockClick(b) : undefined}
                  onMouseEnter={() => setHoverCourseId(b.course.id)}
                  onMouseLeave={() => setHoverCourseId(null)}
                >
                  <div className="block-name">{b.course.name}</div>
                  {showEnrollment && <div className="block-enroll">已选 {b.option.enrolled}/{b.option.capacity}</div>}
                  {showInfo && b.teachers.length > 0 && <div className="block-meta">{b.teachers.join('/')}</div>}
                  {showInfo && weekFilter === 'all' && b.weekLabel && <div className="block-meta">{b.weekLabel}</div>}
                  {showInfo && b.room && <div className="block-meta block-room">{b.room}</div>}
                </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
