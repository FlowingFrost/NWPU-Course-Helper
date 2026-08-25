import { useEffect } from 'react';
import type { Schedule, Meta, InfoBits, InfoView } from '../../shared/types';
import { num } from '../lib/num';
import { infoOf } from '../lib/display';
import { TEXTBOOK_COLUMNS } from '../lib/textbookColumns';
import { Field } from './Field';

const HOME_VIEWS: Array<{ id: InfoView; label: string }> = [
  { id: 'single', label: '单课表' },
  { id: 'dualLeft', label: '双课表左' },
  { id: 'dualRight', label: '双课表右' },
];
const PLUGIN_VIEWS: Array<{ id: InfoView; label: string }> = [{ id: 'plugin', label: '插件预览' }];

function InfoConfigTable({
  meta,
  views,
  setInfo,
}: {
  meta: Meta;
  views: Array<{ id: InfoView; label: string }>;
  setInfo: (view: InfoView, patch: Partial<InfoBits>) => void;
}) {
  return (
    <table className="info-config-table">
      <thead>
        <tr>
          <th>视图</th>
          <th>教师</th>
          <th>周次</th>
          <th>地点</th>
        </tr>
      </thead>
      <tbody>
        {views.map((v) => {
          const bits = infoOf(meta, v.id);
          return (
            <tr key={v.id}>
              <td>{v.label}</td>
              <td>
                <input type="checkbox" checked={bits.teacher} onChange={(e) => setInfo(v.id, { teacher: e.target.checked })} />
              </td>
              <td>
                <input type="checkbox" checked={bits.week} onChange={(e) => setInfo(v.id, { week: e.target.checked })} />
              </td>
              <td>
                <input type="checkbox" checked={bits.room} onChange={(e) => setInfo(v.id, { room: e.target.checked })} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function SettingsPanel({
  schedule,
  update,
  onClose,
  onResetDualRatio,
  onImportWakeUp,
}: {
  schedule: Schedule;
  update: (fn: (s: Schedule) => Schedule) => void;
  onClose: () => void;
  onResetDualRatio?: () => void;
  onImportWakeUp?: (file: File) => void;
}) {
  const meta = schedule.meta;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setMeta = (patch: Partial<Meta>) => update((s) => ({ ...s, meta: { ...s.meta, ...patch } }));

  const setInfo = (view: InfoView, patch: Partial<InfoBits>) =>
    update((s) => ({
      ...s,
      meta: {
        ...s.meta,
        infoConfig: { ...s.meta.infoConfig, [view]: { ...(s.meta.infoConfig?.[view] ?? {}), ...patch } },
      },
    }));

  const setCoInfo = (patch: Partial<NonNullable<Meta['coInfo']>>) =>
    update((s) => ({ ...s, meta: { ...s.meta, coInfo: { ...s.meta.coInfo, ...patch } } }));

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

  const coInfo = {
    enabled: meta.coInfo?.enabled !== false,
    showTeacher: meta.coInfo?.showTeacher !== false,
    showRoom: meta.coInfo?.showRoom !== false,
  };

  return (
    <div className="settings-overlay">
      <div className="settings-page">
        <div className="settings-head">
          <h2>设置</h2>
          <button className="panel-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* —— 主页 · 课表 —— */}
          <div className="settings-category">🏠 主页 · 课表</div>
          <div className="options-head">显示课程信息（教师 / 周次 / 地点）</div>
          <InfoConfigTable meta={meta} views={HOME_VIEWS} setInfo={setInfo} />

          <div className="options-head">不同候选信息叠加</div>
          <div className="pref-row">
            <Field label="总开关">
              <input type="checkbox" checked={coInfo.enabled} onChange={(e) => setCoInfo({ enabled: e.target.checked })} />
            </Field>
            <Field label="显示教师">
              <input type="checkbox" checked={coInfo.showTeacher} onChange={(e) => setCoInfo({ showTeacher: e.target.checked })} />
            </Field>
            <Field label="显示地点">
              <input type="checkbox" checked={coInfo.showRoom} onChange={(e) => setCoInfo({ showRoom: e.target.checked })} />
            </Field>
          </div>

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
          <Field label="结果展示数量">
            <input
              type="number"
              min={1}
              max={200}
              value={meta.resultLimit ?? 20}
              onChange={(e) => setMeta({ resultLimit: Math.max(1, Math.min(200, num(e.target.value) || 20)) })}
              title="一键生成可行课表后，结果区最多展示多少份"
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

          {/* —— 课表详情 —— */}
          <div className="settings-category">📊 课表详情</div>
          <Field label="周段优化显示">
            <input
              type="checkbox"
              checked={meta.optimizeWeeks !== false}
              onChange={(e) => setMeta({ optimizeWeeks: e.target.checked })}
            />
          </Field>
          <p className="muted">把「上课课程集合相同」的周合并为一组（含单双周课、断续开课）；关闭后按连续周段独立拆开。</p>

          {/* —— 教材信息 —— */}
          <div className="settings-category">📚 教材信息</div>
          <div className="options-head">显示列（在「教材」页表格中展示哪些列）</div>
          <div className="divider-toggles">
            {TEXTBOOK_COLUMNS.map((c) => (
              <label key={c.key} className="divider-toggle">
                <input
                  type="checkbox"
                  checked={meta.textbookColumns?.[c.key] !== false}
                  onChange={(e) =>
                    setMeta({ textbookColumns: { ...meta.textbookColumns, [c.key]: e.target.checked } })
                  }
                />
                {c.label}
              </label>
            ))}
          </div>

          {/* —— 插件 · 预览 —— */}
          <div className="settings-category">🧩 插件 · 预览</div>
          <div className="options-head">显示课程信息（教师 / 周次 / 地点）</div>
          <InfoConfigTable meta={meta} views={PLUGIN_VIEWS} setInfo={setInfo} />

          {/* —— 存档 —— */}
          <div className="settings-category">💾 存档</div>
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

          <div className="options-head">导入 / 导出</div>
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
  );
}
