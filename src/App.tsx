import { useCallback, useEffect, useRef, useState } from 'react';
import { useSchedule } from './hooks/useSchedule';
import { useViewState } from './hooks/useViewState';
import { useDualSplit } from './hooks/useDualSplit';
import { useCourseSelection } from './hooks/useCourseSelection';
import { useWakeUpImport } from './hooks/useWakeUpImport';
import Timetable from './components/Timetable';
import CoursePanel from './components/CoursePanel';
import SettingsPanel from './components/SettingsPanel';
import SavePicker from './components/SavePicker';
import ResultsSection from './components/Results';
import ParseInput from './components/ParseInput';
import GoalList from './components/GoalList';
import SelectionStatus from './components/SelectionStatus';
import ScheduleDetails from './components/ScheduleDetails';
import Sidebar from './components/Sidebar';
import { Modal } from './components/Modal';
import { enumerateSchedules, optionsConflict } from './lib/algo';
import { resolveCourseColors } from './lib/colors';
import { fixedItems, candidateItems } from './lib/schedule';
import { infoOf, coInfoOf } from './lib/display';
import { TOP_TABS, SIDEBAR_TAB_H, type PanelId, type TopTabId } from './lib/nav';
import type { ScheduleResult } from './lib/algo';
import type { Meta } from '../shared/types';
import './App.css';

export default function App() {
  const { schedule, error, saving, update, setAndSave, replace } = useSchedule();
  const patchMeta = useCallback(
    (patch: Partial<Meta>) => {
      update((s) => ({ ...s, meta: { ...s.meta, ...patch } }));
    },
    [update],
  );
  const {
    viewMode,
    setViewMode,
    overlayOn,
    setOverlayOn,
    showEnrollment,
    setShowEnrollment,
    showElectives,
    setShowElectives,
    filterConflicts,
    setFilterConflicts,
    hideSelectedCandidates,
    setHideSelectedCandidates,
  } = useViewState(schedule?.meta, patchMeta);
  const { dualRatio, dragging, dualRef, startDrag, resetDualRatio } = useDualSplit();
  const { selection, selectedCourseId, handleBlockClick, openCourse, closeCourse } = useCourseSelection();
  const { importPrompt, onImport, confirmImport, closeImport } = useWakeUpImport(schedule, setAndSave);

  const [weekFilter, setWeekFilter] = useState<'all' | number>('all');
  const [electiveTarget, setElectiveTarget] = useState<number | 'max'>('max');
  const [results, setResults] = useState<ScheduleResult[] | null>(null);
  const [activeResult, setActiveResult] = useState<ScheduleResult | null>(null);

  // 侧边栏面板（互斥单选）：home 无弹窗，其余各一个窗口
  const [activePanel, setActivePanel] = useState<PanelId>('home');
  // Alt 预览：按住 Alt + 上下移动鼠标临时切换顶部 tab，仅预览、不可交互，松 Alt 回到 activePanel
  const [previewTab, setPreviewTab] = useState<TopTabId | null>(null);

  const activePanelRef = useRef(activePanel);
  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);
  const mouseYRef = useRef(0);
  const altStateRef = useRef<{ startY: number; baseIndex: number } | null>(null);

  // Alt 手势：按住 Alt 后，鼠标上下位移 1:1 映射到顶部 tab（起终点不同，位移量相同）
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mouseYRef.current = e.clientY;
      const st = altStateRef.current;
      if (!st) return;
      const dy = e.clientY - st.startY;
      const idx = Math.max(0, Math.min(TOP_TABS.length - 1, st.baseIndex + Math.round(dy / SIDEBAR_TAB_H)));
      setPreviewTab(TOP_TABS[idx]);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      if (altStateRef.current) return;
      e.preventDefault(); // 尽量阻止浏览器菜单栏焦点
      const cur = activePanelRef.current;
      const baseIdx = TOP_TABS.indexOf(cur as TopTabId);
      altStateRef.current = { startY: mouseYRef.current, baseIndex: baseIdx >= 0 ? baseIdx : 0 };
      setPreviewTab(TOP_TABS[altStateRef.current.baseIndex]);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      if (!altStateRef.current) return;
      altStateRef.current = null;
      setPreviewTab(null);
    };
    // 焦点丢失（如 Alt 按住时切到别处）时兜底退出预览，避免卡在「仅预览」状态
    const onBlur = () => {
      altStateRef.current = null;
      setPreviewTab(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  if (error) return <div className="app-error">加载失败：{error}</div>;
  if (!schedule) return <div className="app-loading">加载中…</div>;

  const selectResult = (r: ScheduleResult) => {
    setActiveResult(r);
    setOverlayOn(true);
  };

  // 单课表条目：按开关隐藏已选课程的其它候选；再按「显示非必修」过滤
  const singleItems = schedule.courses
    .flatMap((c) => c.options.map((o) => ({ course: c, option: o })))
    .filter((it) => it.option.selected || !hideSelectedCandidates || !it.course.options.some((o) => o.selected))
    .filter((it) => showElectives || it.course.category !== 'elective');

  // 双课表右侧条目：按开关隐藏已选课程的其它候选；再按「显示非必修」+「过滤冲突课程」过滤
  const fixedOpts = fixedItems(schedule).map((it) => it.option);
  const rightItems = candidateItems(schedule, hideSelectedCandidates)
    .filter((it) => showElectives || it.course.category !== 'elective')
    .filter((it) => !filterConflicts || !fixedOpts.some((fo) => optionsConflict(it.option, fo)));

  const rightCourses = Array.from(new Map(rightItems.map((it) => [it.course.id, it.course])).values()).filter(
    (c) => c.participating !== false,
  );
  const rightColors = resolveCourseColors(rightCourses);

  // 显示课程信息按视图独立配置；不同候选信息叠加全局配置
  const infoSingle = infoOf(schedule.meta, 'single');
  const infoDualLeft = infoOf(schedule.meta, 'dualLeft');
  const infoDualRight = infoOf(schedule.meta, 'dualRight');
  const coInfo = coInfoOf(schedule.meta);

  // 有效面板：Alt 预览时显示预览 tab（不可交互），否则显示 activePanel
  const previewing = previewTab !== null;
  const effectivePanel: PanelId = previewing ? (previewTab as PanelId) : activePanel;
  const closePanel = () => setActivePanel('home');

  return (
    <div className="app">
      <Sidebar activePanel={activePanel} previewTab={previewTab} onSelect={setActivePanel} />

      <header className="topbar">
        <h1>{schedule.meta.school}选课助手</h1>
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
          <input type="checkbox" checked={showEnrollment} onChange={(e) => setShowEnrollment(e.target.checked)} />
          显示已选人数/容量
        </label>
        <label className="overlay-toggle">
          <input type="checkbox" checked={showElectives} onChange={(e) => setShowElectives(e.target.checked)} />
          显示非必修
        </label>
        <label className="overlay-toggle">
          <input type="checkbox" checked={hideSelectedCandidates} onChange={(e) => setHideSelectedCandidates(e.target.checked)} />
          隐藏已选课其它候选
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
        <span className={`save ${saving ? '' : 'ok'}`}>{saving ? '保存中…' : '已保存'}</span>
        <ParseInput onSchedule={replace} />
      </header>

      <div className="main">
        {viewMode === 'single' ? (
          <div className="timetable-zone">
            <Timetable schedule={schedule} weekFilter={weekFilter} items={singleItems} info={infoSingle} coInfo={coInfo} showEnrollment={showEnrollment} onBlockClick={handleBlockClick} />
            {overlayOn && activeResult && (
              <div className="overlay">
                <div className="overlay-backdrop" onClick={() => setOverlayOn(false)} />
                <div className="overlay-grid">
                  <div className="overlay-label">
                    结果预览 #{' '}
                    {results ? results.indexOf(activeResult) + 1 : '?'}
                  </div>
                  <Timetable schedule={schedule} weekFilter={weekFilter} items={activeResult.items} className="overlay-table" info={infoSingle} coInfo={coInfo} showEnrollment={showEnrollment} onBlockClick={handleBlockClick} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="dual" ref={dualRef}>
            <Timetable schedule={schedule} weekFilter={weekFilter} items={fixedItems(schedule)} info={infoDualLeft} coInfo={coInfo} showEnrollment={showEnrollment} style={{ flex: `${dualRatio} 1 0%` }} onBlockClick={handleBlockClick} />
            <div
              className={`dual-divider${dragging ? ' dragging' : ''}`}
              title={`左表 ${Math.round(dualRatio * 100)}% · 拖动调整`}
              onPointerDown={startDrag}
            />
            <Timetable schedule={schedule} weekFilter={weekFilter} items={rightItems} colors={rightColors} info={infoDualRight} coInfo={coInfo} showEnrollment={showEnrollment} candidate style={{ flex: `${1 - dualRatio} 1 0%` }} onBlockClick={handleBlockClick} selectedCourseId={selectedCourseId} />
          </div>
        )}
      </div>

      <div className="below">
        <div className="course-panel-wrap">
          <CoursePanel
            schedule={schedule}
            update={update}
            openCourseId={selection?.courseId ?? null}
            highlightOptionIds={selection?.optionIds ?? []}
            onOpenCourse={openCourse}
            onCloseCourse={closeCourse}
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
        <Modal title="导入内容超出当前设置" onClose={closeImport}>
          <p>
            导入的课程包含最多 <b>第 {importPrompt.bounds.maxNode} 节</b>、<b>第 {importPrompt.bounds.maxWeek} 周</b>。
            <br />
            当前存档设置为：每天 {importPrompt.nodesPerDay} 节、共 {importPrompt.totalWeeks} 周。
          </p>
          <div className="modal-actions">
            <button onClick={() => confirmImport('truncate')}>截断超出部分</button>
            <button className="primary" onClick={() => confirmImport('widen')}>
              拓宽到 {importPrompt.bounds.maxNode} 节 / {importPrompt.bounds.maxWeek} 周
            </button>
            <button onClick={closeImport}>取消</button>
          </div>
        </Modal>
      )}

      {effectivePanel === 'settings' && (
        <SettingsPanel
          schedule={schedule}
          update={update}
          onClose={closePanel}
          onResetDualRatio={resetDualRatio}
          onImportWakeUp={onImport}
        />
      )}

      {effectivePanel === 'details' && <ScheduleDetails schedule={schedule} onClose={closePanel} />}

      {effectivePanel !== 'home' && effectivePanel !== 'settings' && effectivePanel !== 'details' && (
        <div className={`panel-overlay${previewing ? ' previewing' : ''}`} onClick={previewing ? undefined : closePanel}>
          {effectivePanel === 'goals' && (
            <GoalList
              schedule={schedule}
              update={update}
              onClose={closePanel}
              onLocate={(courseId) => {
                openCourse(courseId);
                closePanel();
              }}
            />
          )}
          {effectivePanel === 'selection' && <SelectionStatus schedule={schedule} onClose={closePanel} />}
          {effectivePanel === 'saves' && (
            <SavePicker currentTerm={schedule.meta.term} onSchedule={replace} onClose={closePanel} />
          )}
        </div>
      )}
    </div>
  );
}
