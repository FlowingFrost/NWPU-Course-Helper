import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import type { Schedule, Option, InfoBits } from '../../shared/types';
import { dayBlocks, layoutBlocks } from '../lib/schedule';
import type { Item, DayBlock } from '../lib/schedule';
import { resolveCourseColors, comboColor, minWeekday, tintColor } from '../lib/colors';
import { DAY_FULL } from '../lib/labels';
import { DEFAULT_INFO, classBadge, optionSummaryLines } from '../lib/display';

const ROW_H = 52;
const GAP = 2;
const DIVIDER_H = 2; // 分割线占位高度

export default function Timetable({
  schedule,
  weekFilter,
  items,
  className,
  info = DEFAULT_INFO,
  showEnrollment = false,
  candidate = false,
  style,
  onBlockClick,
  selectedCourseId = null,
  colors,
  redCourseIds,
  includeNonParticipating = false,
  coInfo = { enabled: true, showTeacher: true, showRoom: true },
  rowHeight,
  courseBadges,
  blockBadges,
}: {
  schedule: Schedule;
  weekFilter: 'all' | number;
  items?: Item[];
  className?: string;
  info?: InfoBits;
  showEnrollment?: boolean;
  candidate?: boolean;
  style?: CSSProperties;
  onBlockClick?: (b: DayBlock) => void;
  selectedCourseId?: string | null;
  colors?: Map<string, string>;
  redCourseIds?: ReadonlySet<string>; // 标红：这些课程「未完成选课操作」
  includeNonParticipating?: boolean; // 选课情况弹窗需要展示所有「确认选」课程（含不参与排课的）
  coInfo?: { enabled: boolean; showTeacher: boolean; showRoom: boolean }; // 不同候选信息叠加
  rowHeight?: number; // 覆盖每节行高（紧凑展示用）
  courseBadges?: ReadonlyMap<string, string>; // 课程 → 角标文字（如「单周/双周」）
  blockBadges?: ReadonlyMap<string, string>; // key=`courseId:day:startNode:endNode` → 窄时段角标（如「第15周」）
}) {
  const { nodesPerDay, daysPerWeek } = schedule.meta;
  const rowH = rowHeight ?? schedule.meta.rowHeight ?? ROW_H;
  const days = Array.from({ length: daysPerWeek }, (_, i) => i + 1);
  const nodes = Array.from({ length: nodesPerDay }, (_, i) => i + 1);
  const dividerNodes = (schedule.meta.dividerNodes ?? []).filter((n) => n >= 1 && n < nodesPerDay).sort((a, b) => a - b);
  const dividerSet = new Set(dividerNodes);
  const nodeTop = (n: number) => (n - 1) * rowH + dividerNodes.filter((dn) => dn < n).length * DIVIDER_H;
  const totalHeight = nodesPerDay * rowH + dividerNodes.length * DIVIDER_H;
  const srcItems: Item[] = (items ?? schedule.courses.flatMap((c) => c.options.map((o): Item => ({ course: c, option: o }))))
    .filter((it) => includeNonParticipating || it.course.category === 'builtin' || it.course.participating !== false);

  const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);
  const [hoveredOptionId, setHoveredOptionId] = useState<string | null>(null);
  const [hoverBlock, setHoverBlock] = useState<DayBlock | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const [coPopupStyle, setCoPopupStyle] = useState<{ left: number; top: number } | null>(null);

  // 注释卡片定位：在「当前块右侧 / 左侧 / 下方 / 上方」四向里，用 Layout 阶段量块尺寸，
  // 选「遮挡最少的天列块」方向。优先完全不遮挡「被悬停候选其它时间块 + 同时间其它候选块」。
  const tableRef = useRef<HTMLDivElement>(null);
  const coPopupRef = useRef<HTMLDivElement>(null);

  const hitsBlocks = (l: number, t: number, w: number, h: number): { coversSelf: boolean; coversOther: number; coversSelfCo: boolean } => {
    let coversSelf = false;
    let coversSelfCo = false;
    let coversOther = 0;
    if (tableRef.current) {
      for (const el of Array.from(tableRef.current.querySelectorAll<HTMLElement>('.tt-day .block'))) {
        const r = el.getBoundingClientRect();
        const overlap = l < r.right && l + w > r.left && t < r.bottom && t + h > r.top;
        if (!overlap) continue;
        const isHovered = el.dataset.opt === hoveredOptionId;
        const isCo = hoverBlock?.coOptions?.some((co) => el.dataset.opt === co.option.id) ?? false;
        if (isHovered) coversSelf = true;
        if (isCo) coversSelfCo = true;
        if (!isHovered && !isCo) coversOther++;
      }
    }
    return { coversSelf, coversSelfCo, coversOther };
  };

  useEffect(() => {
    if (!hoverAnchor || !coPopupRef.current) {
      setCoPopupStyle(null);
      return;
    }
    const pop = coPopupRef.current;
    const rect = hoverAnchor;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const gap = 8;
    const cands: Array<{ left: number; top: number; coversSelf: boolean; coversSelfCo: boolean; coversOther: number }> = [];
    const cand = (left: number, top: number) => {
      const meta = hitsBlocks(left, top, pw, ph);
      cands.push({ left, top, ...meta });
    };
    cand(rect.right + gap, rect.top); // 右
    cand(rect.left - pw - gap, rect.top); // 左
    cand(rect.left, rect.bottom + gap); // 下
    cand(rect.left, rect.top - ph - gap); // 上
    // 过滤出界
    const inView = cands.filter((c) => c.left >= 8 && c.top >= 8 && c.left + pw <= vw - 8 && c.top + ph <= vh - 8);
    const pool = inView.length ? inView : cands.map((c) => ({
      ...c,
      left: Math.max(8, Math.min(c.left, vw - pw - 8)),
      top: Math.max(8, Math.min(c.top, vh - ph - 8)),
    }));
    // 排序：先完全不遮自己/同时间，再少遮其它
    const pick = [...pool].sort((a, b) => {
      const scoreA = (a.coversSelf || a.coversSelfCo ? 1 : 0) + (a.coversOther > 0 ? 1 : 0);
      const scoreB = (b.coversSelf || b.coversSelfCo ? 1 : 0) + (b.coversOther > 0 ? 1 : 0);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.coversOther - b.coversOther;
    })[0];
    setCoPopupStyle(pick ? { left: Math.round(pick.left), top: Math.round(pick.top) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverAnchor]);

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

  const courseColors = useMemo(() => colors ?? resolveCourseColors(schedule.courses.filter((c) => c.participating !== false)), [colors, schedule.courses]);
  const comboEnabled = candidate && schedule.meta.weekComboColors !== false;
  const dimOpacity = schedule.meta.focusDimOpacity ?? 0.5;
  const focusedCourseId = hoveredCourseId ?? selectedCourseId;
  const dimActive = focusedCourseId != null && srcItems.some((it) => it.course.id === focusedCourseId);

  const borderColor = (b: DayBlock): string | undefined => {
    const base = courseColors.get(b.course.id) ?? b.course.color;
    if (candidate) {
      return comboEnabled ? comboColor(base, minWeekday(b.option)) : base;
    }
    return base;
  };

  return (
    <div ref={tableRef} className={`timetable ${className ?? ''}`} style={style}>
      <div className="tt-head">
        <div className="tt-time-head">节次</div>
        {dayData.map(({ day, lanes }) => (
          <div key={day} className="tt-day-head" style={evenCardWidth ? { flexGrow: lanes, minWidth: 0 } : undefined}>
            {DAY_FULL[day - 1]}
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
                const red = redCourseIds?.has(b.course.id) ?? false;
                const border = red ? '#dc2626' : color;
                const bg = red ? '#fee2e2' : color ? tintColor(color) : undefined;
                const focused = dimActive && b.course.id === focusedCourseId;
                const dimmed = dimActive && !focused;

                const coList = b.coOptions ?? [];
                const showCo = coInfo.enabled && coList.length > 0;
                const optionHovered =
                  hoveredOptionId != null &&
                  (b.option.id === hoveredOptionId || coList.some((co) => co.option.id === hoveredOptionId));

                const candRow = (option: Option, teachers: string[], room: string) => (
                  <div key={option.id} className="block-cand-row">
                    <span className="block-badge">{classBadge(option.label)}</span>
                    {coInfo.showTeacher && teachers.length > 0 && <span className="block-cand-teacher">{teachers.join(' ')}</span>}
                    {coInfo.showRoom && room && <span className="block-cand-room">{room}</span>}
                  </div>
                );

                return (
                  <div
                    key={b.key}
                    className={`block ${!candidate && !b.fixed ? 'candidate' : ''}${candidate ? ' cand-table' : ''}${onBlockClick ? ' clickable' : ''}${red ? ' red' : ''}${optionHovered ? ' option-hover' : ''}`}
                    style={{
                      top: nodeTop(b.startNode) + GAP / 2,
                      height: nodeTop(b.endNode - 1) + rowH - nodeTop(b.startNode) - GAP,
                      left: `calc(${(b.lane * 100) / b.laneCount}% + 1px)`,
                      width: `calc(${100 / b.laneCount}% - 2px)`,
                      borderLeftColor: border,
                      background: bg,
                      opacity: dimmed ? dimOpacity : focused ? 1 : undefined,
                    }}
                    title={`${b.course.name} · ${[b.teachers, ...coList.map((co) => co.teachers)].map((ts) => ts.join(' ')).filter(Boolean).join(' / ')} · ${b.weekLabel} · ${b.room}${red ? ' · 未完成选课' : ''}`}
                    onClick={onBlockClick ? () => onBlockClick(b) : undefined}
                    data-opt={b.option.id}
                    onMouseEnter={(e) => {
                      setHoveredCourseId(b.course.id);
                      setHoveredOptionId(b.option.id);
                      setHoverBlock(b);
                      setHoverAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
                    }}
                    onMouseLeave={() => {
                      setHoveredCourseId(null);
                      setHoveredOptionId(null);
                      setHoverBlock(null);
                      setHoverAnchor(null);
                    }}
                  >
                    <div className="block-name">
                      {b.course.name}
                      {courseBadges?.get(b.course.id) && <span className="block-parity">{courseBadges.get(b.course.id)}</span>}
                      {blockBadges?.get(`${b.course.id}:${day}:${b.startNode}:${b.endNode}`) && (
                        <span className="block-parity">{blockBadges.get(`${b.course.id}:${day}:${b.startNode}:${b.endNode}`)}</span>
                      )}
                    </div>
                    {red && <div className="block-red-tag">未完成</div>}
                    {showEnrollment && <div className="block-enroll">已选 {b.option.enrolled}/{b.option.capacity}</div>}
                    {info.week && weekFilter === 'all' && b.weekLabel && <div className="block-meta">{b.weekLabel}</div>}
                    {showCo ? (
                      <>
                        {candRow(b.option, b.teachers, b.room)}
                        {coList.map((co) => candRow(co.option, co.teachers, co.room))}
                      </>
                    ) : (
                      <>
                        {info.teacher && b.teachers.length > 0 && <div className="block-meta">{b.teachers.join(' ')}</div>}
                        {info.room && b.room && <div className="block-meta block-room">{b.room}</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {hoverBlock && hoverBlock.coOptions && hoverBlock.coOptions.length > 0 &&
        createPortal(
          <div
            ref={coPopupRef}
            className={`hover-annotation${coPopupStyle ? '' : ' measuring'}`}
            style={coPopupStyle ? { left: coPopupStyle.left, top: coPopupStyle.top } : { left: -10000, top: -10000 }}
          >
            {hoverBlock.coOptions.map((co) => (
              <div key={co.option.id} className="hover-annotation-group">
                <div className="hover-annotation-head">
                  <span className="hover-annotation-badge">{classBadge(co.option.label)}</span>
                  {co.option.label && <span className="hover-annotation-label">{co.option.label}</span>}
                </div>
                <div className="hover-annotation-lines">
                  {optionSummaryLines(co.option).map((line, i) => (
                    <div key={i} className="hover-annotation-line">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
