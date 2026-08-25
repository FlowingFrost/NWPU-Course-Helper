import type { ReactNode } from 'react';

// 表单「标签 + 控件」通用布局（原 CoursePanel/SettingsPanel 各自定义，现已集中）
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
