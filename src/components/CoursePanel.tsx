import { useEffect, useMemo, useRef, useState } from 'react';
import type { Schedule, Course, Option, Segment, Category } from '../../shared/types';
import {
  addCourse,
  updateCourse,
  deleteCourse,
  setCategory,
  addOption,
  updateOption,
  removeOption,
  toggleSelected,
  addSegment,
  updateSegment,
  removeSegment,
  emptySegment,
} from '../lib/mutations';
import { resolveCourseColors } from '../lib/colors';
import { fixedItems } from '../lib/schedule';
import { optionsConflict } from '../lib/algo';
import { CATEGORY_LABEL, DAY_SHORT } from '../lib/labels';
import { num } from '../lib/num';
import { Field } from './Field';
import { Modal } from './Modal';

interface Props {
  schedule: Schedule;
  update: (fn: (s: Schedule) => Schedule) => void;
  openCourseId: string | null;
  highlightOptionIds: string[];
  onOpenCourse: (courseId: string) => void;
  onCloseCourse: () => void;
}

function SegmentRow({
  seg,
  onChange,
  onRemove,
}: {
  seg: Segment;
  onChange: (p: Partial<Segment>) => void;
  onRemove: () => void;
}) {
  const endNode = seg.startNode + seg.step - 1;
  const setStart = (v: number) => {
    const start = Math.max(1, v);
    const step = Math.max(1, endNode - start + 1);
    onChange({ startNode: start, step });
  };
  const setEnd = (v: number) => {
    const end = Math.max(1, v);
    onChange({ step: Math.max(1, end - seg.startNode + 1) });
  };
  return (
    <div className="seg">
      <select value={seg.day} onChange={(e) => onChange({ day: Number(e.target.value) })} title="星期">
        {DAY_SHORT.map((d, i) => (
          <option key={i + 1} value={i + 1}>
            周{d}
          </option>
        ))}
      </select>
      <span>第</span>
      <input type="number" value={seg.startNode} onChange={(e) => setStart(num(e.target.value))} title="起始节" />
      <span>~</span>
      <input type="number" value={endNode} onChange={(e) => setEnd(num(e.target.value))} title="结束节" />
      <span>节</span>
      <input type="number" value={seg.startWeek} onChange={(e) => onChange({ startWeek: num(e.target.value) })} title="起周" />
      <span>-</span>
      <input type="number" value={seg.endWeek} onChange={(e) => onChange({ endWeek: num(e.target.value) })} title="止周" />
      <span>周</span>
      <input value={seg.teacher} onChange={(e) => onChange({ teacher: e.target.value })} placeholder="老师" />
      <input value={seg.room} onChange={(e) => onChange({ room: e.target.value })} placeholder="地点" />
      <button className="x" onClick={onRemove} title="删除时间段">
        ✕
      </button>
    </div>
  );
}

function OptionBlock({
  course,
  option,
  update,
  highlighted,
  conflict,
}: {
  course: Course;
  option: Option;
  update: Props['update'];
  highlighted: boolean;
  conflict: boolean;
}) {
  const isBuiltin = course.category === 'builtin';
  return (
    <div className={`option ${option.selected ? 'sel' : ''}${highlighted ? ' focus' : ''}${option.locked ? ' locked' : ''}${conflict ? ' conflict' : ''}`} data-option-id={option.id}>
      <div className="option-row">
        <Field label="教学班编号">
          <input
            style={{ width: 140 }}
            value={option.label}
            onChange={(e) => update((s) => updateOption(s, course.id, option.id, { label: e.target.value }))}
            placeholder="如 U10M11011.01"
          />
        </Field>
        <Field label="开放选课">
          <input
            type="checkbox"
            checked={option.selectable === true}
            onChange={(e) => update((s) => updateOption(s, course.id, option.id, { selectable: e.target.checked }))}
          />
        </Field>
      </div>
      <div className="option-row">
        <label className="option-label" title="确认要选这个教学班（区别于内置课的「已选课成功」；超容量时会计入意愿值）">
          <input
            type="checkbox"
            disabled={isBuiltin}
            checked={option.selected}
            onChange={() => update((s) => toggleSelected(s, course.id, option.id))}
          />
          确认选
        </label>
        <Field label="评分">
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={option.rating}
            onChange={(e) => update((s) => updateOption(s, course.id, option.id, { rating: num(e.target.value) }))}
          />
        </Field>
        <Field label="已选人数">
          <input
            type="number"
            value={option.enrolled}
            onChange={(e) => update((s) => updateOption(s, course.id, option.id, { enrolled: num(e.target.value) }))}
          />
        </Field>
        <Field label="容量">
          <input
            type="number"
            value={option.capacity}
            onChange={(e) => update((s) => updateOption(s, course.id, option.id, { capacity: num(e.target.value) }))}
          />
        </Field>
      </div>
      <div className="segs">
        {option.segments.map((seg, i) => (
          <SegmentRow
            key={i}
            seg={seg}
            onChange={(p) => update((s) => updateSegment(s, course.id, option.id, i, p))}
            onRemove={() => update((s) => removeSegment(s, course.id, option.id, i))}
          />
        ))}
        {option.segments.length === 0 && <div className="muted">暂无时间段</div>}
      </div>
      <div className="option-actions">
        <button
          className={option.locked ? 'lock-btn locked' : 'lock-btn'}
          onClick={() => update((s) => updateOption(s, course.id, option.id, { locked: !option.locked }))}
          title={option.locked ? '已锁定：粘贴/解析不会覆盖此候选（点击解锁）' : '锁定后粘贴/解析不会覆盖此候选'}
        >
          {option.locked ? '🔒 已锁定' : '🔓 锁定'}
        </button>
        <button onClick={() => update((s) => addSegment(s, course.id, option.id, emptySegment()))}>+ 时间段</button>
        {!isBuiltin && course.options.length > 1 && (
          <button
            className="danger"
            onClick={() => {
              if (confirm('删除该候选方案？')) update((s) => removeOption(s, course.id, option.id));
            }}
          >
            删除候选
          </button>
        )}
      </div>
    </div>
  );
}

function CourseCard({
  course,
  dotColor,
  onOpen,
}: {
  course: Course;
  dotColor: string;
  onOpen: () => void;
}) {
  const hasSelected = course.category !== 'builtin' && course.options.some((o) => o.selected);
  const notParticipating = course.participating === false;
  return (
    <div className={`course-card${hasSelected ? ' selected' : ''}${notParticipating ? ' off' : ''}`}>
      <div className="course-row" onClick={onOpen}>
        <span className="dot" style={{ background: dotColor }} />
        <span className="course-name">{course.name || '(未命名)'}</span>
        <span className={`badge ${course.category}`}>{CATEGORY_LABEL[course.category]}</span>
        {hasSelected && <span className="badge badge-selected">已确认</span>}
        {notParticipating && <span className="badge badge-off">不排课</span>}
        <span className="muted">{course.credit} 学分</span>
      </div>
    </div>
  );
}

// 课程候选详情弹窗：与列表筛选解耦，独立按 openCourseId 渲染
function CourseDetailModal({
  course,
  update,
  highlightOptionIds,
  fixedOptions,
  onClose,
}: {
  course: Course;
  update: Props['update'];
  highlightOptionIds: string[];
  fixedOptions: Option[];
  onClose: () => void;
}) {
  const detailRef = useRef<HTMLDivElement>(null);
  const [filterConflicts, setFilterConflicts] = useState(false);

  // 与双课表右侧「过滤冲突课程」同规则：与内置/确定选择课程冲突的候选变灰。
  // 排除候选自身，避免已选中的候选与自己冲突而被误灰。
  const isConflict = (o: Option) => fixedOptions.some((fo) => fo !== o && optionsConflict(o, fo));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 从课表点击进入时，滚动到第一个高亮的候选
  useEffect(() => {
    if (!highlightOptionIds.length) return;
    const el = detailRef.current?.querySelector(`[data-option-id="${highlightOptionIds[0]}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightOptionIds]);

  return (
    <Modal title={course.name || '(未命名)'} onClose={onClose} className="course-modal">
      <div className="course-detail" ref={detailRef}>
          <div className="course-fields">
            <Field label="名称">
              <input value={course.name} onChange={(e) => update((s) => updateCourse(s, course.id, { name: e.target.value }))} />
            </Field>
            <Field label="课程编号">
              <input value={course.code} onChange={(e) => update((s) => updateCourse(s, course.id, { code: e.target.value }))} />
            </Field>
            <Field label="学分">
              <input
                type="number"
                step="0.5"
                value={course.credit}
                onChange={(e) => update((s) => updateCourse(s, course.id, { credit: num(e.target.value) }))}
              />
            </Field>
            <Field label="类别">
              <select value={course.category} onChange={(e) => update((s) => setCategory(s, course.id, e.target.value as Category))}>
                <option value="builtin">内置</option>
                <option value="required">必修</option>
                <option value="elective">非必修</option>
              </select>
            </Field>
          </div>
          <Field label="串联组">
            <input
              value={course.linkId ?? ''}
              onChange={(e) => update((s) => updateCourse(s, course.id, { linkId: e.target.value.trim() || undefined }))}
              placeholder="留空=不串联；同组只选其一"
            />
          </Field>
          {course.category !== 'builtin' && (
            <div className="course-flags">
              <label className="option-label">
                <input
                  type="checkbox"
                  checked={course.participating !== false}
                  onChange={(e) => update((s) => updateCourse(s, course.id, { participating: e.target.checked }))}
                />
                参与排课
              </label>
              <label className="option-label" title="与内置/确定选择的课程冲突的候选变灰显示">
                <input
                  type="checkbox"
                  checked={filterConflicts}
                  onChange={(e) => setFilterConflicts(e.target.checked)}
                />
                过滤冲突课程
              </label>
            </div>
          )}
          <div className="options">
            <div className="options-head">候选方案</div>
            {course.options.map((o) => (
              <OptionBlock
                key={o.id}
                course={course}
                option={o}
                update={update}
                highlighted={highlightOptionIds.includes(o.id)}
                conflict={filterConflicts && isConflict(o)}
              />
            ))}
            {course.category !== 'builtin' && (
              <button onClick={() => update((s) => addOption(s, course.id))}>+ 加候选</button>
            )}
          </div>
          <button
            className="danger"
            onClick={() => {
              if (confirm(`删除课程「${course.name}」？`)) update((s) => deleteCourse(s, course.id));
            }}
          >
            删除课程
          </button>
      </div>
    </Modal>
  );
}

export default function CoursePanel({ schedule, update, openCourseId, highlightOptionIds, onOpenCourse, onCloseCourse }: Props) {
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(() => new Set(['builtin', 'required', 'elective']));
  const [newName, setNewName] = useState('');
  const [showNonParticipating, setShowNonParticipating] = useState(true);
  const [showSelected, setShowSelected] = useState(false);

  const allCategories: Category[] = ['builtin', 'required', 'elective'];
  const isSelectedCourse = (c: Course) => c.category === 'builtin' || c.options.some((o) => o.selected);

  const toggleCategory = (cat: Category) =>
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  const selectAll = () => setActiveCategories(new Set(allCategories));

  const courses = schedule.courses.filter((c) => {
    if (!activeCategories.has(c.category)) return false;
    if (!showNonParticipating && c.participating === false) return false;
    if (!showSelected && isSelectedCourse(c)) return false; // 未勾选「显示已确认」时，隐藏已确认课程
    return true;
  });
  const courseColors = useMemo(() => resolveCourseColors(schedule.courses.filter((c) => c.participating !== false)), [schedule.courses]);
  const fixedOptions = useMemo(() => fixedItems(schedule).map((it) => it.option), [schedule]);

  // 详情弹窗与被筛选的课程列表解耦：直接按 openCourseId 找课程渲染
  const openCourse = openCourseId ? schedule.courses.find((c) => c.id === openCourseId) ?? null : null;

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    update((s) => addCourse(s, { name, category: 'builtin' }));
    setNewName('');
  };

  return (
    <aside className="panel">
      <div className="panel-head">
        <h2>课程与候选</h2>
        <span className="muted">{schedule.courses.length} 门</span>
        <div className="tabs">
          <button className={`tab ${activeCategories.size === allCategories.length ? 'active' : ''}`} onClick={selectAll}>
            全部
          </button>
          {allCategories.map((cat) => (
            <button key={cat} className={`tab ${activeCategories.has(cat) ? 'active' : ''}`} onClick={() => toggleCategory(cat)}>
              {CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>
        <label className="option-label">
          <input
            type="checkbox"
            checked={showSelected}
            onChange={(e) => setShowSelected(e.target.checked)}
          />
          显示已确认
        </label>
        <label className="option-label">
          <input
            type="checkbox"
            checked={showNonParticipating}
            onChange={(e) => setShowNonParticipating(e.target.checked)}
          />
          显示不参与排课
        </label>
      </div>
      <div className="add-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新课程名称"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <button onClick={handleAdd}>新建</button>
      </div>
      <div className="course-list">
        {courses.map((c) => (
          <CourseCard
            key={c.id}
            course={c}
            dotColor={courseColors.get(c.id) ?? c.color}
            onOpen={() => onOpenCourse(c.id)}
          />
        ))}
        {courses.length === 0 && <div className="muted empty">暂无课程</div>}
      </div>
      {openCourse && (
        <CourseDetailModal
          course={openCourse}
          update={update}
          highlightOptionIds={highlightOptionIds}
          fixedOptions={fixedOptions}
          onClose={onCloseCourse}
        />
      )}
    </aside>
  );
}
