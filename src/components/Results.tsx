import { Fragment, useMemo } from 'react';
import type { Schedule } from '../../shared/types';
import type { ScheduleResult } from '../lib/algo';
import { diagnoseNoSolution } from '../lib/algo';
import { dayBlocks } from '../lib/schedule';
import { resolveCourseColors } from '../lib/colors';
import { DAY_SHORT } from '../lib/labels';

function MiniTimetable({ schedule, result }: { schedule: Schedule; result: ScheduleResult }) {
  const { nodesPerDay, daysPerWeek } = schedule.meta;
  const days = Array.from({ length: daysPerWeek }, (_, i) => i + 1);
  const nodes = Array.from({ length: nodesPerDay }, (_, i) => i + 1);
  const courseColors = useMemo(() => resolveCourseColors(schedule.courses.filter((c) => c.participating !== false)), [schedule.courses]);

  // 每个 (day) 的合并块：连续节次的同一课程合并为一个跨行块（与主课表一致）
  const blocks = days.flatMap((day) => dayBlocks(result.items, day, 'all').map((b) => ({ b, day })));

  return (
    <div className="mini-grid" style={{ gridTemplateColumns: `34px repeat(${daysPerWeek}, minmax(52px, 1fr))` }}>
      <div className="mini-cell mini-head" style={{ gridRow: 1, gridColumn: 1 }} />
      {days.map((d, di) => (
        <div key={d} className="mini-cell mini-head" style={{ gridRow: 1, gridColumn: di + 2 }}>
          {DAY_SHORT[d - 1]}
        </div>
      ))}
      {nodes.map((n) => (
        <Fragment key={`r-${n}`}>
          <div className="mini-cell mini-time" style={{ gridRow: n + 1, gridColumn: 1 }}>
            {n}
          </div>
          {days.map((d, di) => (
            <div key={`${d}-${n}`} className="mini-cell mini-slot" style={{ gridRow: n + 1, gridColumn: di + 2 }} />
          ))}
        </Fragment>
      ))}
      {blocks.map(({ b, day }) => (
        <div
          key={b.key}
          className="mini-chip"
          style={{
            gridRow: `${b.startNode + 1} / ${b.endNode + 1}`,
            gridColumn: day + 1,
            background: courseColors.get(b.course.id) ?? b.course.color,
          }}
          title={`${b.course.name} · ${b.teachers.join('/')} · ${b.weekLabel}`}
        >
          {b.course.name}
        </div>
      ))}
    </div>
  );
}

function ResultCard({
  rank,
  result,
  schedule,
  onSelect,
}: {
  rank: number;
  result: ScheduleResult;
  schedule: Schedule;
  onSelect: (r: ScheduleResult) => void;
}) {
  return (
    <div className="result-card" onClick={() => onSelect(result)}>
      <div className="result-head">
        <span className="rank">#{rank}</span>
        <span className="metric">总体评分 {result.ratingAgg.toFixed(2)}</span>
        <span className={`metric ${result.willingTotal > schedule.meta.willingBudget ? 'over' : ''}`}>
          总意愿值 {result.willingTotal}
          {result.willingTotal > schedule.meta.willingBudget ? ' (超预算)' : ''}
        </span>
        <span className="metric">非必修 {result.electiveCount} 门</span>
        <span className="metric">学分 {result.totalCredit}</span>
      </div>
      <MiniTimetable schedule={schedule} result={result} />
    </div>
  );
}

export default function ResultsSection({
  schedule,
  results,
  target,
  onTarget,
  onGenerate,
  onSelect,
}: {
  schedule: Schedule;
  results: ScheduleResult[] | null;
  target: number | 'max';
  onTarget: (t: number | 'max') => void;
  onGenerate: () => void;
  onSelect: (r: ScheduleResult) => void;
}) {
  const diag = results && results.length === 0 ? diagnoseNoSolution(schedule) : [];
  return (
    <section className="results">
      <div className="results-head">
        <h2>选课结果</h2>
        <label className="field">
          <span>非必修目标门数</span>
          <input
            type="number"
            min={0}
            value={target === 'max' ? '' : target}
            placeholder="不限"
            onChange={(e) => onTarget(e.target.value === '' ? 'max' : Number(e.target.value))}
          />
        </label>
        <button onClick={onGenerate}>生成可行课表</button>
        {results && <span className="muted">共 {results.length} 份（展示前 20，点击卡片可叠加到主课表）</span>}
      </div>
      {results && (
        <div className="results-row">
          {results.slice(0, 20).map((r, i) => (
            <ResultCard key={i} rank={i + 1} result={r} schedule={schedule} onSelect={onSelect} />
          ))}
          {results.length === 0 && (
            <div className="results-empty">
              <div className="muted">无可行组合，诊断：</div>
              {diag.length > 0 ? (
                <ul className="diag-list">
                  {diag.map((d, i) => (
                    <li key={i} className={`diag-${d.type}`}>
                      {d.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="muted">未识别到明确的单一原因，可能是多门课组合冲突。</div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
