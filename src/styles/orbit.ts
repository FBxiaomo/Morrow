import type { SceneContext } from '../scenes/types';
import type { SettingSchema } from '../data/settings';
import type { StyleDef } from './registry';
import { BUDGET, VISUAL } from '../core/palette';
import { pomodoro } from '../data/pomodoro';
import { audio } from '../data/audio';
import { GlyphStyleBase } from './base';

const SEC_CLUSTER = 40;
const TILT = (-14 * Math.PI) / 180;

/**
 * 轨道样式：数字粒子沿缓慢椭圆漂移，秒点沿倾斜椭圆轨道绕主时间公转（一圈一分钟）。
 * 漂移幅度 ≤ 字高 2%，克制在运动预算内。
 */
export class OrbitStyle extends GlyphStyleBase implements StyleDef {
  readonly id = 'orbit';
  readonly title = '轨道';
  readonly settings: SettingSchema[] = [
    { key: 'orbit.track', label: '轨道线', kind: 'toggle', default: true },
    { key: 'orbit.drift', label: '轨道漂移', kind: 'slider', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'orbit.digitSize', label: '数字大小', kind: 'slider', min: 0.6, max: 1.6, step: 0.05, default: 1 },
  ];
  private trackHidden = false;

  enter(ctx: SceneContext) {
    this.lastText = '';
    this.trackHidden = false;
    this.applyLayout(ctx);
    this.writeDigits(ctx, this.currentText(ctx), ctx.settings.get<number>('orbit.digitSize'), this.driftFn(ctx));
    this.lastText = this.currentText(ctx);
    ctx.field.uploadColors();
  }

  update(ctx: SceneContext) {
    const text = this.currentText(ctx);
    const sizeMul = ctx.settings.get<number>('orbit.digitSize');
    if (text !== this.lastText) {
      this.applyLayout(ctx);
      this.lastText = text;
    }
    // 椭圆漂移是持续运动，每帧写目标
    this.writeDigits(ctx, text, sizeMul, this.driftFn(ctx));
    this.recolorDigits(ctx, 1);

    const trackOn = ctx.settings.get<boolean>('orbit.track');
    if (trackOn) {
      this.trackHidden = false;
      this.writeOrbit(ctx);
    } else {
      if (!this.trackHidden) {
        this.hideTrack(ctx);
        this.trackHidden = true;
      }
      this.writeSecondPoint(ctx);
    }
    ctx.field.uploadColors();
  }

  exit() {}

  /* ---------- 装饰层 ---------- */

  private driftFn(ctx: SceneContext): (idx: number, i: number) => [number, number] {
    const bass = audio.bands().bass;
    const amp = ctx.settings.get<number>('orbit.drift') * 0.012 * (1 - 0.4 * ctx.quiet) * (1 + bass * 1.0);
    const w = (Math.PI * 2) / 17;
    const t = ctx.time;
    return (idx) => {
      const p = this.phaseOf(idx) * Math.PI * 2;
      return [amp * Math.cos(t * w + p), amp * 0.62 * Math.sin(t * w + p)];
    };
  }

  /** 轨道线：倾斜椭圆，trail 暗色 */
  private writeOrbit(ctx: SceneContext) {
    const { field } = ctx;
    const rx = this.ringRadius * 1.34;
    const ry = this.ringRadius * 0.4;
    const cos = Math.cos(TILT);
    const sin = Math.sin(TILT);
    // trail 色在细粒径下几乎不可见，轨环用主字色的 32% 保持「看得见但不抢戏」
    const c = ctx.temp.digit;
    const n = BUDGET.ring - SEC_CLUSTER;

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ex = Math.cos(a) * rx;
      const ey = Math.sin(a) * ry;
      field.setTarget(this.ringStart + i, ex * cos - ey * sin, ex * sin + ey * cos);
      field.setColor(this.ringStart + i, c.r * 0.5, c.g * 0.5, c.b * 0.5);
      field.setSize(this.ringStart + i, VISUAL.ringSize * 0.7);
    }
    this.writeSecondPoint(ctx);
  }

  /** 秒点：一圈一分钟的小星簇（accent） */
  private writeSecondPoint(ctx: SceneContext) {
    const { field } = ctx;
    const rx = this.ringRadius * 1.34;
    const ry = this.ringRadius * 0.4;
    const cos = Math.cos(TILT);
    const sin = Math.sin(TILT);
    // 秒点一圈一分钟；番茄钟活跃时变为进度点（一圈一个阶段）
    const rev = pomodoro.isActive() ? pomodoro.progress() : this.secondProgress();
    const a = -Math.PI / 2 + rev * Math.PI * 2;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    const cx = ex * cos - ey * sin;
    const cy = ex * sin + ey * cos;
    const acc = ctx.temp.accent;
    const base = this.ringStart + BUDGET.ring - SEC_CLUSTER;
    const twinkle = 1.25 + audio.bands().treble * 0.45;

    for (let i = 0; i < SEC_CLUSTER; i++) {
      const idx = base + i;
      const p1 = this.phaseOf(idx) * Math.PI * 2;
      const p2 = this.phaseOf(idx + 7777) * Math.PI * 2;
      field.setTarget(idx, cx + Math.cos(p1) * 0.012, cy + Math.sin(p2) * 0.012);
      field.setColor(idx, acc.r * twinkle, acc.g * twinkle, acc.b * twinkle);
      field.setSize(idx, VISUAL.ringSize * 1.15);
    }
  }

  private hideTrack(ctx: SceneContext) {
    const { field } = ctx;
    const n = BUDGET.ring - SEC_CLUSTER;
    for (let i = 0; i < n; i++) {
      field.setTarget(this.ringStart + i, 999, 999);
    }
  }
}
