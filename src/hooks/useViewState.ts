import { useEffect, useState } from 'react';

const VIEW_MODE_KEY = 'course-helper:viewMode';

// 视图相关状态：单/双课表、叠加层、各类显示开关，含快捷键与视图模式记忆。
export function useViewState() {
  const [viewMode, setViewMode] = useState<'single' | 'double'>(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === 'double' ? 'double' : 'single';
    } catch {
      return 'single';
    }
  });
  const [overlayOn, setOverlayOn] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showElectives, setShowElectives] = useState(true);
  const [filterConflicts, setFilterConflicts] = useState(false);

  // 键盘快捷键：R 结果叠加层，D 单/双课表
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOverlayOn((o) => !o);
      if (e.key === 'd' || e.key === 'D') setViewMode((m) => (m === 'single' ? 'double' : 'single'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 记忆视图模式
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* 忽略 */
    }
  }, [viewMode]);

  return {
    viewMode,
    setViewMode,
    overlayOn,
    setOverlayOn,
    showInfo,
    setShowInfo,
    showEnrollment,
    setShowEnrollment,
    showElectives,
    setShowElectives,
    filterConflicts,
    setFilterConflicts,
  };
}
