import { TOP_TABS, type PanelId, type TopTabId } from '../lib/nav';

const TOP_ICONS: Record<TopTabId, string> = { home: '🏠', goals: '🎯', selection: '✅', details: '📊' };
const TOP_LABELS: Record<TopTabId, string> = { home: '主页', goals: '目标', selection: '选课', details: '详情' };
const TOP_TITLES: Record<TopTabId, string> = { home: '主页', goals: '目标清单', selection: '选课情况', details: '课表详情' };

const BOTTOM: Array<{ id: 'saves' | 'settings'; icon: string; label: string }> = [
  { id: 'saves', icon: '💾', label: '存档' },
  { id: 'settings', icon: '⚙️', label: '设置' },
];

// 左侧图标栏：顶部三 tab（互斥，可 Alt 导航），底部存档/设置弹窗按钮（不可 Alt 导航）。
export default function Sidebar({
  activePanel,
  previewTab,
  onSelect,
}: {
  activePanel: PanelId;
  previewTab: TopTabId | null;
  onSelect: (id: PanelId) => void;
}) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand" title="选课助手">
        🎓
      </div>
      <div className="sidebar-group">
        {TOP_TABS.map((id) => {
          const active = previewTab !== null ? previewTab === id : activePanel === id;
          const alt = previewTab === id;
          return (
            <button
              key={id}
              className={`sidebar-btn ${active ? 'active' : ''}${alt ? ' alt' : ''}`}
              onClick={() => onSelect(id)}
              title={TOP_TITLES[id]}
            >
              <span className="s-icon">{TOP_ICONS[id]}</span>
              <span className="s-label">{TOP_LABELS[id]}</span>
            </button>
          );
        })}
      </div>
      <div className="sidebar-group bottom">
        {BOTTOM.map((b) => (
          <button
            key={b.id}
            className={`sidebar-btn ${activePanel === b.id ? 'active' : ''}`}
            onClick={() => onSelect(b.id)}
            title={b.label}
          >
            <span className="s-icon">{b.icon}</span>
            <span className="s-label">{b.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
