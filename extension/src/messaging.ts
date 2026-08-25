import type { Category, Schedule } from '../../shared/types';
import type { Command } from '../../shared/commands';
import type { RawLesson } from './model';

// content script / popup ↔ background 的消息协议
export type ExtMessage =
  | { type: 'IMPORT_LESSONS'; lessons: RawLesson[]; category: Category; selectable?: boolean } // 结构化导入（候选/已选）
  | { type: 'IMPORT_RAW_TEXT'; text: string } // 兜底：原始文本走 /api/parse
  | { type: 'GET_SCHEDULE' } // 拉取当前存档（预览用）
  | { type: 'APPLY_COMMANDS'; commands: Command[] } // 直接应用结构化命令（更新已选课程等）
  | { type: 'PING' } // 探测选课助手是否在线
  | { type: 'OPEN_APP' }; // 打开全屏标签页

export interface ExtResponse {
  ok: boolean;
  error?: string;
  applied?: number; // 应用的命令数
  courseCount?: number; // 导入后课程总数
  schedule?: Schedule; // GET_SCHEDULE 返回
}

export const DEFAULT_BASE_URL = 'http://localhost:3001';

export interface ExtSettings {
  baseUrl: string;
  defaultCategory: Category;
  showUpdateResult: boolean; // 更新课程信息后是否展示结果弹窗
  updatePageLimit: number; // 翻页上限
  updatePageDelay: number; // 翻页间隔（毫秒）
}

export async function loadSettings(): Promise<ExtSettings> {
  const got = (await chrome.storage.sync.get({
    baseUrl: DEFAULT_BASE_URL,
    defaultCategory: 'elective' as Category,
    showUpdateResult: true,
    updatePageLimit: 5,
    updatePageDelay: 500,
  })) as unknown as Partial<ExtSettings>;
  return {
    baseUrl: got.baseUrl || DEFAULT_BASE_URL,
    defaultCategory: got.defaultCategory || 'elective',
    showUpdateResult: got.showUpdateResult !== false,
    updatePageLimit: typeof got.updatePageLimit === 'number' ? got.updatePageLimit : 5,
    updatePageDelay: typeof got.updatePageDelay === 'number' ? got.updatePageDelay : 500,
  };
}
