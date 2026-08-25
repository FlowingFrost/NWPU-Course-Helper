import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import type { Schedule, Settings, NodeTime } from '../shared/types';
import type { Command } from '../shared/commands';
import { applyCommands } from '../shared/commands';
import { parseCommands } from '../shared/parser';

// 基础目录：pkg 打包成 exe 时用 exe 所在目录（可写、可放 dist）；开发时用当前工作目录（项目根）
const IS_PKG = typeof (process as any).pkg !== 'undefined';
const BASE = IS_PKG ? path.dirname(process.execPath) : process.cwd();
const DATA_DIR = path.join(BASE, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const SAVES_DIR = path.join(DATA_DIR, 'saves');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const DEFAULT_PORT = 3001;

// 默认节次时间表（西北工业大学）
const DEFAULT_NODE_TIMES: NodeTime[] = [
  { node: 1, start: '08:30', end: '09:15' },
  { node: 2, start: '09:25', end: '10:10' },
  { node: 3, start: '10:30', end: '11:15' },
  { node: 4, start: '11:25', end: '12:10' },
  { node: 5, start: '12:20', end: '13:05' },
  { node: 6, start: '13:05', end: '13:50' },
  { node: 7, start: '14:00', end: '14:45' },
  { node: 8, start: '14:55', end: '15:50' },
  { node: 9, start: '16:00', end: '16:45' },
  { node: 10, start: '16:55', end: '17:40' },
  { node: 11, start: '19:00', end: '19:45' },
  { node: 12, start: '19:55', end: '20:40' },
  { node: 13, start: '20:40', end: '21:25' },
];

function defaultSchedule(): Schedule {
  return {
    meta: {
      school: '西北工业大学',
      term: '大二下',
      startDate: '2026-03-02',
      daysPerWeek: 7,
      nodesPerDay: 13,
      totalWeeks: 16,
      creditCap: 30,
      willingBudget: 150,
    },
    nodeTimes: DEFAULT_NODE_TIMES,
    teacherRatings: [],
    courses: [],
  };
}

function defaultSettings(): Settings {
  return {
    currentSaveId: 'default',
  };
}

function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function atomicWrite(p: string, data: unknown, backup: boolean) {
  if (backup && fs.existsSync(p)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(p, path.join(BACKUP_DIR, `${path.basename(p)}.${stamp}`));
  }
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

function savePath(id: string): string {
  return path.join(SAVES_DIR, `${id}.json`);
}

function readSettings(): Settings {
  return readJson(SETTINGS_PATH, defaultSettings());
}

function currentSaveId(settings: Settings): string {
  const id = settings.currentSaveId;
  if (id && fs.existsSync(savePath(id))) return id;
  return 'default';
}

function readSchedule(): Schedule {
  return readJson(savePath(currentSaveId(readSettings())), defaultSchedule());
}

function writeSchedule(s: Schedule) {
  atomicWrite(savePath(currentSaveId(readSettings())), s, true);
}

function listSaves(): Array<{ id: string; term: string; school: string; courseCount: number; updatedAt: number }> {
  if (!fs.existsSync(SAVES_DIR)) return [];
  return fs
    .readdirSync(SAVES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = f.slice(0, -'.json'.length);
      const p = savePath(id);
      const s = readJson<Schedule>(p, defaultSchedule());
      let updatedAt = 0;
      try {
        updatedAt = fs.statSync(p).mtimeMs;
      } catch {
        /* 忽略 */
      }
      return { id, term: s.meta?.term || id, school: s.meta?.school || '', courseCount: s.courses?.length ?? 0, updatedAt };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(SAVES_DIR, { recursive: true });

  const hasSaves = () => fs.readdirSync(SAVES_DIR).filter((f) => f.endsWith('.json')).length > 0;

  // 迁移：旧版单存档 data/schedule.json → data/saves/default.json
  const legacy = path.join(DATA_DIR, 'schedule.json');
  if (fs.existsSync(legacy) && !hasSaves()) {
    fs.renameSync(legacy, savePath('default'));
  }
  if (!hasSaves()) {
    fs.writeFileSync(savePath('default'), JSON.stringify(defaultSchedule(), null, 2), 'utf-8');
  }
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaultSettings(), null, 2), 'utf-8');
  }

  // 确保 currentSaveId 指向存在的存档
  const settings = readSettings();
  if (!settings.currentSaveId || !fs.existsSync(savePath(settings.currentSaveId))) {
    settings.currentSaveId = 'default';
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

ensureDataDir();

app.get('/api/schedule', (_req, res) => {
  res.json(readSchedule());
});

app.put('/api/schedule', (req, res) => {
  try {
    writeSchedule(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/api/settings', (_req, res) => {
  res.json(readSettings());
});

app.put('/api/settings', (req, res) => {
  try {
    atomicWrite(SETTINGS_PATH, req.body, false);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// —— 多存档 ——
app.get('/api/saves', (_req, res) => {
  res.json({ saves: listSaves(), currentId: currentSaveId(readSettings()) });
});

app.post('/api/saves', (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim() || `存档 ${listSaves().length + 1}`;
    const id = `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const sched = defaultSchedule();
    sched.meta.term = name;
    atomicWrite(savePath(id), sched, false);
    const settings = readSettings();
    settings.currentSaveId = id;
    atomicWrite(SETTINGS_PATH, settings, false);
    res.json({ ok: true, id, schedule: sched, saves: listSaves(), currentId: id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/saves/:id/switch', (req, res) => {
  try {
    const id = req.params.id;
    if (!fs.existsSync(savePath(id))) return res.status(404).json({ ok: false, error: '存档不存在' });
    const settings = readSettings();
    settings.currentSaveId = id;
    atomicWrite(SETTINGS_PATH, settings, false);
    res.json({ ok: true, schedule: readSchedule(), currentId: id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.delete('/api/saves/:id', (req, res) => {
  try {
    const id = req.params.id;
    if (listSaves().length <= 1) return res.status(400).json({ ok: false, error: '至少保留一个存档' });
    if (!fs.existsSync(savePath(id))) return res.status(404).json({ ok: false, error: '存档不存在' });
    fs.unlinkSync(savePath(id));
    const settings = readSettings();
    if (settings.currentSaveId === id) {
      settings.currentSaveId = listSaves()[0]?.id ?? 'default';
      atomicWrite(SETTINGS_PATH, settings, false);
    }
    res.json({ ok: true, schedule: readSchedule(), saves: listSaves(), currentId: currentSaveId(readSettings()) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// 结构化命令入口（AI 与外部工具共用，作用于当前存档）
app.post('/api/command', (req, res) => {
  try {
    const schedule = readSchedule();
    const body = req.body ?? {};
    const cmds: Command[] = Array.isArray(body) ? body : Array.isArray(body.commands) ? body.commands : [body];
    const next = applyCommands(schedule, cmds);
    if (cmds.length) writeSchedule(next);
    res.json({ ok: true, applied: cmds.length, schedule: next });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

// 解析入口（确定性规则解析器 → 命令 → 应用）
app.post('/api/parse', (req, res) => {
  try {
    const schedule = readSchedule();
    const message = String(req.body?.message ?? '').trim();
    if (!message) return res.status(400).json({ ok: false, error: '内容为空' });

    const commands = parseCommands(schedule, message);
    const next = applyCommands(schedule, commands);
    if (commands.length) writeSchedule(next);

    const reply = commands.length ? `已识别 ${commands.length} 条并应用。` : '未识别到有效的课程内容或指令。';
    res.json({ ok: true, applied: commands.length, reply, commands, schedule: next });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// 生产环境托管 dist（构建后由 npm start 提供）
const dist = path.join(BASE, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
}

// —— 端口自动选择与记忆 ——
// 端口被占用时自动向后顺延，并把成功端口写入 settings，下次启动沿用，
// 减少用户反复修改插件「服务地址」的次数。
function preferredPort(): number {
  const env = Number(process.env.PORT);
  if (env && Number.isInteger(env)) return env;
  const saved = readSettings().port;
  if (saved && Number.isInteger(saved)) return saved;
  return DEFAULT_PORT;
}

function persistPort(port: number) {
  try {
    const settings = readSettings();
    if (settings.port !== port) {
      settings.port = port;
      atomicWrite(SETTINGS_PATH, settings, false);
    }
  } catch {
    /* 忽略：记不住端口不影响本次运行 */
  }
}

function startServer(port: number, attemptsLeft: number) {
  const server = app.listen(port, () => {
    console.log(`[course-helper] API 已启动：http://localhost:${port}`);
    console.log('（保持本窗口开启；关闭窗口即停止服务）');
    persistPort(port);
  });
  server.on('error', (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`[course-helper] 端口 ${port} 已被占用，自动改用 ${port + 1} …`);
      startServer(port + 1, attemptsLeft - 1);
    } else {
      console.error('\n[course-helper] 启动失败：' +
        (code === 'EADDRINUSE'
          ? `端口 ${port} 及其后若干端口均被占用，请释放端口后重试。`
          : ((err as Error).message || String(err))));
      console.error('关闭本窗口即可退出。');
      setInterval(() => {}, 1 << 30); // 保持窗口，便于阅读错误信息
    }
  });
}

startServer(preferredPort(), 20);
