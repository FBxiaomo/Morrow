import type { SceneContext } from '../scenes/types';
import type { SettingSchema } from '../data/settings';
import type { StyleDef } from './registry';
import { BUDGET, VISUAL } from '../core/palette';
import { GlyphStyleBase } from './base';
import { audio } from '../data/audio';

/**
 * 声波样式：底部低频正弦波形，振幅按秒脉动（每秒一拍，指数衰减）。
 * 无麦克风（麦克风律动是阶段 9），这里是时间驱动的合成波。
 */
export class WaveStyle extends GlyphStyleBase implements StyleDef {
  readonly id = 'wave';
  readonly title = '声波';
  readonly settings: SettingSchema[] = [
    { key: 'wave.line', label: '波形', kind: 'toggle', default: true },
    { key: 'wave.amp', label: '波幅', kind: 'slider', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'wave.digitSize', label: '数字大小', kind: 'slider', min: 0.6, max: 1.6, step: 0.05, default: 1 },
  ];
  private waveHidden = false;

  enter(ctx: SceneContext) {
    this.lastText = '';
    this.waveHidden = false;
    this.applyLayout(ctx);
    this.writeDigits(ctx, this.currentText(ctx), ctx.settings.get<number>('wave.digitSize'));
    this.lastText = this.currentText(ctx);
    ctx.field.uploadColors();
  }

  update(ctx: SceneContext) {
    const text = this.currentText(ctx);
    if (text !== this.lastText) {
      this.applyLayout(ctx);
      this.writeDigits(ctx, text, ctx.settings.get<number>('wave.digitSize'));
      this.lastText = text;
    }
    this.recolorDigits(ctx, 1);

    const lineOn = ctx.settings.get<boolean>('wave.line');
    if (lineOn) {
      this.waveHidden = false;
      this.writeWave(ctx);
    } else if (!this.waveHidden) {
      this.hideRingArea(ctx);
      this.waveHidden = true;
    }
    ctx.field.uploadColors();
  }

  exit() {}

  private writeWave(ctx: SceneContext) {
    const { field } = ctx;
    const halfW = ctx.viewport.width / Math.max(1, ctx.viewport.height);
    const x0 = -halfW * 0.92;
    const x1 = halfW * 0.92;
    const baseY = -0.74;

    // 无麦克风：逐秒脉动（每秒一拍指数衰减）；有律动：低频包络驱动
    const secFrac = (Date.now() % 1000) / 1000;
    const pulse = 0.35 + 0.65 * Math.pow(1 - secFrac, 2.2);
    const bands = audio.bands();
    const env = audio.isActive() ? 0.22 + 0.78 * Math.max(bands.bass, bands.rms * 0.7) : pulse;
    const amp = ctx.settings.get<number>('wave.amp') * 0.03 * env * (1 - 0.4 * ctx.quiet);

    const k = (Math.PI * 2) / 1.35;
    const w = ctx.time * 1.1;
    const c = ctx.temp.trail;
    const acc = ctx.temp.accent;
    const mix = 0.25 + 0.35 * env;
    const bright = 0.9 + 0.7 * env;
    const n = BUDGET.ring;

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const x = x0 + (x1 - x0) * t;
      const y =
        baseY +
        amp * Math.sin(x * k - w) +
        amp * 0.35 * Math.sin(x * k * 2.3 + w * 1.7);
      field.setTarget(this.ringStart + i, x, y);
      field.setColor(
        this.ringStart + i,
        (c.r + (acc.r - c.r) * mix) * bright,
        (c.g + (acc.g - c.g) * mix) * bright,
        (c.b + (acc.b - c.b) * mix) * bright,
      );
      field.setSize(this.ringStart + i, VISUAL.ringSize * 0.7);
    }
  }
}
