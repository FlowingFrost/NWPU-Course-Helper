import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Schedule, Meta } from '../../shared/types';

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function SettingsPanel({
  schedule,
  update,
  onResetDualRatio,
  onImportWakeUp,
}: {
  schedule: Schedule;
  update: (fn: (s: Schedule) => Schedule) => void;
  onResetDualRatio?: () => void;
  onImportWakeUp?: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = schedule.meta;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const setMeta = (patch: Partial<Meta>) => update((s) => ({ ...s, meta: { ...s.meta, ...patch } }));

  const setNodesPerDay = (n: number) =>
    update((s) => {
      const nodeTimes = Array.from({ length: n }, (_, i) => s.nodeTimes[i] ?? { node: i + 1, start: '', end: '' });
      return { ...s, meta: { ...s.meta, nodesPerDay: n }, nodeTimes: nodeTimes.map((t, i) => ({ ...t, node: i + 1 })) };
    });

  const setNodeTime = (node: number, patch: { start?: string; end?: string }) =>
    update((s) => ({ ...s, nodeTimes: s.nodeTimes.map((t) => (t.node === node ? { ...t, ...patch } : t)) }));

  const toggleDivider = (n: number, on: boolean) =>
    setMeta({
      dividerNodes: on
        ? [...new Set([...(meta.dividerNodes ?? []), n])].sort((a, b) => a - b)
        : (meta.dividerNodes ?? []).filter((x) => x !== n),
    });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(schedule, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-${meta.term || 'backup'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '')) as Schedule;
        update(() => parsed);
      } catch (e) {
        alert('导入失败：' + String(e));
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <>
      <button onClick={() => setOpen(true)}>设置</button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>设置</h3>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="关闭">
                ✕
              </button>
            </div>
            <div className="settings-body">
              <div className="options-head">显示偏好</div>
              <div className="pref-row">
                <Field label="星期组合区分">
                  <input
                    type="checkbox"
                    checked={meta.weekComboColors !== false}
                    onChange={(e) => setMeta({ weekComboColors: e.target.checked })}
                  />
                </Field>
                {onResetDualRatio && <button onClick={onResetDualRatio}>复原双课表 1:1</button>}
              </div>
              <div className="pref-row">
                <Field label="课表行高">
                  <input
                    type="range"
                    min={36}
                    max={80}
                    step={2}
                    value={meta.rowHeight ?? 52}
                    onChange={(e) => setMeta({ rowHeight: Number(e.target.value) })}
                  />
                  <span className="row-h-val">{meta.rowHeight ?? 52}px</span>
                </Field>
                <button onClick={() => setMeta({ rowHeight: 52 })}>恢复默认高度</button>
              </div>
              <Field label="均分卡片宽度">
                <input
                  type="checkbox"
                  checked={meta.evenCardWidth === true}
                  onChange={(e) => setMeta({ evenCardWidth: e.target.checked })}
                />
              </Field>
              <div className="pref-row">
                <Field label="淡化其它课程">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((meta.focusDimOpacity ?? 0.5) * 100)}
                    onChange={(e) => setMeta({ focusDimOpacity: Number(e.target.value) / 100 })}
                    title="点击候选后，双课表右侧其它课程块的透明度"
                  />
                  <span className="row-h-val">{Math.round((meta.focusDimOpacity ?? 0.5) * 100)}%</span>
                </Field>
                <button onClick={() => setMeta({ focusDimOpacity: 0.5 })}>恢复默认</button>
              </div>

              <div className="options-head">存档设置</div>
              <div className="two">
                <Field label="学期">
                  <input value={meta.term} onChange={(e) => setMeta({ term: e.target.value })} />
                </Field>
                <Field label="学校">
                  <input value={meta.school} onChange={(e) => setMeta({ school: e.target.value })} />
                </Field>
              </div>
              <div className="two">
                <Field label="开学日期">
                  <input value={meta.startDate} onChange={(e) => setMeta({ startDate: e.target.value })} />
                </Field>
                <Field label="总周数">
                  <input type="number" value={meta.totalWeeks} onChange={(e) => setMeta({ totalWeeks: num(e.target.value) })} />
                </Field>
              </div>
              <div className="two">
                <Field label="学分上限">
                  <input type="number" value={meta.creditCap} onChange={(e) => setMeta({ creditCap: num(e.target.value) })} />
                </Field>
                <Field label="意愿预算">
                  <input type="number" value={meta.willingBudget} onChange={(e) => setMeta({ willingBudget: num(e.target.value) })} />
                </Field>
              </div>
              <Field label="每天节数">
                <input type="number" min={1} value={meta.nodesPerDay} onChange={(e) => setNodesPerDay(num(e.target.value))} />
              </Field>
              <div className="options-head">课表分割线（第 N 节后）</div>
              <div className="divider-toggles">
                {Array.from({ length: meta.nodesPerDay - 1 }, (_, i) => i + 1).map((n) => (
                  <label key={n} className="divider-toggle">
                    <input
                      type="checkbox"
                      checked={(meta.dividerNodes ?? []).includes(n)}
                      onChange={(e) => toggleDivider(n, e.target.checked)}
                    />
                    {n}
                  </label>
                ))}
              </div>
              <div className="options-head">节次时间（第 N 节 起止）</div>
              <div className="nodetimes">
                {schedule.nodeTimes
                  .filter((t) => t.node <= meta.nodesPerDay)
                  .sort((a, b) => a.node - b.node)
                  .map((t) => (
                    <div key={t.node} className="nodetime-row">
                      <span className="nt-node">第{t.node}节</span>
                      <input value={t.start} onChange={(e) => setNodeTime(t.node, { start: e.target.value })} placeholder="开始" />
                      <input value={t.end} onChange={(e) => setNodeTime(t.node, { end: e.target.value })} placeholder="结束" />
                    </div>
                  ))}
              </div>
              <div className="settings-actions">
                {onImportWakeUp && (
                  <label className="button-like">
                    导入 WakeUp
                    <input
                      type="file"
                      accept=".wakeup_schedule,.json,.txt"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onImportWakeUp(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                <button onClick={exportJson}>导出 JSON 存档</button>
                <label className="button-like">
                  导入 JSON 存档
                  <input
                    type="file"
                    accept=".json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importJson(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
