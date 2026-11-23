import * as THREE from 'three';

/**
 * 色温系统：一天四时段的色彩语言，20 分钟线性过渡，不瞬切。
 * 深夜深蓝 → 清晨暖金 → 白天象牙 → 黄昏琥珀 → 夜间淡蓝紫。
 * 这是「时钟是状态的镜子」的体现：画面随真实时间改变气质。
 */

interface Stop {
  /** 小时（含小数） */
  at: number;
  /** 数字主色 */
  digit: number;
  /** 强调色 */
  accent: number;
  /** 余晖色 */
  trail: number;
  /** 亮度系数，深夜整体降亮 */
  light: number;
}

/** 关键帧：相邻时段之间 20 分钟线性过渡 */
const STOPS: Stop[] = [
  { at: 0.0, digit: 0x8fa8d8, accent: 0x7f96c8, trail: 0x262c38, light: 0.75 },
  { at: 4.83, digit: 0x8fa8d8, accent: 0x7f96c8, trail: 0x262c38, light: 0.75 },
  { at: 5.17, digit: 0xe8c88a, accent: 0xd8b478, trail: 0x3a3428, light: 0.9 },
  { at: 7.83, digit: 0xe8c88a, accent: 0xd8b478, trail: 0x3a3428, light: 0.9 },
  { at: 8.17, digit: 0xe9e4d8, accent: 0xd8c08a, trail: 0x3a342a, light: 1.0 },
  { at: 16.83, digit: 0xe9e4d8, accent: 0xd8c08a, trail: 0x3a342a, light: 1.0 },
  { at: 17.17, digit: 0xe0a878, accent: 0xd09868, trail: 0x38302a, light: 0.95 },
  { at: 19.83, digit: 0xe0a878, accent: 0xd09868, trail: 0x38302a, light: 0.95 },
  { at: 20.17, digit: 0xb8c4e8, accent: 0xa8b4d8, trail: 0x2c3240, light: 0.85 },
  { at: 22.83, digit: 0xb8c4e8, accent: 0xa8b4d8, trail: 0x2c3240, light: 0.85 },
  { at: 23.17, digit: 0x8fa8d8, accent: 0x7f96c8, trail: 0x262c38, light: 0.75 },
  { at: 24.0, digit: 0x8fa8d8, accent: 0x7f96c8, trail: 0x262c38, light: 0.75 },
];

export interface TempColors {
  /** 数字主色（线性空间，供粒子使用） */
  digit: THREE.Color;
  accent: THREE.Color;
  trail: THREE.Color;
  /** 数字主色（sRGB 十六进制，供 CSS 使用） */
  digitHex: number;
  accentHex: number;
  /** 亮度系数 0.75–1.0 */
  light: number;
}

function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// 对象复用：每帧调用，不制造垃圾
const scratch: TempColors = {
  digit: new THREE.Color(),
  accent: new THREE.Color(),
  trail: new THREE.Color(),
  digitHex: 0xe9e4d8,
  accentHex: 0xd8c08a,
  light: 1,
};

/** 当前时段色温（对象复用，勿长期持有引用） */
export function colorTemp(date: Date = new Date()): TempColors {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;

  let i = 0;
  while (i < STOPS.length - 2 && h >= STOPS[i + 1].at) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const t = Math.min(1, Math.max(0, (h - a.at) / (b.at - a.at)));

  const digitHex = lerpHex(a.digit, b.digit, t);
  const accentHex = lerpHex(a.accent, b.accent, t);
  const trailHex = lerpHex(a.trail, b.trail, t);

  scratch.digitHex = digitHex;
  scratch.accentHex = accentHex;
  scratch.digit.setHex(digitHex);
  scratch.accent.setHex(accentHex);
  scratch.trail.setHex(trailHex);
  scratch.light = a.light + (b.light - a.light) * t;
  return scratch;
}

/** DOM 文字用的 CSS 颜色（sRGB） */
export function inkCss(temp: TempColors, opacity = 1): string {
  const r = (temp.digitHex >> 16) & 0xff;
  const g = (temp.digitHex >> 8) & 0xff;
  const b = temp.digitHex & 0xff;
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + opacity + ')';
}
