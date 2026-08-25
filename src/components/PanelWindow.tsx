import { useEffect, type ReactNode } from 'react';

// 侧边栏弹窗「窗口」外壳：标题栏 + 关闭按钮 + 内容区，Escape 关闭，点击内部不冒泡到遮罩。
export function PanelWindow({
  title,
  onClose,
  className,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`panel-window ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="panel-window-head">
        <h3>{title}</h3>
        <button className="panel-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>
      <div className="panel-window-body">{children}</div>
    </div>
  );
}
