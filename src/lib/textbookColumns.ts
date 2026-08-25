import type { TextbookColumnKey } from '../../shared/types';

// 教材信息页列定义（顺序即表格列顺序）
export interface TextbookColumnDef {
  key: TextbookColumnKey;
  label: string;
}

export const TEXTBOOK_COLUMNS: TextbookColumnDef[] = [
  { key: 'courseName', label: '课程名称' },
  { key: 'courseCode', label: '课程代码' },
  { key: 'type', label: '类型' },
  { key: 'index', label: '序号' },
  { key: 'name', label: '教材名称' },
  { key: 'author', label: '作者' },
  { key: 'isbn', label: 'ISBN/编号' },
  { key: 'publisher', label: '出版社' },
  { key: 'edition', label: '版次' },
  { key: 'pubDate', label: '出版年月' },
];

// 教材名称列永不压缩
export const NEVER_COMPRESS: Set<TextbookColumnKey> = new Set(['name']);

// 估算文本显示宽度（ch 单位）：CJK 全角≈1，ASCII/数字≈0.6
export function textWidthCh(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c > 0x2e80 ? 1 : 0.6;
  }
  return w;
}

export interface ColumnSpec {
  key: TextbookColumnKey;
  cells: string[];
}

// 列宽压缩算法：
// 每列按内容宽度（去重、降序）得到「候选宽度档位」[W1, W2, W3, ...]，初始取最宽 W1。
// 总宽超过预算时，反复选「下一档压缩收益最大」（Wk - Wk+1）的列压到下一档；
// 已压过的列继续看它的下一档差值，与其它列的首档差值比较，选收益最大者继续压。
// neverCompress 里的列（教材名称）永不压缩。
export function computeColumnWidths(
  specs: ColumnSpec[],
  budget: number,
  neverCompress: Set<TextbookColumnKey>,
): Map<TextbookColumnKey, number> {
  const levels = new Map<TextbookColumnKey, number[]>();
  const ptr = new Map<TextbookColumnKey, number>();
  let total = 0;

  for (const s of specs) {
    const ws = [...new Set(s.cells.map((t) => textWidthCh(t)))].sort((a, b) => b - a);
    if (!ws.length) ws.push(4);
    levels.set(s.key, ws);
    ptr.set(s.key, 0);
    total += ws[0];
  }

  while (total > budget) {
    let bestKey: TextbookColumnKey | null = null;
    let bestSaving = 0;
    for (const s of specs) {
      if (neverCompress.has(s.key)) continue;
      const p = ptr.get(s.key)!;
      const ws = levels.get(s.key)!;
      if (p >= ws.length - 1) continue; // 已压到最窄档
      const saving = ws[p] - ws[p + 1];
      if (saving > bestSaving) {
        bestSaving = saving;
        bestKey = s.key;
      }
    }
    if (bestKey === null) break; // 无法继续压缩
    ptr.set(bestKey, ptr.get(bestKey)! + 1);
    total -= bestSaving;
  }

  const result = new Map<TextbookColumnKey, number>();
  for (const s of specs) {
    result.set(s.key, levels.get(s.key)![ptr.get(s.key)!]);
  }
  return result;
}
