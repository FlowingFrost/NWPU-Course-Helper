import { useCallback, useEffect, useRef, useState } from 'react';
import type { Schedule } from '../../shared/types';

let saveTimer: number | undefined;

export function useSchedule() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<Schedule | null>(null);
  // 有本地未落盘的修改时置 true，轮询会跳过，避免覆盖用户正在编辑的内容
  const pendingRef = useRef(false);

  useEffect(() => {
    fetch('/api/schedule')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((s: Schedule) => {
        ref.current = s;
        setSchedule(s);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const debounceSave = useCallback((next: Schedule) => {
    pendingRef.current = true;
    setSaving(true);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      fetch('/api/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
        .then(() => {
          pendingRef.current = false;
          setSaving(false);
        })
        .catch((e) => {
          pendingRef.current = false;
          setSaving(false);
          setError(String(e));
        });
    }, 500);
  }, []);

  const setAndSave = useCallback(
    (next: Schedule) => {
      ref.current = next;
      setSchedule(next);
      debounceSave(next);
    },
    [debounceSave],
  );

  const update = useCallback(
    (fn: (s: Schedule) => Schedule) => {
      if (!ref.current) return;
      setAndSave(fn(structuredClone(ref.current)));
    },
    [setAndSave],
  );

  // 服务器端（AI/外部工具）已修改并保存后，仅同步本地状态，不重复写盘
  const replace = useCallback((next: Schedule) => {
    pendingRef.current = false;
    window.clearTimeout(saveTimer);
    ref.current = next;
    setSchedule(next);
  }, []);

  // 轮询：外部工具/AI 直接改当前存档文件后，前端自动同步
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped || pendingRef.current) return;
      try {
        const r = await fetch('/api/schedule');
        if (!r.ok) return;
        const s: Schedule = await r.json();
        if (ref.current && JSON.stringify(ref.current) === JSON.stringify(s)) return;
        ref.current = s;
        setSchedule(s);
      } catch {
        /* 忽略瞬时错误 */
      }
    };
    const id = window.setInterval(poll, 2000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  return { schedule, error, saving, update, setAndSave, replace };
}
