// 侧边栏导航模型：顶部四个 tab（互斥单选，Alt 可导航）+ 底部两个弹窗按钮（不可 Alt 导航）。
export type TopTabId = 'home' | 'goals' | 'selection' | 'details';
export type PanelId = TopTabId | 'saves' | 'settings';

export const TOP_TABS: TopTabId[] = ['home', 'goals', 'selection', 'details'];

// 侧边栏每个 tab 按钮的固定高度（px）：Alt 手势「位移量 1:1」的映射步长。
export const SIDEBAR_TAB_H = 56;
