import { lessonsToCourses, buildAddCourseCommands } from './model';
import { loadSettings, DEFAULT_BASE_URL, type ExtMessage, type ExtResponse } from './messaging';

// 后台 service worker：负责「localhost 侧」的请求（规避 CORS / 混合内容）。
// 教务系统侧的请求在 content script 里同源发起（自动带会话），不经过这里。
chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // 保持通道用于异步响应
});

// 后端端口被占用时会从 3001 起自动顺延（最多 +20），这里覆盖 3001..3030。
const DISCOVERY_PORTS: number[] = Array.from({ length: 30 }, (_, i) => 3001 + i);

async function pingBaseUrl(baseUrl: string): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl}/api/schedule`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

let cachedBaseUrl: string | null = null;

// 解析后端地址：优先用配置/上次缓存的地址；失败则并发探测 3001..3030 找到实际端口，
// 并把找到的地址写回 chrome.storage（这样插件弹窗也会显示正确地址）。
async function resolveBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;

  const settings = await loadSettings();
  const configured = settings.baseUrl || DEFAULT_BASE_URL;
  if (await pingBaseUrl(configured)) {
    cachedBaseUrl = configured;
    return configured;
  }

  const results = await Promise.all(
    DISCOVERY_PORTS.map(async (port) => {
      const url = `http://localhost:${port}`;
      if (url === configured) return null;
      return (await pingBaseUrl(url)) ? url : null;
    }),
  );
  const found = results.find((u): u is string => u != null);
  if (found) {
    cachedBaseUrl = found;
    await chrome.storage.sync.set({ baseUrl: found }).catch(() => {});
    return found;
  }

  cachedBaseUrl = configured;
  return configured;
}

async function handle(msg: ExtMessage): Promise<ExtResponse> {
  const baseUrl = await resolveBaseUrl();

  switch (msg.type) {
    case 'GET_SCHEDULE': {
      try {
        const r = await fetch(`${baseUrl}/api/schedule`);
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
        const schedule = await r.json();
        return { ok: true, schedule };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    case 'PING': {
      try {
        const r = await fetch(`${baseUrl}/api/schedule`);
        return { ok: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    case 'OPEN_APP': {
      await chrome.tabs.create({ url: baseUrl });
      return { ok: true };
    }

    case 'IMPORT_LESSONS': {
      const courses = lessonsToCourses(msg.lessons, msg.category, msg.selectable);
      if (!courses.length) return { ok: false, error: '未解析到课程' };
      const commands = buildAddCourseCommands(courses);

      const r = await fetch(`${baseUrl}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
      });
      const data: any = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) return { ok: false, error: data.error || `HTTP ${r.status}` };
      return { ok: true, applied: data.applied, courseCount: data.schedule?.courses?.length };
    }

    case 'IMPORT_RAW_TEXT': {
      const r = await fetch(`${baseUrl}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg.text }),
      });
      const data: any = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) return { ok: false, error: data.error || data.reply || `HTTP ${r.status}` };
      return { ok: true, applied: data.applied };
    }

    case 'APPLY_COMMANDS': {
      if (!msg.commands.length) return { ok: true, applied: 0 };
      const r = await fetch(`${baseUrl}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg.commands),
      });
      const data: any = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) return { ok: false, error: data.error || `HTTP ${r.status}` };
      return { ok: true, applied: data.applied, courseCount: data.schedule?.courses?.length };
    }

    default:
      return { ok: false, error: '未知消息类型' };
  }
}
