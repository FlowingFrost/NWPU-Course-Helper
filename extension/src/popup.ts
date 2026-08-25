import { loadSettings, type ExtResponse } from './messaging';

const statusEl = document.getElementById('status')!;
const baseEl = document.getElementById('base')!;

function setStatus(ok: boolean, text: string) {
  statusEl.innerHTML = `<span class="dot ${ok ? 'ok' : 'err'}"></span>${text}`;
}

async function init() {
  const settings = await loadSettings();
  baseEl.textContent = settings.baseUrl;

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
