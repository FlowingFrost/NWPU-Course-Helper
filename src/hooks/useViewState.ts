import { useEffect, useState } from 'react';
import type { Meta } from '../../shared/types';

// 视图状态：单/双课表、叠加层、各类显示开关。
// 显示偏好（单/双、显示课程信息、显示已选人数/容量、显示非必修、过滤冲突）持久化到 meta，
// 插件预览小课表通过 GET /api/schedule 读取同一份 meta，复用相同的显示规则。
export function useViewState(meta: Meta | undefined, patchMeta: (patch: Partial<Meta>) => void) {
  // 结果叠加层是瞬时状态，不持久化
  const [overlayOn, setOverlayOn] = useState(false);

  const viewMode: 'single' | 'double' = meta?.viewMode ?? 'single';
  const showEnrollment = meta?.showEnrollment ?? false;
  const showElectives = meta?.showElectives ?? true;
  const filterConflicts = meta?.filterConflicts ?? false;
  const hideSelectedCandidates = meta?.hideSelectedCandidates ?? true;

  const setViewMode = (m: 'single' | 'double' | ((cur: 'single' | 'double') => 'single' | 'double')) => {
    patchMeta({ viewMode: typeof m === 'function' ? m(viewMode) : m });
  };
  const setShowEnrollment = (v: boolean) => patchMeta({ showEnrollment: v });
  const setShowElectives = (v: boolean) => patchMeta({ showElectives: v });
  const setFilterConflicts = (v: boolean) => patchMeta({ filterConflicts: v });
  const setHideSelectedCandidates = (v: boolean) => patchMeta({ hideSelectedCandidates: v });

  // 键盘快捷键：R 结果叠加层，D 单/双课表
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOverlayOn((o) => !o);
      if (e.key === 'd' || e.key === 'D') setViewMode((m) => (m === 'single' ? 'double' : 'single'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  return {
    viewMode,
    setViewMode,
    overlayOn,
    setOverlayOn,
    showEnrollment,
    setShowEnrollment,
    showElectives,
    setShowElectives,
    filterConflicts,
    setFilterConflicts,
    hideSelectedCandidates,
    setHideSelectedCandidates,
  };
}
