import { useEffect, useState } from 'react';
import type { Schedule } from '../../shared/types';
import { applyWakeUpImport, parseWakeUp, importBounds } from '../lib/wakeup';

export interface ImportPrompt {
  text: string;
  bounds: { maxNode: number; maxWeek: number };
  nodesPerDay: number;
  totalWeeks: number;
}

// WakeUp 文件导入：解析、越界提示、确认（截断/拓宽）。
export function useWakeUpImport(schedule: Schedule | null, setAndSave: (s: Schedule) => void) {
  const [importPrompt, setImportPrompt] = useState<ImportPrompt | null>(null);

  // Esc 关闭越界提示
  useEffect(() => {
    if (!importPrompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImportPrompt(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importPrompt]);

  const onImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      try {
        const parsed = parseWakeUp(text);
        const bounds = importBounds(parsed.courses);
        if (!schedule) return;
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

  const confirmImport = (mode: 'truncate' | 'widen') => {
    if (!importPrompt || !schedule) return;
    setAndSave(applyWakeUpImport(schedule, importPrompt.text, mode));
    setImportPrompt(null);
  };

  const closeImport = () => setImportPrompt(null);

  return { importPrompt, onImport, confirmImport, closeImport };
}
