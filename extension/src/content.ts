import { extractCheckedLessonsFromDom, rowElementToRawLesson } from './domExtractor';
import { adaptJsonSearchResponse } from './jsonAdapter';
import { elTableRowToSelectionLesson, elTableRowToRawLesson, extractSelectedLessonsFromDom } from './selectionExtractor';
import type { RawLesson } from './model';
import type { Category, Schedule } from '../../shared/types';
import type { ExtMessage, ExtResponse } from './messaging';
import { loadSettings } from './messaging';
import { buildPreviewElement } from './preview';
import { buildEnrollmentReport, buildUpdateCommands, buildActualSelectionCommand, summarizeSelectedRefs, courseCodesOf, type UpdateReport } from './updateEnrollment';
import type { SelectedLessonRef } from './selectionExtractor';

// 全校开课查询接口所需的 assembleFields（与页面内联脚本一致）
const ASSEMBLE_FIELDS =
  'course.code,minorCourse.nameZh,courseType,openDepartment,teacherAssignmentList,examMode,campus,teachLang,roomType,timeTableLayout,crossBizTypes,courseProperty';

function isLessonSearch(): boolean {
  return /\/lesson-search/.test(location.pathname);
}

function isCourseSelection(): boolean {
  return /course-selection|course-select/.test(location.pathname);
}

function semesterId(): string | null {
  const el = document.querySelector<HTMLSelectElement>('#semester');
  const v = el?.value;
  return v ? String(v) : null;
}

// —— toast ——
let toastEl: HTMLDivElement | null = null;
function toast(text: string, isError = false) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.style.cssText =
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
      'max-width:70vw;padding:10px 16px;border-radius:8px;font:13px/1.6 sans-serif;' +
      'color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:opacity .3s;pointer-events:none;';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.style.background = isError ? '#dc2626' : '#16a34a';
  toastEl.style.opacity = '1';
  window.clearTimeout((toastEl as any).__t);
  (toastEl as any).__t = window.setTimeout(() => {
    if (toastEl) toastEl.style.opacity = '0';
  }, 4000);
}

async function send(msg: ExtMessage): Promise<ExtResponse> {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// 导入动作文案（与 src/lib/labels.ts 的 CATEGORY_LABEL「类别显示名」不同，此处是按钮动作名）
const IMPORT_ACTION_LABEL: Record<Category, string> = { elective: '加入候选', required: '加入必修', builtin: '导入已选课' };

async function importLessons(lessons: RawLesson[], category: Category) {
  if (!lessons.length) {
    toast('请先在结果表格里勾选课程（或已查询出结果）', true);
    return;
  }
  toast(`正在导入 ${lessons.length} 个教学班…`);
  // 是否开放选课：选课页面默认勾选(true)，全校开课查询默认不勾选(false)
  const selectable = isCourseSelection();
  const resp = await send({ type: 'IMPORT_LESSONS', lessons, category, selectable });
  if (resp.ok) {
    toast(`已${IMPORT_ACTION_LABEL[category]}：导入后共 ${resp.courseCount} 门课`);
  } else {
    toast(`导入失败：${resp.error || '未知错误'}（选课助手服务是否已启动？）`, true);
  }
}

// —— 静默查询（按课程代码，走结构化 JSON 接口）——
async function queryCourseByCode(code: string): Promise<RawLesson[]> {
  const sid = semesterId();
  if (!sid) return [];
  const url =
    `/student/for-std/lesson-search/semester/${sid}/search/308509` +
    `?courseCodeLike=${encodeURIComponent(code)}&assembleFields=${encodeURIComponent(ASSEMBLE_FIELDS)}`;
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) return [];
  return adaptJsonSearchResponse(await r.json());
}

async function silentQueryByCode(code: string) {
  try {
    toast('静默查询中…');
    const lessons = await queryCourseByCode(code);
    if (!lessons.length) {
      toast(`未查到课程代码 ${code} 的记录`, true);
      return;
    }
    await importLessons(lessons, 'elective');
  } catch (e) {
    toast('静默查询失败：' + String(e), true);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// —— 驱动选课系统「全部课程」页：自动填课程编号 → 查询 → 读结果 → 翻页 ——
function findButtonByText(text: string): HTMLButtonElement | null {
  for (const b of Array.from(document.querySelectorAll('button'))) {
    const el = b as HTMLElement;
    if (el.offsetParent === null && el.getBoundingClientRect().height === 0) continue; // 跳过隐藏 tab
    if ((b.textContent ?? '').includes(text)) return b;
  }
  return null;
}

function setVueInput(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function findVisibleInput(placeholder: string): HTMLInputElement | null {
  for (const el of Array.from(document.querySelectorAll(`input[placeholder="${placeholder}"]`))) {
    const inp = el as HTMLInputElement;
    if (inp.offsetParent === null && inp.getBoundingClientRect().height === 0) continue; // 跳过隐藏 tab
    return inp;
  }
  return null;
}

function waitFor(fn: () => boolean, timeout = 4000, interval = 150): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (fn()) return resolve(true);
      if (Date.now() - t0 > timeout) return resolve(false);
      setTimeout(tick, interval);
    };
    tick();
  });
}

// 只读当前可见（激活 tab）的 el-table 里的教学班
function visibleSelectionLessons(): RawLesson[] {
  const tables = Array.from(document.querySelectorAll('.el-table'));
  for (const t of tables) {
    const el = t as HTMLElement;
    if (el.offsetParent === null && el.getBoundingClientRect().height === 0) continue;
    const rows = Array.from(el.querySelectorAll('tr.el-table__row'));
    const lessons = rows.map((r) => elTableRowToRawLesson(r)).filter((l): l is RawLesson => l != null);
    if (lessons.length) return lessons;
  }
  return [];
}

// 在「全部课程」页按课程编号搜索，返回所有教学班（只翻过滤后的少数几页）
async function searchSelectionByCode(code: string, pageLimit: number, pageDelay: number): Promise<RawLesson[]> {
  const input = findVisibleInput('输入课程名称或代码查询');
  const queryBtn = findButtonByText('查询');
  if (!input || !queryBtn) return [];

  setVueInput(input, code);
  queryBtn.click();
  await waitFor(() => visibleSelectionLessons().length > 0, 4000);
  await sleep(300);

  const out: RawLesson[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < pageLimit; page++) {
    const pageLessons = visibleSelectionLessons();
    for (const l of pageLessons) {
      const key = l.lessonCode || `${l.courseCode}:${l.lessonName}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(l);
      }
    }
    const next = document.querySelector('a.el-icon-arrow-right') as HTMLElement | null;
    if (!next || next.offsetParent === null) break;
    const firstKey = pageLessons[0] ? pageLessons[0].lessonCode || pageLessons[0].courseName : null;
    next.click();
    await waitFor(() => visibleSelectionLessons().length > 0, 3000);
    await sleep(pageDelay);
    const newPage = visibleSelectionLessons();
    const newFirstKey = newPage[0] ? newPage[0].lessonCode || newPage[0].courseName : null;
    if (newFirstKey === firstKey) break; // 翻页后首行未变 → 最后一页
  }
  return out;
}

// 结果弹窗：列出全部更新明细 + 未查到的课程 + 未匹配的教学班 + 已选课程同步
function showSummaryModal(report: UpdateReport, selected?: { lessons: number; courses: number } | null) {
  document.querySelector('.ch-summary-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'ch-summary-modal';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText =
    'background:#fff;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);width:680px;max-width:92vw;max-height:82vh;display:flex;flex-direction:column;font:13px/1.5 sans-serif;color:#0f172a;';

  const head = document.createElement('div');
  head.style.cssText = 'padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;';
  const title = document.createElement('b');
  title.textContent = `更新结果（${report.updates.length} 个候选更新${report.selectableUpdates.length ? `，${report.selectableUpdates.length} 个开放选课变化` : ''}）`;
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'border:none;background:none;cursor:pointer;font-size:16px;color:#64748b;';
  close.onclick = () => overlay.remove();
  head.appendChild(title);
  head.appendChild(close);
  box.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'padding:12px 16px;overflow:auto;';

  const section = (label: string) => {
    const d = document.createElement('div');
    d.style.cssText = 'margin:4px 0 8px;font-weight:700;';
    d.textContent = label;
    return d;
  };

  // 更新明细
  body.appendChild(section('已更新'));
  if (report.updates.length) {
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;margin:0 0 12px;padding:0;';
    for (const u of report.updates) {
      const li = document.createElement('li');
      li.textContent = `${u.courseName}（${u.label}）：已选 ${u.oldEnrolled}→${u.enrolled}，容量 ${u.oldCapacity}→${u.capacity}`;
      li.style.cssText = 'padding:3px 0;border-bottom:1px solid #f1f5f9;';
      ul.appendChild(li);
    }
    body.appendChild(ul);
  } else {
    const p = document.createElement('div');
    p.textContent = '没有需要更新的候选（已选人数无变化）。';
    p.style.cssText = 'color:#64748b;margin-bottom:12px;';
    body.appendChild(p);
  }

  // 是否开放选课 变化
  if (report.selectableUpdates.length) {
    body.appendChild(section(`是否开放选课（${report.selectableUpdates.length} 个变化）`));
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;margin:0 0 12px;padding:0;color:#1d4ed8;';
    for (const s of report.selectableUpdates) {
      const li = document.createElement('li');
      li.textContent = `${s.courseName}（${s.label}）：${s.oldSelectable ? '开放' : '不开放'}→${s.selectable ? '开放' : '不开放'}`;
      li.style.cssText = 'padding:3px 0;border-bottom:1px solid #f1f5f9;';
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  // 已选课程同步
  if (selected) {
    body.appendChild(section('已选课程同步'));
    const p = document.createElement('div');
    p.textContent = `已同步教务「已选课程」：${selected.courses} 门课程 / ${selected.lessons} 个教学班（用于前端「选课情况」校验是否完成选课）。`;
    p.style.cssText = 'color:#16a34a;margin-bottom:12px;';
    body.appendChild(p);
  }

  // 未查到的课程
  if (report.notFoundCourses.length) {
    body.appendChild(section(`未查到课程（${report.notFoundCourses.length}）`));
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;margin:0 0 12px;padding:0;color:#dc2626;';
    for (const c of report.notFoundCourses) {
      const li = document.createElement('li');
      li.textContent = c.code ? `${c.name}（${c.code}）` : c.name;
      li.style.cssText = 'padding:3px 0;border-bottom:1px solid #f1f5f9;';
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  // 未匹配的教学班编号（同一课程分组，课程名只出现一次）
  if (report.notFoundOptions.length) {
    const total = report.notFoundOptions.reduce((n, g) => n + g.labels.length, 0);
    body.appendChild(section(`未匹配教学班编号（${total} 个）`));
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;margin:0 0 12px;padding:0;color:#b45309;';
    for (const g of report.notFoundOptions) {
      const li = document.createElement('li');
      li.textContent = `${g.courseName}：${g.labels.join('、')}`;
      li.style.cssText = 'padding:3px 0;border-bottom:1px solid #f1f5f9;';
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  box.appendChild(body);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// 切换到「已选课程」tab（选课 SPA 主 tab，id 固定为 #tab-selectedLesson）
async function ensureSelectedLessonTab(): Promise<boolean> {
  const tab = document.getElementById('tab-selectedLesson') as HTMLElement | null;
  if (!tab) return false;
  if (tab.classList.contains('is-active')) return true;
  tab.click();
  await waitFor(() => tab.classList.contains('is-active'), 2000);
  return tab.classList.contains('is-active');
}

// 收集教务「已选课程」tab 里实际已完成选课的教学班编号。
// 返回 null 表示该页面没有「已选课程」tab（无法收集），调用方应跳过同步。
async function collectSelectedLessons(): Promise<SelectedLessonRef[] | null> {
  if (!(await ensureSelectedLessonTab())) return null;
  await sleep(300);
  return extractSelectedLessonsFromDom(document);
}

// 批量更新已选课程：驱动选课系统按存档课程编号逐门搜索回填已选人数/容量，
// 再切到「已选课程」tab 收集实际选课结果回写存档（供前端「选课情况」校验）。
async function updateEnrollments() {
  const schedule = await getSchedule();
  if (!schedule) {
    toast('无法获取选课助手存档（服务是否已启动？）', true);
    return;
  }
  const settings = await loadSettings();
  const codes = courseCodesOf(schedule);
  if (!codes.length) {
    toast('存档里没有带课程编号的课程', true);
    return;
  }

  toast(`开始更新已选课程（共 ${codes.length} 门课）…`);
  const lessons: RawLesson[] = [];
  for (let i = 0; i < codes.length; i++) {
    try {
      const batch = await searchSelectionByCode(codes[i], settings.updatePageLimit, settings.updatePageDelay);
      if (batch.length) lessons.push(...batch);
    } catch {
      /* 单门查询失败则跳过 */
    }
    toast(`更新进度 ${i + 1}/${codes.length}…`);
    await sleep(settings.updatePageDelay);
  }

  const report = buildEnrollmentReport(schedule, lessons);
  const commands = buildUpdateCommands(schedule, lessons);

  // 新增：切到「已选课程」tab，收集实际已完成选课的课程/教学班编号，回写存档供前端「选课情况」校验
  const selectedRefs = await collectSelectedLessons();
  const selected = selectedRefs ? summarizeSelectedRefs(selectedRefs) : null;
  if (selectedRefs) commands.push(buildActualSelectionCommand(selectedRefs));

  if (commands.length) {
    const resp = await send({ type: 'APPLY_COMMANDS', commands });
    if (!resp.ok) {
      toast('更新失败：' + (resp.error || '未知'), true);
      return;
    }
  }

  if (settings.showUpdateResult) showSummaryModal(report, selected);
  else {
    toast(
      `更新完成：${report.updates.length} 个候选更新` +
        (selected ? `，同步已选 ${selected.courses} 门` : '') +
        (report.notFoundCourses.length ? `，${report.notFoundCourses.length} 门课未查到` : ''),
    );
  }
}

// —— 预览：悬停时拉取存档并弹迷你课表 ——
let scheduleCache: Schedule | null = null;
let scheduleCacheAt = 0;
let previewPop: HTMLElement | null = null;
let previewTimer: number | undefined;
let previewSeq = 0;

async function getSchedule(): Promise<Schedule | null> {
  if (scheduleCache && Date.now() - scheduleCacheAt < 5000) return scheduleCache;
  const resp = await send({ type: 'GET_SCHEDULE' });
  if (resp.ok && resp.schedule) {
    scheduleCache = resp.schedule;
    scheduleCacheAt = Date.now();
    return resp.schedule;
  }
  return null;
}

function hidePreviewNow() {
  if (previewPop) {
    previewPop.remove();
    previewPop = null;
  }
}

// 延迟关闭：给鼠标从按钮移到弹层留出时间；进入弹层会取消
function scheduleHide() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(hidePreviewNow, 250);
}

async function showPreview(btn: HTMLElement, lesson: RawLesson) {
  const seq = ++previewSeq;
  window.clearTimeout(previewTimer);
  const schedule = await getSchedule();
  if (seq !== previewSeq) return; // 期间又发生新的悬停/离开，放弃本次
  if (!schedule) {
    toast('无法获取选课助手存档（服务是否已启动？）', true);
    return;
  }
  hidePreviewNow();
  const el = buildPreviewElement(schedule, lesson);
  el.style.position = 'fixed';
  el.style.zIndex = '2147483646';
  // 鼠标停在弹层上时维持预览，移出才关闭
  el.addEventListener('mouseenter', () => window.clearTimeout(previewTimer));
  el.addEventListener('mouseleave', scheduleHide);
  document.body.appendChild(el);

  const rect = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 以按钮右边距为起点，避免挡住按钮本身与下方同列的预览按钮
  let left = rect.right + 6;
  let top = rect.bottom + 6;
  // 防溢出：右侧放不下则放到按钮左侧
  if (left + el.offsetWidth > vw - 8) left = Math.max(8, rect.left - el.offsetWidth - 6);
  if (top + el.offsetHeight > vh - 8) top = Math.max(8, rect.top - el.offsetHeight - 6);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  previewPop = el;
}

// —— 工具条控件：放在「已选N条」右侧 ——
function injectToolbarControls() {
  if (document.querySelector('.ch-toolbar-controls')) return;
  const anchor = document.querySelector('.selected-items');
  if (!anchor) return;

  // 工具栏是 float 布局，我的控件会被挤到末尾；改成 flex 才能「控件贴已选0条、页码靠最右」
  const toolbar = anchor.closest('.btn-toolbar') as HTMLElement | null;
  if (toolbar) {
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.flexWrap = 'nowrap';
    toolbar.style.width = '100%';
    // 翻页 .btn-group 内部按钮是 float:left；变成 flex 子项后其宽度会塌陷、按钮竖排，
    // 这里显式改回 flex 行，让按钮保持水平并排
    Array.from(toolbar.children).forEach((child) => {
      if (child.classList.contains('btn-group')) {
        (child as HTMLElement).style.display = 'flex';
        (child as HTMLElement).style.alignItems = 'center';
      }
    });
  }

  const wrap = document.createElement('span');
  wrap.className = 'ch-toolbar-controls';
  wrap.style.cssText =
    'display:inline-flex;gap:6px;align-items:center;margin-left:10px;flex:0 0 auto;font:13px sans-serif;color:#0f172a;';

  const sel = document.createElement('select');
  sel.style.cssText = 'padding:3px 4px;border:1px solid #cbd5e1;border-radius:5px;font:inherit;background:#fff;';
  for (const [val, label] of [
    ['elective', '非必修'],
    ['required', '必修'],
    ['builtin', '内置'],
  ] as const) {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = label;
    sel.appendChild(o);
  }

  const importBtn = document.createElement('button');
  importBtn.textContent = '导入选中';
  importBtn.style.cssText =
    'padding:3px 10px;border-radius:5px;border:1px solid #2563eb;background:#2563eb;color:#fff;cursor:pointer;font:inherit;';
  importBtn.addEventListener('click', () => {
    importLessons(extractCheckedLessonsFromDom(document), sel.value as Category);
  });

  const input = document.createElement('input');
  input.placeholder = '课程代码';
  input.style.cssText = 'width:110px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:5px;font:inherit;';
  const queryBtn = document.createElement('button');
  queryBtn.textContent = '静默查询';
  queryBtn.style.cssText =
    'padding:3px 8px;border-radius:5px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;cursor:pointer;font:inherit;';
  queryBtn.addEventListener('click', () => {
    const c = input.value.trim();
    if (!c) toast('请输入课程代码', true);
    else silentQueryByCode(c);
  });

  wrap.appendChild(sel);
  wrap.appendChild(importBtn);
  wrap.appendChild(input);
  wrap.appendChild(queryBtn);

  anchor.insertAdjacentElement('afterend', wrap);

  // 把紧随其后的「页码/翻页/页大小设置」组推到最右
  const pager = wrap.nextElementSibling as HTMLElement | null;
  if (pager) pager.style.marginLeft = 'auto';
}

// —— 每行按钮：课程名右侧「加入候选」「预览」——
function smallBtn(text: string, title: string, primary: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.title = title;
  b.style.cssText =
    'margin-left:4px;padding:1px 7px;border-radius:4px;font:12px/1.4 sans-serif;cursor:pointer;vertical-align:middle;' +
    (primary
      ? 'border:1px solid #2563eb;background:#2563eb;color:#fff;'
      : 'border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;');
  return b;
}

// 在课程名锚点右侧挂「加入候选/导入已选课 + 预览」按钮（两种页面共用）。
// resolve 在点击/悬停时才从当前 DOM 行实时提取，避免 Vue/DataTables 复用行节点后按钮拿到旧课程数据。
function attachRowActions(
  anchor: HTMLElement,
  resolve: () => { lesson: RawLesson; category: Category } | null,
  label: string,
) {
  // 把标题行改成 flex：课程名可收缩省略，按钮固定右侧（否则块级元素会换行到下一行）
  anchor.style.display = 'flex';
  anchor.style.alignItems = 'center';
  anchor.style.gap = '4px';
  const link = anchor.querySelector('a') as HTMLElement | null;
  if (link) {
    link.style.flex = '1 1 auto';
    link.style.minWidth = '0';
    link.style.overflow = 'hidden';
    link.style.textOverflow = 'ellipsis';
    link.style.whiteSpace = 'nowrap';
  }

  const wrap = document.createElement('span');
  wrap.className = 'ch-row-actions';
  wrap.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;';

  const joinBtn = smallBtn(label, '将该教学班加入选课助手', true);
  joinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const r = resolve();
    if (r) importLessons([r.lesson], r.category);
    else toast('无法读取该课程数据', true);
  });

  const previewBtn = smallBtn('预览', '悬停查看该课程在课表中的位置', false);
  previewBtn.addEventListener('mouseenter', (e) => {
    e.stopPropagation();
    const r = resolve();
    if (r) showPreview(previewBtn, r.lesson);
  });
  previewBtn.addEventListener('mouseleave', scheduleHide);
  previewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const r = resolve();
    if (r) showPreview(previewBtn, r.lesson);
  });

  wrap.appendChild(joinBtn);
  wrap.appendChild(previewBtn);
  anchor.appendChild(wrap);
}

function injectRowButtons(row: Element) {
  if (row.querySelector('.ch-row-actions')) return;
  const anchor = row.querySelector('.course-name') as HTMLElement | null;
  if (!anchor) return;
  if (!rowElementToRawLesson(row)) return;
  attachRowActions(
    anchor,
    () => {
      const lesson = rowElementToRawLesson(row);
      return lesson ? { lesson, category: 'elective' as Category } : null;
    },
    '加入候选',
  );
}

function injectAllRowButtons() {
  document.querySelectorAll('tbody tr[role="row"]').forEach(injectRowButtons);
}

// 选课 SPA：已选课程 → 导入已选课（内置）；待选课 → 加入候选（非必修）
function injectSelectionRowButtons(row: Element) {
  if (row.querySelector('.ch-row-actions')) return;
  const anchor = row.querySelector('.course-name') as HTMLElement | null;
  if (!anchor) return;
  const first = elTableRowToSelectionLesson(row);
  if (!first) return;
  const label = first.status.includes('已选') ? '导入已选课' : '加入候选';
  attachRowActions(
    anchor,
    () => {
      const sel = elTableRowToSelectionLesson(row);
      if (!sel) return null;
      const isSelected = sel.status.includes('已选');
      return { lesson: sel.lesson, category: (isSelected ? 'builtin' : 'elective') as Category };
    },
    label,
  );
}

function injectAllSelectionRowButtons() {
  document.querySelectorAll('tr.el-table__row').forEach(injectSelectionRowButtons);
}

// 确保当前在「全部课程」标签页（必要时点一次 #tab-allLesson）
async function ensureAllLessonTab(): Promise<boolean> {
  const tab = document.getElementById('tab-allLesson') as HTMLElement | null;
  if (!tab) return true;
  if (tab.classList.contains('is-active')) return true;
  tab.click();
  await waitFor(() => tab.classList.contains('is-active'), 2000);
  return tab.classList.contains('is-active');
}

// 让 tab 导航整条包裹层（header / nav-wrap / nav-scroll）「穿透」：
// 空区域不拦截点击（避免盖住头部按钮），但 tab 项本身仍可点
function fixTabOverlay() {
  const wrappers = document.querySelectorAll('.el-tabs__header, .el-tabs__nav-wrap, .el-tabs__nav-scroll');
  for (const w of Array.from(wrappers)) {
    (w as HTMLElement).style.pointerEvents = 'none';
  }
  for (const item of Array.from(document.querySelectorAll('.el-tabs__item'))) {
    (item as HTMLElement).style.pointerEvents = 'auto';
  }
}

// 在「我的选课状态」按钮左侧加「更新已选课程」按钮
function injectSelectionUpdateButton() {
  if (document.querySelector('.ch-update-btn')) return;
  const statusBtn = findButtonByText('我的选课状态');
  if (!statusBtn) return;

  const btn = document.createElement('button');
  btn.className = 'ch-update-btn';
  btn.type = 'button';
  btn.textContent = '更新已选课程';
  btn.title = '先切到「全部课程」逐门查询回填已选人数/容量，再切到「已选课程」同步实际选课结果（用于前端「选课情况」校验）';
  btn.style.cssText =
    'margin-right:8px;padding:7px 15px;border-radius:4px;' +
    'border:1px solid #16a34a;background:#f0fdf4;color:#166534;cursor:pointer;font:12px sans-serif;line-height:1;';
  btn.addEventListener('click', async () => {
    await ensureAllLessonTab();
    await updateEnrollments();
  });
  statusBtn.insertAdjacentElement('beforebegin', btn);
}

// —— 入口 ——
if (isLessonSearch()) {
  const start = () => {
    if (!document.body) {
      window.setTimeout(start, 200);
      return;
    }
    injectToolbarControls();
    injectAllRowButtons();

    // 结果表格由 DataTables 异步渲染/翻页重绘，观察并补注按钮
    const observer = new MutationObserver(() => {
      injectToolbarControls();
      injectAllRowButtons();
    });
    const target = document.querySelector('tbody') ?? document.body;
    observer.observe(target, { childList: true, subtree: true });
  };
  start();
} else if (isCourseSelection()) {
  const start = () => {
    if (!document.body) {
      window.setTimeout(start, 200);
      return;
    }
    fixTabOverlay();
    injectSelectionUpdateButton();
    injectAllSelectionRowButtons();

    // Vue SPA 切换标签页/分页会重绘表格，观察并补注按钮
    const observer = new MutationObserver(() => {
      fixTabOverlay();
      injectSelectionUpdateButton();
      injectAllSelectionRowButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  start();
}
