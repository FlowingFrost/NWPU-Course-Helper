import { useEffect, useRef, useState } from 'react';
import { useSchedule } from './hooks/useSchedule';
import Timetable from './components/Timetable';
import CoursePanel from './components/CoursePanel';
import SettingsPanel from './components/SettingsPanel';
import SavePicker from './components/SavePicker';
import ResultsSection from './components/Results';
import ParseInput from './components/ParseInput';
import { applyWakeUpImport, parseWakeUp, importBounds } from './lib/wakeup';
import { enumerateSchedules, optionsConflict } from './lib/algo';
import { resolveCourseColors } from './lib/colors';
import { fixedItems, candidateItems } from './lib/schedule';
import type { DayBlock } from './lib/schedule';
import type { ScheduleResult } from './lib/algo';
import './App.css';

export default function App() {
  const { schedule, error, saving, update, setAndSave, replace } = useSchedule();
  const [weekFilter, setWeekFilter] = useState<'all' | number>('all');
  const [electiveTarget, setElectiveTarget] = useState<number | 'max'>('max');
  const [results, setResults] = useState<ScheduleResult[] | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'double'>(() => {
    try {
      return localStorage.getItem('course-helper:viewMode') === 'double' ? 'double' : 'single';
    } catch {
      return 'single';
    }
  });
  const [dualRatio, setDualRatio] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('course-helper:dualRatio'));
      return Number.isFinite(v) && v >= 0.1 && v <= 0.9 ? v : 0.5;
    } catch {
      return 0.5;
    }
  });
  const [dragging, setDragging] = useState(false);
  const [overlayOn, setOverlayOn] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showElectives, setShowElectives] = useState(true);
  const [filterConflicts, setFilterConflicts] = useState(false);
  const [importPrompt, setImportPrompt] = useState<{
    text: string;
    bounds: { maxNode: number; maxWeek: number };
    nodesPerDay: number;
    totalWeeks: number;
  } | null>(null);
  const [activeResult, setActiveResult] = useState<ScheduleResult | null>(null);
  const [selection, setSelection] = useState<{ courseId: string; optionId: string | null } | null>(null);
  const dualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOverlayOn((o) => !o);
      if (e.key === 'd' || e.key === 'D') setViewMode((m) => (m === 'single' ? 'double' : 'single'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('course-helper:viewMode', viewMode);
    } catch {
      /* 忽略 */
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('course-helper:dualRatio', String(dualRatio));
    } catch {
      /* 忽略 */
    }
  }, [dualRatio]);

  useEffect(() => {
    if (!dragging) return;
    const apply = (clientX: number) => {
      const el = dualRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      setDualRatio(Math.min(0.9, Math.max(0.1, ratio)));
    };
    const onMove = (e: PointerEvent) => apply(e.clientX);
    const onUp = () => setDragging(false);
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (!importPrompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImportPrompt(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importPrompt]);

  if (error) return <div className="app-error">加载失败：{error}</div>;
  if (!schedule) return <div className="app-loading">加载中…</div>;

  // 点击课表块 → 双课表右侧淡化其它课程，并在「课程与候选」面板中打开对应课程弹窗、高亮所点候选
  const focusCourseId = selection && selection.optionId ? selection.courseId : null;

  const handleBlockClick = (b: DayBlock) => {
    setSelection({ courseId: b.course.id, optionId: b.option.id });
  };

  const onImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      try {
        const parsed = parseWakeUp(text);
        const bounds = importBounds(parsed.courses);
        if (bounds.maxNode > schedule.meta.nodesPerDay || bounds.maxWeek > schedule.meta.totalWeeks) {
          setImportPrompt({
            text,
            bounds,
            nodesPerDay: schedule.meta.nodesPerDay,
            totalWeeks: schedule.meta.totalWeeks,
          });
        } else {
          setAndSave(applyWakeUpImport(schedule, text, 'truncate'));
        }
      } catch (e) {
        alert('导入失败：' + String(e));
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const selectResult = (r: ScheduleResult) => {
    setActiveResult(r);
    setOverlayOn(true);
  };

  // 单课表条目：按「显示非必修」过滤
  const singleItems = schedule.courses
    .flatMap((c) => c.options.map((o) => ({ course: c, option: o })))
    .filter((it) => showElectives || it.course.category !== 'elective');

  // 双课表右侧条目：按「显示非必修」+「过滤冲突课程」过滤
  const fixedOpts = fixedItems(schedule).map((it) => it.option);
  const rightItems = candidateItems(schedule)
    .filter((it) => showElectives || it.course.category !== 'elective')
    .filter((it) => !filterConflicts || !fixedOpts.some((fo) => optionsConflict(it.option, fo)));

  // 双课表右侧独立着色：只对右侧候选课程重新做黄金角分配，充分利用整个色相环，
  // 避免右侧与左侧共用整套配色而被挤到同一小段色相（蓝紫扎堆）。
  // 左侧/单课表仍用 resolveCourseColors(全部课程)，保持与之前完全一致。
  const rightCourses = Array.from(new Map(rightItems.map((it) => [it.course.id, it.course])).values()).filter(
    (c) => c.participating !== false
  );
  const rightColors = resolveCourseColors(rightCourses);

  return (
    <div className="app">
      <header className="topbar">
        <h1>{schedule.meta.school}选课助手</h1>
        <SavePicker currentTerm={schedule.meta.term} onSchedule={replace} />
        <span className="topbar-sep" />
        <select
          value={weekFilter === 'all' ? 'all' : String(weekFilter)}
          onChange={(e) => setWeekFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">全部周次</option>
          {Array.from({ length: schedule.meta.totalWeeks }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              第 {w} 周
            </option>
          ))}
        </select>
        <button onClick={() => setViewMode((m) => (m === 'single' ? 'double' : 'single'))}>
          {viewMode === 'single' ? '双课表' : '单课表'} (D)
        </button>
        <label className="overlay-toggle">
          <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} />
          显示课程信息
        </label>
        <label className="overlay-toggle">
          <input type="checkbox" checked={showEnrollment} onChange={(e) => setShowEnrollment(e.target.checked)} />
          显示已选人数/容量
        </label>
        <label className="overlay-toggle">
          <input type="checkbox" checked={showElectives} onChange={(e) => setShowElectives(e.target.checked)} />
          显示非必修
        </label>
        {viewMode === 'double' && (
          <label className="overlay-toggle">
            <input type="checkbox" checked={filterConflicts} onChange={(e) => setFilterConflicts(e.target.checked)} />
            过滤冲突课程
          </label>
        )}
        <label className="overlay-toggle" title={activeResult ? undefined : '先在结果区点选一个可行课表'}>
          <input
            type="checkbox"
            checked={overlayOn}
            disabled={!activeResult}
            onChange={(e) => setOverlayOn(e.target.checked)}
          />
          结果叠加层 (R)
        </label>
        <SettingsPanel schedule={schedule} update={update} onResetDualRatio={() => setDualRatio(0.5)} onImportWakeUp={onImport} />
        <span className={`save ${saving ? '' : 'ok'}`}>{saving ? '保存中…' : '已保存'}</span>
        <ParseInput onSchedule={replace} />
      </header>

      <div className="main">
        {viewMode === 'single' ? (
          <div className="timetable-zone">
            <Timetable schedule={schedule} weekFilter={weekFilter} items={singleItems} showInfo={showInfo} showEnrollment={showEnrollment} onBlockClick={handleBlockClick} />
            {overlayOn && activeResult && (
              <div className="overlay">
                <div className="overlay-backdrop" onClick={() => setOverlayOn(false)} />
                <div className="overlay-grid">
                  <div className="overlay-label">
                    结果预览 #{' '}
                    {results ? results.indexOf(activeResult) + 1 : '?'}
                  </div>
                  <Timetable schedule={schedule} weekFilter={weekFilter} items={activeResult.items} className="overlay-table" showInfo={showInfo} showEnrollment={showEnrollment} onBlockClick={handleBlockClick} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="dual" ref={dualRef}>
            <Timetable schedule={schedule} weekFilter={weekFilter} items={fixedItems(schedule)} showInfo={showInfo} showEnrollment={showEnrollment} style={{ flex: `${dualRatio} 1 0%` }} onBlockClick={handleBlockClick} />
            <div
              className={`dual-divider${dragging ? ' dragging' : ''}`}
              title={`左表 ${Math.round(dualRatio * 100)}% · 拖动调整`}
              onPointerDown={(e) => {
                e.preventDefault();
                setDragging(true);
                const el = dualRef.current;
                if (el) {
                  const rect = el.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / rect.width;
                  setDualRatio(Math.min(0.9, Math.max(0.1, ratio)));
                }
              }}
            />
            <Timetable schedule={schedule} weekFilter={weekFilter} items={rightItems} colors={rightColors} showInfo={showInfo} showEnrollment={showEnrollment} candidate style={{ flex: `${1 - dualRatio} 1 0%` }} onBlockClick={handleBlockClick} focusCourseId={focusCourseId} />
          </div>
        )}
      </div>

      <div className="below">
        <div className="course-panel-wrap">
          <CoursePanel
            schedule={schedule}
            update={update}
            focusCourseId={selection?.courseId ?? null}
            focusOptionId={selection?.optionId ?? null}
            onFocusCourse={(courseId) => setSelection({ courseId, optionId: null })}
            onCloseCourse={() => setSelection(null)}
          />
        </div>
      </div>

      <ResultsSection
        schedule={schedule}
        results={results}
        target={electiveTarget}
        onTarget={setElectiveTarget}
        onGenerate={() => setResults(enumerateSchedules(schedule, electiveTarget))}
        onSelect={selectResult}
      />

      {importPrompt && (
        <div className="modal-backdrop" onClick={() => setImportPrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>导入内容超出当前设置</h3>
            <p>
              导入的课程包含最多 <b>第 {importPrompt.bounds.maxNode} 节</b>、<b>第 {importPrompt.bounds.maxWeek} 周</b>。
              <br />
              当前存档设置为：每天 {importPrompt.nodesPerDay} 节、共 {importPrompt.totalWeeks} 周。
            </p>
            <div className="modal-actions">
              <button
                onClick={() => {
                  setAndSave(applyWakeUpImport(schedule, importPrompt.text, 'truncate'));
                  setImportPrompt(null);
                }}
              >
                截断超出部分
              </button>
              <button
                className="primary"
                onClick={() => {
                  setAndSave(applyWakeUpImport(schedule, importPrompt.text, 'widen'));
                  setImportPrompt(null);
                }}
              >
                拓宽到 {importPrompt.bounds.maxNode} 节 / {importPrompt.bounds.maxWeek} 周
              </button>
              <button onClick={() => setImportPrompt(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
