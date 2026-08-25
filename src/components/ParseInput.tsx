import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Schedule } from '../../shared/types';

// 顶栏右对齐的「粘贴文本 → 解析」输入框：点击自动放大，解析失败弹窗提示（挂到 body，全屏）
export default function ParseInput({ onSchedule }: { onSchedule: (s: Schedule) => void }) {
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parse = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: t }),
      });
      let d: any = null;
      try {
        d = await r.json();
      } catch {
        d = null;
      }
      if (!r.ok) {
        setErrorMsg(d?.error || `请求失败（HTTP ${r.status}）。后端可能未重启，请重启后再试。`);
        return;
      }
      if (!d || d.applied === 0) {
        setErrorMsg(d?.reply || '未识别到有效的课程内容或指令。');
        return;
      }
      if (d.schedule) onSchedule(d.schedule);
      setText('');
      setExpanded(false);
    } catch (e) {
      setErrorMsg('网络请求失败：' + String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="parse-input">
      <textarea
        className={`parse-textarea ${expanded ? 'expanded' : ''}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setExpanded(true)}
        onBlur={() => {
          if (!text.trim()) setExpanded(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            parse();
          }
        }}
        placeholder="粘贴课程文本 / 输入指令"
      />
      <button onClick={parse} disabled={busy} title="解析并录入">
        {busy ? '…' : '解析'}
      </button>

      {errorMsg &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setErrorMsg(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>解析失败</h3>
                <button className="modal-close" onClick={() => setErrorMsg(null)} aria-label="关闭">
                  ✕
                </button>
              </div>
              <p>{errorMsg}</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
