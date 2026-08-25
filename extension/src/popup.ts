import { loadSettings, type ExtResponse } from './messaging';

const statusEl = document.getElementById('status')!;
const baseEl = document.getElementById('base')!;
const syncEl = document.getElementById('sync')!;

function setStatus(ok: boolean, text: string) {
  statusEl.innerHTML = `<span class="dot ${ok ? 'ok' : 'err'}"></span>${text}`;
}

// 若当前标签页是「选课助手」网站（http + localhost/127.0.0.1 + 标题含“选课助手”），
// 自动把插件服务地址同步为该页面端口（端口被占用自动切换后，点一下图标即可对齐）。
async function syncPortFromActiveTab(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const url = new URL(tab.url);
    if (url.protocol !== 'http:') return null;
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
    if (!tab.title || !tab.title.includes('选课助手')) return null;
    const baseUrl = url.origin; // 例如 http://localhost:3002
    await chrome.storage.sync.set({ baseUrl });
    return baseUrl;
  } catch {
    return null;
  }
}

async function init() {
  // 1) 打开弹窗即触发检测：当前页是选课助手 → 同步端口
  const synced = await syncPortFromActiveTab();

  // 2) 读取（可能刚更新过的）服务地址
  const settings = await loadSettings();
  baseEl.textContent = settings.baseUrl;

  if (synced) {
    const port = new URL(synced).port || '80';
    syncEl.innerHTML = `<span class="dot ok"></span>已同步端口 ${port}`;
  } else {
    syncEl.innerHTML = `<span class="muted">当前不在选课助手页面</span>`;
  }

  // 3) 探测服务是否在线（用刚同步的地址）
  const resp: ExtResponse = await chrome.runtime.sendMessage({ type: 'PING' });
  if (resp.ok) setStatus(true, '在线');
  else setStatus(false, '未启动');
}

document.getElementById('open')!.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_APP' });
  window.close();
});

document.getElementById('options')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

init();
