import type { Course, Option } from '../../shared/types';

// 新增课程未指定颜色时的默认灰（作为「占位色」处理，不参与唯一色保留）
const DEFAULT_GRAY = '64748b';

function colorKey(c: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(c ?? '');
  return m ? m[1].toLowerCase() : '';
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ---------- OKLab 感知均匀色空间 ----------
// HSL 的色相角度并不感知均匀（等角度 ≠ 等感知差异），这里改用 OKLab 的欧氏距离近似 ΔE。
interface Oklab {
  L: number;
  a: number;
  b: number;
}

function srgbToOklab(r: number, g: number, b: number): Oklab {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = lin(r);
  const lg = lin(g);
  const lb = lin(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function hexToOklab(hex: string): (Oklab & { hex: string }) | null {
  const m = /^#?([0-9a-f]{6})/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const { L, a, b } = srgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return { L, a, b, hex: '#' + m[1].toLowerCase() };
}

function oklchHue(ok: Oklab): number {
  const h = (Math.atan2(ok.b, ok.a) * 180) / Math.PI;
  return (h + 360) % 360;
}

function hueCircularDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

// 候选色环带：在 sRGB 立方体采样网格，转 OKLab 后只保留「中等明度、中等彩度」的颜色，
// 并按 OKLCh 色相角排序。收窄明度/彩度是为了让色域在各色相方向更均衡（否则 OKLab 里
// 蓝紫方向色域更大，贪心会往那里扎堆）；色相角用 OKLCh（比 HSL 色相更感知均匀）。
const RING: (Oklab & { hex: string; hue: number })[] = (() => {
  const out: (Oklab & { hex: string; hue: number })[] = [];
  for (let r = 0; r <= 255; r += 8) {
    for (let g = 0; g <= 255; g += 8) {
      for (let b = 0; b <= 255; b += 8) {
        const ok = srgbToOklab(r, g, b);
        const chroma = Math.hypot(ok.a, ok.b);
        if (ok.L < 0.48 || ok.L > 0.62) continue; // 中等明度
        if (chroma < 0.09 || chroma > 0.15) continue; // 中等彩度，避免灰调/霓虹
        out.push({
          ...ok,
          hex: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''),
          hue: oklchHue(ok),
        });
      }
    }
  }
  out.sort((x, y) => x.hue - y.hue);
  return out;
})();

// 给一组课程分配唯一且「感知上」足够区分的颜色：
// - 保留用户已指定、非灰色、且不重复的颜色
// - 其余（灰色/重复）在 OKLCh 色相环上按感知均匀的色相等距铺开（并整体旋转避开保留色），
//   从上面的色环带里取最接近目标色相的候选色。相比按 HSL 色相角度均分，OKLCh 色相更贴近
//   人眼感知，避免「角度相等却看着相近」。
export function resolveCourseColors(courses: Course[]): Map<string, string> {
  const map = new Map<string, string>();
  const usedKeys = new Set<string>();
  const keptHues: number[] = [];
  const pending: Course[] = [];

  // 第一遍：保留已指定且不重复的非灰色颜色
  for (const c of courses) {
    const key = colorKey(c.color);
    if (key && key !== DEFAULT_GRAY && /^#/.test(c.color) && !usedKeys.has(key)) {
      map.set(c.id, c.color);
      usedKeys.add(key);
      const ok = hexToOklab(c.color);
      if (ok) keptHues.push(oklchHue(ok));
    } else {
      pending.push(c);
    }
  }

  // 第二遍：OKLCh 色相等距铺开（步进 360/n），扫描一个整体旋转角避开保留色
  const n = pending.length;
  if (n > 0) {
    const step = 360 / n;
    let bestOffset = 0;
    let bestDist = -1;
    for (let o = 0; o < step; o += 0.5) {
      let d = Infinity;
      for (let i = 0; i < n; i++) {
        const hue = (i * step + o) % 360;
        for (const h of keptHues) d = Math.min(d, hueCircularDist(hue, h));
      }
      if (d > bestDist) {
        bestDist = d;
        bestOffset = o;
      }
    }

    const usedIdx = new Set<number>();
    for (let i = 0; i < n; i++) {
      const target = (i * step + bestOffset) % 360;
      let bestIdx = -1;
      let bestD = Infinity;
      for (let j = 0; j < RING.length; j++) {
        if (usedIdx.has(j)) continue;
        const dd = hueCircularDist(RING[j].hue, target);
        if (dd < bestD) {
          bestD = dd;
          bestIdx = j;
        }
      }
      const hex = bestIdx >= 0 ? RING[bestIdx].hex : '#64748b'; // 兜底（正常不会触发）
      if (bestIdx >= 0) usedIdx.add(bestIdx);
      map.set(pending[i].id, hex);
      usedKeys.add(colorKey(hex));
    }
  }

  return map;
}

// 候选选项的「最早星期」（1=周一 … 7=周日）
export function minWeekday(option: Option): number {
  let m = 8;
  for (const s of option.segments) {
    if (s.day < m) m = s.day;
  }
  return m === 8 ? 1 : m;
}

// 按「最早星期」对课程主色做轻微色相偏移，得到不同星期组合的颜色。
// 同一最早星期（如 1+3 与 1+5）得到相同颜色；不同最早星期仅略微差别（4°/步，
// 最大跨度 24°），保持同一课程同色系，节次/周数不影响颜色。
export function comboColor(base: string, weekday: number): string {
  const hsl = hexToHsl(base);
  if (!hsl) return base;
  return hslToHex(hsl.h + (weekday - 1) * 4, hsl.s, hsl.l);
}

// 生成课程块的淡色背景：保留色相、降低饱和度、提高亮度，避免视觉冲击
export function tintColor(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return '#eef2ff';
  return hslToHex(hsl.h, Math.min(1, hsl.s * 0.45), 0.94);
}
