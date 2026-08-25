import { DEFAULT_BASE_URL, loadSettings, type ExtSettings } from './messaging';

const baseUrlEl = document.getElementById('baseUrl') as HTMLInputElement;
const categoryEl = document.getElementById('category') as HTMLSelectElement;
const showUpdateResultEl = document.getElementById('showUpdateResult') as HTMLInputElement;
const pageLimitEl = document.getElementById('pageLimit') as HTMLInputElement;
const pageDelayEl = document.getElementById('pageDelay') as HTMLInputElement;
const savedEl = document.getElementById('saved')!;

async function init() {
  const s: ExtSettings = await loadSettings();
  baseUrlEl.value = s.baseUrl || DEFAULT_BASE_URL;
  categoryEl.value = s.defaultCategory;
  showUpdateResultEl.checked = s.showUpdateResult;
  pageLimitEl.value = String(s.updatePageLimit);
  pageDelayEl.value = String(s.updatePageDelay);
}

document.getElementById('save')!.addEventListener('click', async () => {
  const baseUrl = baseUrlEl.value.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
  const defaultCategory = categoryEl.value as ExtSettings['defaultCategory'];
  const showUpdateResult = showUpdateResultEl.checked;
  const updatePageLimit = Math.max(1, Math.min(20, Number(pageLimitEl.value) || 5));
  const updatePageDelay = Math.max(200, Math.min(5000, Number(pageDelayEl.value) || 500));
  await chrome.storage.sync.set({ baseUrl, defaultCategory, showUpdateResult, updatePageLimit, updatePageDelay });
  savedEl.textContent = '已保存 ✓';
  window.setTimeout(() => (savedEl.textContent = ''), 2000);
});

init();
