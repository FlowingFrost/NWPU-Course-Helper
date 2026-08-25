import type { Category } from '../../shared/types';

// 界面通用文案常量（集中定义，避免在多个组件里重复）
export const DAY_SHORT = ['一', '二', '三', '四', '五', '六', '日'] as const;
export const DAY_FULL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

export const CATEGORY_LABEL: Record<Category, string> = {
  builtin: '内置',
  required: '必修',
  elective: '非必修',
};
