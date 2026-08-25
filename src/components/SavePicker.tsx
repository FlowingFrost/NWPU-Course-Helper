import { useEffect, useState } from 'react';
import type { Schedule } from '../../shared/types';
import { PanelWindow } from './PanelWindow';

interface SaveMeta {
  id: string;
  term: string;
  courseCount: number;
  updatedAt: number;
}

export default function SavePicker({
  currentTerm,
  onSchedule,
  onClose,
}: {
  currentTerm: string;
  onSchedule: (s: Schedule) => void;
  onClose: () => void;
}) {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSaves = async () => {
    try {
      const r = await fetch('/api/saves');
      const d = await r.json();
      setSaves(d.saves ?? []);
      setCurrentId(d.currentId ?? '');
    } catch {
      /* 忽略 */
    }
  };

  useEffect(() => {
    loadSaves();
  }, []);

  const switchSave = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/saves/${id}/switch`, { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        if (d.schedule) onSchedule(d.schedule);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const createSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const name = newName.trim() || `存档 ${saves.length + 1}`;
      const r = await fetch('/api/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (d.ok) {
        if (d.schedule) onSchedule(d.schedule);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteSave = async (id: string) => {
    if (busy || !confirm('删除该存档？')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/saves/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.ok) {
        if (d.schedule) onSchedule(d.schedule);
        await loadSaves();
      } else {
        alert(d.error || '删除失败');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelWindow title="存档" onClose={onClose} className="save-panel">
      <div className="save-body">
        <div className="muted save-current">当前：{currentTerm || '未命名存档'}</div>
        <div className="save-list">
          {saves.map((s) => (
            <div
              key={s.id}
              className={`save-item ${s.id === currentId ? 'current' : ''}`}
              onClick={() => switchSave(s.id)}
            >
              <span className="save-item-term">{s.term || s.id}</span>
              <span className="save-item-meta">{s.courseCount} 门</span>
              {s.id === currentId && <span className="save-item-current">✓</span>}
              {s.id !== currentId && (
                <button
                  className="save-del"
                  title="删除存档"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSave(s.id);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {creating ? (
          <div className="save-create">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createSave();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder="存档名"
            />
            <button onClick={createSave}>确定</button>
          </div>
        ) : (
          <button className="save-create-btn" onClick={() => setCreating(true)}>
            ＋ 新建存档
          </button>
        )}
      </div>
    </PanelWindow>
  );
}
