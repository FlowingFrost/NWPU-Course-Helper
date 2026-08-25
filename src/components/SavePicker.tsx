import { useEffect, useState } from 'react';
import type { BackupMeta, Schedule } from '../../shared/types';
import { PanelWindow } from './PanelWindow';

interface SaveMeta {
  id: string;
  term: string;
  courseCount: number;
  updatedAt: number;
}

function formatTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  const loadBackups = async (id: string) => {
    try {
      const r = await fetch(`/api/saves/${id}/backups`);
      const d = await r.json();
      setBackups(d.backups ?? []);
    } catch {
      setBackups([]);
    }
  };

  useEffect(() => {
    loadSaves();
  }, []);

  // 当前存档变化时刷新右侧备份列表
  useEffect(() => {
    if (currentId) loadBackups(currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

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
    if (busy || !confirm('删除该存档？其全部备份也会一并删除。')) return;
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

  const createBackup = async () => {
    if (busy || !currentId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/saves/${currentId}/backups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: backupName.trim() || undefined }),
      });
      const d = await r.json();
      if (d.ok) {
        setBackups(d.backups ?? []);
        setBackupName('');
        setCreatingBackup(false);
      } else {
        alert(d.error || '创建备份失败');
      }
    } finally {
      setBusy(false);
    }
  };

  const renameBackup = async (id: string) => {
    if (busy) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/saves/${currentId}/backups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (d.ok) {
        setBackups(d.backups ?? []);
        setRenamingId(null);
      } else {
        alert(d.error || '更名失败');
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteBackup = async (id: string) => {
    if (busy || !confirm('删除该备份？')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/saves/${currentId}/backups/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.ok) {
        setBackups(d.backups ?? []);
      } else {
        alert(d.error || '删除失败');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelWindow title="存档与备份" onClose={onClose} className="save-panel">
      <div className="save-body save-two-col">
        <div className="save-col">
          <div className="save-col-head">存档</div>
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

        <div className="save-col">
          <div className="save-col-head">备份（当前存档）</div>
          <div className="save-list">
            {backups.length === 0 && <div className="muted save-empty">暂无备份</div>}
            {backups.map((b) => (
              <div key={b.id} className="save-item backup-item">
                {renamingId === b.id ? (
                  <input
                    autoFocus
                    className="backup-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameBackup(b.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                ) : (
                  <span className="save-item-term">{b.name}</span>
                )}
                <span className="save-item-meta">
                  {b.courseCount} 门{formatTime(b.createdAt) ? ` · ${formatTime(b.createdAt)}` : ''}
                </span>
                {renamingId === b.id ? (
                  <button className="save-del backup-ok" title="确定" onClick={() => renameBackup(b.id)}>
                    ✓
                  </button>
                ) : (
                  <>
                    <button
                      className="save-del backup-rename"
                      title="更名"
                      onClick={() => {
                        setRenamingId(b.id);
                        setRenameValue(b.name);
                      }}
                    >
                      ✎
                    </button>
                    <button className="save-del" title="删除备份" onClick={() => deleteBackup(b.id)}>
                      ✕
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {creatingBackup ? (
            <div className="save-create">
              <input
                autoFocus
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createBackup();
                  if (e.key === 'Escape') setCreatingBackup(false);
                }}
                placeholder="备份名（留空自动命名）"
              />
              <button onClick={createBackup}>确定</button>
            </div>
          ) : (
            <button className="save-create-btn" onClick={() => setCreatingBackup(true)}>
              ＋ 新建备份
            </button>
          )}
        </div>
      </div>
    </PanelWindow>
  );
}
