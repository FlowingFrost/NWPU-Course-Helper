import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

// 通用弹窗：遮罩 + 标题栏（含关闭按钮）。portal=true 时挂到 body（用于顶栏等被裁剪的场景）。
export function Modal({
  title,
  onClose,
  className,
  portal,
  children,
}: {
  title: string;
  onClose: () => void;
  className?: string;
  portal?: boolean;
  children: ReactNode;
}) {
  const body = (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
  return portal ? createPortal(body, document.body) : body;
}
