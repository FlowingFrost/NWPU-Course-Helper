// 输入框数字解析：非数字/空值统一回退为 0（原 CoursePanel/SettingsPanel 各自定义，现已集中）
export function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
