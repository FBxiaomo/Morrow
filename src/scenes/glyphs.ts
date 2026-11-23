/**
 * 字形采样：把字符渲染到离屏 canvas，再按像素采样成归一化点集。
 * 同一个字符永远得到同一批点（固定种子 + 固定采样顺序），
 * 所以数字跳变时只有变化的位数在动。
 */
import { mulberry32 } from '../core/rng';

export interface Glyph {
  /** 归一化点集，x ∈ [0,1]，y ∈ [0,1]，原点在左下 */
  points: Float32Array;
  count: number;
}

const cache = new Map<string, Glyph>();

let fontStack = '"Didot", "Bodoni MT", "Playfair Display", "Cormorant Garamond", "Georgia", "Times New Roman", serif';
let fontEpoch = 0;

/** 切换字体栈（缓存按 epoch 隔离，旧字体采样保留以便切回） */
export function setFontStack(stack: string) {
  if (stack === fontStack) return;
  fontStack = stack;
  fontEpoch++;
}

export function sampleGlyph(char: string, target: number, weight = 300): Glyph {
  const key = char + '|' + target + '|' + weight + '|' + fontEpoch;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = 240;
  const H = 360;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const fallback: Glyph = { points: new Float32Array(target * 2), count: target };

  if (!ctx) {
    cache.set(key, fallback);
    return fallback;
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = weight + ' ' + Math.round(H * 0.72) + 'px ' + fontStack;
  ctx.fillText(char, W / 2, H / 2);

  const data = ctx.getImageData(0, 0, W, H).data;

  // 收集亮像素（步长 2 降低开销）
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4] > 140) {
        xs.push(x);
        ys.push(y);
      }
    }
  }

  if (xs.length < 40) {
    cache.set(key, fallback);
    return fallback;
  }

  // 找到实际包围盒，把字形归一化到 [0,1]
  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  const rnd = mulberry32(0x5bf03635 ^ char.charCodeAt(0) * 7919);
  const points = new Float32Array(target * 2);
  for (let i = 0; i < target; i++) {
    const p = Math.floor(rnd() * xs.length);
    const nx = (xs[p] - minX) / spanX;
    const ny = 1 - (ys[p] - minY) / spanY;
    points[i * 2] = nx;
    points[i * 2 + 1] = ny;
  }

  const glyph: Glyph = { points, count: target };
  cache.set(key, glyph);
  return glyph;
}

/** 冒号用两个小方块的规则点集，比采样更稳定 */
export function sampleColon(target: number): Glyph {
  const key = 'colon|' + target;
  const hit = cache.get(key);
  if (hit) return hit;

  const points = new Float32Array(target * 2);
  const perDot = Math.floor(target / 2);
  const dotR = 0.1;
  const rnd = mulberry32(0x2f1c ^ target);
  for (let i = 0; i < target; i++) {
    const dot = i < perDot ? 0 : 1;
    // 两点收紧（0.60 / 0.42），更像衬线体的冒号节奏
    const cy = dot === 0 ? 0.6 : 0.42;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * dotR;
    points[i * 2] = 0.5 + Math.cos(a) * r;
    points[i * 2 + 1] = cy + Math.sin(a) * r;
  }

  const glyph: Glyph = { points, count: target };
  cache.set(key, glyph);
  return glyph;
}