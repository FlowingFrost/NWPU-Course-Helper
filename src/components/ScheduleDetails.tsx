import { Fragment, useMemo, useState } from 'react';
import type { Schedule } from '../../shared/types';
import { weekPartitions, occupancyHeatmap, ganttBars, weeksLabel, weekBadge, scatteredCourseIds, singleWeekCourseIds, reducedSlotBadges, type GanttBar, type WeekPartition } from '../lib/weeks';
import { resolveCourseColors, tintColor } from '../lib/colors';
import { DAY_FULL, DAY_SHORT } from '../lib/labels';
import { DEFAULT_INFO } from '../lib/display';
import Timetable from './Timetable';

function partitionLabel(p: WeekPartition): string {
  const label = weeksLabel(p.weeks);
  return label ? `第 ${label} 周` : '无课程';
}

// 详情课表：表头已有周次，块内不再显示周次；仅散课显示「单/双周」角标
const DETAIL_INFO = { ...DEFAULT_INFO, week: false };

// 学期占用热力图：颜色 = 该格有课的周数 / 总周数
function Heatmap({ schedule, grid }: { schedule: Schedule; grid: number[][] }) {
  const { daysPerWeek, nodesPerDay, totalWeeks } = schedule.meta;
  const days = Array.from({ length: daysPerWeek }, (_, i) => i + 1);
  const nodes = Array.from({ length: nodesPerDay }, (_, i) => i + 1);

  const bg = (weeks: number): string => {
    if (weeks <= 0) return '#f8fafc';
    const ratio = Math.min(1, weeks / totalWeeks);
    const r = Math.round(219 + (29 - 219) * ratio);
    const g = Math.round(234 + (78 - 234) * ratio);
    const b = Math.round(254 + (216 - 254) * ratio);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div className="heatmap" style={{ gridTemplateColumns: `34px repeat(${daysPerWeek}, minmax(40px, 1fr))` }}>
      <div className="heat-cell heat-head" />
      {days.map((d) => (
        <div key={d} className="heat-cell heat-head">
          {DAY_SHORT[d - 1]}
        </div>
      ))}
      {nodes.map((n) => (
        <Fragment key={n}>
          <div className="heat-cell heat-time">{n}</div>
          {days.map((d) => {
            const weeks = grid[d - 1][n - 1] ?? 0;
            const ratio = totalWeeks ? weeks / totalWeeks : 0;
            return (
              <div
                key={`${d}-${n}`}
                className="heat-cell"
                style={{ background: bg(weeks), color: ratio > 0.5 ? '#fff' : '#334155' }}
                title={`周${DAY_SHORT[d - 1]} 第${n}节：${weeks}/${totalWeeks} 周有课`}
              >
                {weeks > 0 && <span className="heat-val">{weeks}</span>}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

// 课程甘特图：X=周，Y=星期泳道；条=课程在该星期的周区间
function Gantt({ schedule, bars }: { schedule: Schedule; bars: GanttBar[] }) {
  const { daysPerWeek, totalWeeks } = schedule.meta;
  const days = Array.from({ length: daysPerWeek }, (_, i) => i + 1);
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const colors = useMemo(() => resolveCourseColors(schedule.courses.filter((c) => c.participating !== false)), [schedule.courses]);

  const LANE_H = 20;
  const LABEL_W = 56;

  const dayLanes = days.map((day) => {
    const dayBars = bars.filter((b) => b.day === day).sort((a, b) => a.start - b.start || a.end - b.end);
    const lanes: GanttBar[][] = [];
    for (const bar of dayBars) {
      let placed = false;
      for (const lane of lanes) {
        if (lane.every((b) => b.end < bar.start || b.start > bar.end)) {
          lane.push(bar);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([bar]);
    }
    return { day, lanes };
  });

  // 按百分比定位，让甘特图横轴铺满容器宽度
  const pct = (v: number) => `${(v / totalWeeks) * 100}%`;

  return (
    <div className="gantt">
      <div className="gantt-header">
        <div className="gantt-corner" style={{ width: LABEL_W }} />
        <div className="gantt-weeks">
          {weeks.map((w) => (
            <div key={w} className="gantt-week">
              {w}
            </div>
          ))}
        </div>
      </div>
      {dayLanes.map(({ day, lanes }) => (
        <div key={day} className="gantt-row">
          <div className="gantt-day" style={{ width: LABEL_W }}>
            {DAY_FULL[day - 1]}
          </div>
          <div className="gantt-track" style={{ height: Math.max(1, lanes.length) * LANE_H }}>
            {lanes.flatMap((lane, li) =>
              lane.map((bar) => {
                const color = colors.get(bar.courseId) ?? bar.color;
                return (
                  <div
                    key={`${bar.courseId}-${bar.day}-${bar.start}-${bar.end}-${li}`}
                    className="gantt-bar"
                    style={{
                      left: pct(bar.start - 1),
                      width: pct(bar.end - bar.start + 1),
                      top: li * LANE_H + 1,
                      height: LANE_H - 2,
                      background: tintColor(color),
                      borderLeftColor: color,
                    }}
                    title={`${bar.name} · 第${bar.start}-${bar.end}周`}
                  >
                    {bar.name}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ScheduleDetails({ schedule, onClose }: { schedule: Schedule; onClose: () => void }) {
  const optimizeWeeks = schedule.meta.optimizeWeeks !== false;
  const scatteredIds = useMemo(() => scatteredCourseIds(schedule), [schedule]);
  const singleWeekIds = useMemo(() => singleWeekCourseIds(schedule), [schedule]);
  const blockBadges = useMemo(() => reducedSlotBadges(schedule), [schedule]);
  const partitions = useMemo(() => weekPartitions(schedule, optimizeWeeks), [schedule, optimizeWeeks]);
  const heatmap = useMemo(() => occupancyHeatmap(schedule), [schedule]);
  const bars = useMemo(() => ganttBars(schedule), [schedule]);
  const [partitionMode, setPartitionMode] = useState<'grid' | 'horizontal'>('grid');

  // 详情课表的尺寸：行高可设置；最小宽度按「时间列 52px + 每天 60px + 卡片内边距/边框 18px」计算，
  // 保证课表不会被压到出现横向滚动条（宁可少放一列，也不坍缩）。
  const { daysPerWeek } = schedule.meta;
  const rowH = schedule.meta.detailRowHeight ?? 41;
  const naturalMinWidth = 52 + daysPerWeek * 60 + 18;
  const minW = schedule.meta.detailMinWidth ?? naturalMinWidth;

  return (
    <div className="details-overlay">
      <div className="details-page">
        <div className="details-head">
          <h2>课表详情</h2>
          <button className="panel-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="details-body">
          <div className="options-head partition-head-row">
            <span>周段课表（按周次变化切分）</span>
            <button className="partition-mode-btn" onClick={() => setPartitionMode((m) => (m === 'grid' ? 'horizontal' : 'grid'))}>
              {partitionMode === 'grid' ? '切换为水平' : '切换为平铺'}
            </button>
          </div>
          <div
            className={`partition-grid ${partitionMode === 'horizontal' ? 'horizontal' : ''}`}
            style={partitionMode === 'grid' ? { gridTemplateColumns: `repeat(auto-fill, minmax(${minW}px, 1fr))` } : undefined}
          >
            {partitions.map((p, i) => {
              const badges = new Map<string, string>();
              for (const it of p.items) {
                const special = scatteredIds.has(it.course.id) || singleWeekIds.has(it.course.id);
                if (!special) continue;
                const label = weekBadge(it);
                if (label) badges.set(it.course.id, label);
              }
              return (
                <div key={i} className="partition-card">
                  <div className="partition-head">{partitionLabel(p)}</div>
                  {p.items.length ? (
                    <Timetable schedule={schedule} weekFilter="all" items={p.items} info={DETAIL_INFO} rowHeight={rowH} courseBadges={badges} blockBadges={blockBadges} />
                  ) : (
                    <div className="muted empty">本周段无课程</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="options-head">学期占用热力图（有课周数）</div>
          <Heatmap schedule={schedule} grid={heatmap} />

          <div className="options-head">课程甘特图</div>
          <Gantt schedule={schedule} bars={bars} />
        </div>
      </div>
    </div>
  );
}
