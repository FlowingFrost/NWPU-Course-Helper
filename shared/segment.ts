import type { Segment } from './types';

// 两个时间段是否完全相同（用于粘贴/导入时的去重）。
// 注意：这是「相等」比较，冲突（重叠）判断见 src/lib/algo.ts 的 segmentsConflict。
export function segmentsEqual(a: Segment, b: Segment): boolean {
  return (
    a.day === b.day &&
    a.startNode === b.startNode &&
    a.step === b.step &&
    a.startWeek === b.startWeek &&
    a.endWeek === b.endWeek &&
    a.room === b.room &&
    a.teacher === b.teacher
  );
}
