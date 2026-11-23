/**
 * 视觉规则：所有亮度、尺寸、配色的硬性参数集中在这里。
 * 调参只改这个文件，不要在场景里散落魔法数字。
 */

export const PALETTE = {
  /** 暖黑：不偏蓝，接近墨色 */
  background: 0x0a0a0d,
  /** 数字主色：象牙白 */
  digit: 0xe9e4d8,
  /** 强调色：香槟金 */
  accent: 0xd8c08a,
  /** 秒环未走过部分：极暗的金褐 */
  trail: 0x3a342a,
};

export const VISUAL = {
  /** 片元亮度上限，加法混合也不会过曝 */
  maxLuminance: 1.0,
  /** 全局曝光，1.0 = 标准。低曝光是高级感的核心 */
  exposure: 0.72,
  /** 安静模式下的曝光与运动倍率 */
  quietExposure: 0.42,
  quietMotion: 0.6,
  /** 数字粒子像素倍率（乘视口基准） */
  digitSize: 1.0,
  /** 秒环粒子像素倍率 */
  ringSize: 0.8,
};

/** 粒子总数预算 */
export const BUDGET = {
  digits: 2300,
  colon: 400,
  ring: 1900,
  moon: 500,
  get total() {
    return this.digits * 4 + this.colon + this.ring + this.moon;
  },
};