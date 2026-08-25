import { useMemo } from 'react';
import type { Schedule } from '../../shared/types';
import { fixedItems } from '../lib/schedule';
import { effectiveWilling } from '../lib/algo';
import { verifySelection, VERIFY_LABEL, type VerifyStatus } from '../lib/selection';
import { CATEGORY_LABEL } from '../lib/labels';
import Timetable from './Timetable';
import { PanelWindow } from './PanelWindow';

const STATUS_CLASS: Record<VerifyStatus, string> = {
  builtin: 'v-status done',
  verified: 'v-status done',
  missing: 'v-status missing',
  unknown: 'v-status unknown',
};

export default function SelectionStatus({ schedule, onClose }: { schedule: Schedule; onClose: () => void }) {
  const items = useMemo(() => fixedItems(schedule), [schedule]);
  const rows = useMemo(
    () =>
      items.map((it) => ({
        ...it,
        status: verifySelection(schedule, it.course, it.option),
        willing: it.course.category === 'builtin' ? null : effectiveWilling(it.course, it.option),
      })),
    [items, schedule],
  );

  const redIds = useMemo(() => new Set(rows.filter((r) => r.status === 'missing').map((r) => r.course.id)), [rows]);
  const doneCount = rows.filter((r) => r.status === 'builtin' || r.status === 'verified').length;
  const missingCount = rows.filter((r) => r.status === 'missing').length;
  const unknownCount = rows.filter((r) => r.status === 'unknown').length;
  const hasSync = !!schedule.actualSelection;

  return (
    <PanelWindow title="选课情况" onClose={onClose} className="selection-panel">
      <div className="selection-body">
        <div className="selection-left">
          <div className="selection-summary">
            <span className="muted">
              已完成 {doneCount} / 共 {rows.length}
            </span>
            {missingCount > 0 && <span className="selection-warn">未完成 {missingCount} 门（已标红）</span>}
            {unknownCount > 0 && <span className="selection-unknown">未校验 {unknownCount} 门</span>}
          </div>
          {!hasSync && (
            <div className="selection-hint">
              尚未同步教务「已选课程」数据，无法校验。请在教务选课页点击插件按钮「更新已选课程」。
            </div>
          )}
          <Timetable
            schedule={schedule}
            weekFilter="all"
            items={items}
            showEnrollment={true}
            redCourseIds={redIds}
            includeNonParticipating
          />
        </div>
        <div className="selection-right">
          <div className="selection-right-head">课程对照</div>
          <div className="selection-table">
            <div className="selection-th">
              <span>课程</span>
              <span>意愿值</span>
              <span>已选/容量</span>
              <span>状态</span>
            </div>
            {rows.map((r) => (
              <div key={r.course.id} className={`selection-tr ${r.status === 'missing' ? 'row-missing' : ''}`}>
                <span className="selection-course">
                  <span className="badge-inline" title={CATEGORY_LABEL[r.course.category]}>
                    {CATEGORY_LABEL[r.course.category][0]}
                  </span>
                  <span className="selection-name">{r.course.name || '(未命名)'}</span>
                  {r.option.label && <span className="selection-label muted">{r.option.label}</span>}
                </span>
                <span className="selection-willing">{r.willing == null ? '—' : r.willing}</span>
                <span className="selection-enroll">
                  {r.option.enrolled}/{r.option.capacity}
                </span>
                <span className={STATUS_CLASS[r.status]}>{VERIFY_LABEL[r.status]}</span>
              </div>
            ))}
            {rows.length === 0 && <div className="muted empty">暂无内置 / 确认选课程。</div>}
          </div>
        </div>
      </div>
    </PanelWindow>
  );
}
