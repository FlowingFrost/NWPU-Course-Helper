import { useMemo, useState } from 'react';
import type { Schedule, Goal, GoalTargetType } from '../../shared/types';
import { addGoal, deleteGoal, updateCourse } from '../lib/mutations';
import { goalCourses, goalDisplayName, goalState, GOAL_STATE_LABEL, type GoalState } from '../lib/goals';
import { CATEGORY_LABEL } from '../lib/labels';
import { PanelWindow } from './PanelWindow';
import { Field } from './Field';

const STATE_CLASS: Record<GoalState, string> = {
  'no-candidate': 'goal-state none',
  'undecided': 'goal-state pending',
  'done': 'goal-state done',
};

export default function GoalList({
  schedule,
  update,
  onClose,
  onLocate,
}: {
  schedule: Schedule;
  update: (fn: (s: Schedule) => Schedule) => void;
  onClose: () => void;
  onLocate?: (courseId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [targetType, setTargetType] = useState<GoalTargetType>('course');
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');

  const goals = schedule.goals ?? [];

  const courseCodes = useMemo(() => [...new Set(schedule.courses.map((c) => c.code).filter((c) => c.trim() !== ''))], [schedule.courses]);
  const linkIds = useMemo(() => [...new Set(schedule.courses.map((c) => c.linkId).filter((c) => c && c.trim() !== ''))], [schedule.courses]);

  const states = goals.map((g) => goalState(schedule, g));
  const doneCount = states.filter((s) => s === 'done').length;

  const deriveName = (t: string, type: GoalTargetType): string => {
    const courses = type === 'link' ? schedule.courses.filter((c) => c.linkId === t) : schedule.courses.filter((c) => c.code === t);
    if (courses.length === 1) return courses[0].name || '';
    if (courses.length > 1) return [...new Set(courses.map((c) => c.name).filter(Boolean))].join(' / ');
    return '';
  };

  const handleAdd = () => {
    const t = target.trim();
    if (!t) return;
    const n = name.trim() || deriveName(t, targetType) || t;
    update((s) => addGoal(s, { name: n, target: t, targetType }));
    setTarget('');
    setName('');
    setAdding(false);
  };

  const locate = (g: Goal) => {
    const courses = goalCourses(schedule, g);
    if (courses[0] && onLocate) onLocate(courses[0].id);
  };

  return (
    <PanelWindow title="目标清单" onClose={onClose} className="goal-panel">
      <div className="goal-body">
        <div className="goal-summary muted">
          已完成 {doneCount} / 共 {goals.length} 个目标
          <span className="goal-summary-hint">（未填入候选方案 → 未敲定教学班 → 已完成）</span>
        </div>

        {adding ? (
          <div className="goal-add">
            <Field label="目标类型">
              <select value={targetType} onChange={(e) => setTargetType(e.target.value as GoalTargetType)}>
                <option value="course">课程编号</option>
                <option value="link">串联组</option>
              </select>
            </Field>
            <Field label="目标">
              <input
                autoFocus
                list={targetType === 'course' ? 'goal-course-codes' : 'goal-link-ids'}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={targetType === 'course' ? '如 U09M11042' : '如 体育选项组'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
            </Field>
            <Field label="备注名">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="可选，默认取课程名" onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
            </Field>
            <div className="goal-add-actions">
              <button className="primary" onClick={handleAdd}>
                添加
              </button>
              <button onClick={() => setAdding(false)}>取消</button>
            </div>
            <datalist id="goal-course-codes">
              {courseCodes.map((c) => {
                const course = schedule.courses.find((x) => x.code === c);
                return (
                  <option key={c} value={c}>
                    {course ? `${course.name}（${c}）` : c}
                  </option>
                );
              })}
            </datalist>
            <datalist id="goal-link-ids">
              {linkIds.map((l) => {
                const members = schedule.courses.filter((c) => c.linkId === l).map((c) => c.name).filter(Boolean);
                return (
                  <option key={l!} value={l!}>
                    {members.length ? members.join(' / ') : l}
                  </option>
                );
              })}
            </datalist>
          </div>
        ) : (
          <button className="goal-add-btn" onClick={() => setAdding(true)}>
            ＋ 添加目标
          </button>
        )}

        <div className="goal-list">
          {goals.map((g) => {
            const st = goalState(schedule, g);
            const courses = goalCourses(schedule, g);
            return (
              <div key={g.id} className="goal-card">
                <div className="goal-item" onClick={() => courses.length && locate(g)} title={courses.length ? '点击定位到该课程' : undefined}>
                  <span className={STATE_CLASS[st]}>{GOAL_STATE_LABEL[st]}</span>
                  <span className="goal-name">{goalDisplayName(schedule, g)}</span>
                  <span className="goal-target muted">
                    {g.targetType === 'link' ? `串联组 ${g.target}` : `编号 ${g.target}`}
                  </span>
                  <button
                    className="goal-del"
                    title="删除目标"
                    onClick={(e) => {
                      e.stopPropagation();
                      update((s) => deleteGoal(s, g.id));
                    }}
                  >
                    ✕
                  </button>
                </div>
                {g.targetType === 'link' && courses.length > 0 && (
                  <div className="goal-members">
                    {courses.map((c) => {
                      const participating = c.participating !== false;
                      return (
                        <div key={c.id} className="goal-member" title={c.code ? `${c.name}（${c.code}）` : c.name}>
                          <label
                            className="goal-member-toggle"
                            title={c.category === 'builtin' ? '内置课已选课成功，恒参与课表' : '是否参与排课（关闭后不参与组合枚举与课表显示）'}
                          >
                            <input
                              type="checkbox"
                              disabled={c.category === 'builtin'}
                              checked={participating}
                              onChange={(e) => update((s) => updateCourse(s, c.id, { participating: e.target.checked }))}
                            />
                            排课
                          </label>
                          <span className="goal-member-name">{c.name || '(未命名)'}</span>
                          <span className={`badge ${c.category}`}>{CATEGORY_LABEL[c.category]}</span>
                          {c.options.some((o) => o.selected) && <span className="goal-member-sel">已确认</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {goals.length === 0 && <div className="muted empty">暂无目标。添加后会自动跟踪选课进度。</div>}
        </div>
      </div>
    </PanelWindow>
  );
}
