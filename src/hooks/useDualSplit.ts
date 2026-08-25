import { useEffect, useRef, useState } from 'react';

const RATIO_KEY = 'course-helper:dualRatio';

// 双课表分隔条拖拽：比例持久化 + 拖拽指针处理。
export function useDualSplit() {
  const [dualRatio, setDualRatio] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(RATIO_KEY));
      return Number.isFinite(v) && v >= 0.1 && v <= 0.9 ? v : 0.5;
    } catch {
      return 0.5;
    }
  });
  const [dragging, setDragging] = useState(false);
  const dualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(RATIO_KEY, String(dualRatio));
    } catch {
      /* 忽略 */
    }
  }, [dualRatio]);

  useEffect(() => {
    if (!dragging) return;
    const apply = (clientX: number) => {
      const el = dualRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      setDualRatio(Math.min(0.9, Math.max(0.1, ratio)));
    };
    const onMove = (e: PointerEvent) => apply(e.clientX);
    const onUp = () => setDragging(false);
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  const startDrag = (e: { clientX: number; preventDefault: () => void }) => {
    e.preventDefault();
    setDragging(true);
    const el = dualRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setDualRatio(Math.min(0.9, Math.max(0.1, ratio)));
    }
  };

  const resetDualRatio = () => setDualRatio(0.5);

  return { dualRatio, dragging, dualRef, startDrag, resetDualRatio };
}
