import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Schedule, TextbookColumnKey, TextbookEntry } from '../../shared/types';
import { PanelWindow } from './PanelWindow';
import { TEXTBOOK_COLUMNS, NEVER_COMPRESS, computeColumnWidths, type ColumnSpec } from '../lib/textbookColumns';

type FlatRow = Record<TextbookColumnKey, string>;

// 把所有课程的教材行拍平成一张表；无教材行的课程补一行占位。
function flattenRows(entries: TextbookEntry[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const e of entries) {
    if (e.rows.length) {
      for (const r of e.rows) {
        rows.push({
          courseName: e.courseName,
          courseCode: e.courseCode,
          type: r.type,
          index: r.index,
          name: r.name,
          author: r.author,
          isbn: r.isbn,
          publisher: r.publisher,
          edition: r.edition,
          pubDate: r.pubDate,
        });
      }
    } else {
      rows.push({
        courseName: e.courseName,
        courseCode: e.courseCode,
        type: '',
        index: '',
        name: '（未提取到教材信息）',
        author: '',
        isbn: '',
        publisher: '',
        edition: '',
        pubDate: '',
      });
    }
  }
  return rows;
}

// 容器像素宽 → 估算 ch 宽（约 7px/ch，13px 字号混合文本的近似）
const CH_PX = 7;

export default function TextbooksPanel({
  schedule,
  update,
  onClose,
}: {
  schedule: Schedule;
  update: (fn: (s: Schedule) => Schedule) => void;
  onClose: () => void;
}) {
  const entries = schedule.textbooks ?? [];
  const visibleCols = useMemo(
    () => TEXTBOOK_COLUMNS.filter((c) => schedule.meta.textbookColumns?.[c.key] !== false),
    [schedule.meta.textbookColumns],
  );
  const rows = useMemo(() => flattenRows(entries), [entries]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [budget, setBudget] = useState(80);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setBudget(Math.max(40, Math.floor(el.clientWidth / CH_PX)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colWidths = useMemo(() => {
    const specs: ColumnSpec[] = visibleCols.map((c) => ({
      key: c.key,
      cells: [c.label, ...rows.map((r) => r[c.key])],
    }));
    return computeColumnWidths(specs, budget, NEVER_COMPRESS);
  }, [visibleCols, rows, budget]);

  const setColumn = (key: TextbookColumnKey, on: boolean) =>
    update((s) => ({ ...s, meta: { ...s.meta, textbookColumns: { ...s.meta.textbookColumns, [key]: on } } }));

  return (
    <PanelWindow title="教材信息" onClose={onClose} className="textbooks-panel">
      <div className="textbooks-body" ref={bodyRef}>
        <div className="textbooks-toolbar">
          <span className="muted">
            共 {entries.length} 门课 · 显示 {visibleCols.length}/{TEXTBOOK_COLUMNS.length} 列
          </span>
          <div className="textbooks-actions">
            {entries.length > 0 && (
              <button className="notices-clear" onClick={() => update((s) => ({ ...s, textbooks: [] }))}>
                清空
              </button>
            )}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="muted empty">
            暂无教材信息。在教务「我的课表」页点击插件按钮「导出教材信息」后，教材信息会记录在这里。列的显示/隐藏可在「设置 → 教材信息」里开关。
          </div>
        ) : (
          <div className="textbook-table-wrap">
            <table className="textbook-table merged">
              <colgroup>
                {visibleCols.map((c) => (
                  <col key={c.key} style={{ width: `${colWidths.get(c.key) ?? 10}ch` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visibleCols.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {visibleCols.map((c) => (
                      <td key={c.key} title={r[c.key]}>
                        {r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="textbook-column-toggles">
          {TEXTBOOK_COLUMNS.map((c) => (
            <label key={c.key} className="textbook-col-toggle">
              <input
                type="checkbox"
                checked={schedule.meta.textbookColumns?.[c.key] !== false}
                onChange={(e) => setColumn(c.key, e.target.checked)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>
    </PanelWindow>
  );
}
