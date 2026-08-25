import { lessonsToCourses, buildAddCourseCommands } from './model';
import { loadSettings, type ExtMessage, type ExtResponse } from './messaging';

// 后台 service worker：负责「localhost 侧」的请求（规避 CORS / 混合内容）。
// 教务系统侧的请求在 content script 里同源发起（自动带会话），不经过这里。
chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // 保持通道用于异步响应
});

async function handle(msg: ExtMessage): Promise<ExtResponse> {
  const settings = await loadSettings();

  switch (msg.type) {
    case 'GET_SCHEDULE': {
      try {
        const r = await fetch(`${settings.baseUrl}/api/schedule`);
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
        const schedule = await r.json();
        return { ok: true, schedule };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    case 'PING': {
      try {
        const r = await fetch(`${settings.baseUrl}/api/schedule`);
        return { ok: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    case 'OPEN_APP': {
      await chrome.tabs.create({ url: settings.baseUrl });
      return { ok: true };
    }

    case 'IMPORT_LESSONS': {
      const courses = lessonsToCourses(msg.lessons, msg.category, msg.selectable);
      if (!courses.length) return { ok: false, error: '未解析到课程' };
      const commands = buildAddCourseCommands(courses);

      const r = await fetch(`${settings.baseUrl}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
      });
      const data: any = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) return { ok: false, error: data.error || `HTTP ${r.status}` };
      return { ok: true, applied: data.applied, courseCount: data.schedule?.courses?.length };
    }

    case 'IMPORT_RAW_TEXT': {
      const r = await fetch(`${settings.baseUrl}/api/parse`, {
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
      const r = await fetch(`${settings.baseUrl}/api/command`, {
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
