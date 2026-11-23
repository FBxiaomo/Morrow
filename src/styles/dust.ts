import type { SceneContext } from '../scenes/types';
import type { SettingSchema } from '../data/settings';
import type { StyleDef } from './registry';
import { BUDGET, VISUAL } from '../core/palette';
import { pomodoro } from '../data/pomodoro';
import { audio } from '../data/audio';
import { sampleGlyph, sampleColon, type Glyph } from '../scenes/glyphs';

interface Slot {
  start: number;
  count: number;
}

const DIGIT_SLOTS = 4;
const COLON_INDEX = 2;

/**
 * 星尘样式：HH:MM 衬线字形 + 秒环。
 * 颜色来自 ctx.temp（色温系统）；数字跳变是优雅的粒子形变。
 */
export class DustStyle implements StyleDef {
  readonly id = 'dust';
  readonly title = '星尘';
  readonly settings: SettingSchema[] = [
    { key: 'dust.ring', label: '秒环', kind: 'toggle', default: true },
    { key: 'dust.digitSize', label: '数字大小', kind: 'slider', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: 'dust.breath', label: '呼吸', kind: 'slider', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'dust.bloom', label: '整分绽放', kind: 'toggle', default: true },
  ];

  private slots: Slot[] = [];
  private colonSlot: Slot;
  private ringStart: number;

  private lastText = '';
  private ringHidden = false;
  private ringRadius = 1;
  private layoutScale = 1;

  constructor() {
    let cursor = 0;
    for (let i = 0; i < DIGIT_SLOTS; i++) {
      this.slots.push({ start: cursor, count: BUDGET.digits });
      cursor += BUDGET.digits;
    }
    this.colonSlot = { start: cursor, count: BUDGET.colon };
    cursor += BUDGET.colon;
    this.ringStart = cursor;
  }

  enter(ctx: SceneContext) {
    this.lastText = '';
    this.ringHidden = false;
    this.applyLayout(ctx);
    this.writeDigits(ctx, this.currentText(ctx));
    this.lastText = this.currentText(ctx);
    this.writeRing(ctx, 0);
    ctx.field.uploadColors();
  }

  update(ctx: SceneContext) {
    const text = this.currentText(ctx);
    if (text !== this.lastText) {
      this.applyLayout(ctx);
      this.writeDigits(ctx, text);
      this.lastText = text;
      // 整分绽放：一声无声的问候，幅度控制在字高 3% 量级
      if (ctx.settings.get<boolean>('dust.bloom')) {
        ctx.field.bloom(1);
      }
    }

    // 音乐律动：低频驱动呼吸幅度、高频轻闪；幅度封顶 7% 字高
    const bands = audio.bands();
    const waveRaw = this.breathWave(ctx) * (1 + bands.bass * 1.2);
    const wave = Math.max(-0.07, Math.min(0.07, waveRaw + bands.treble * 0.05));
    this.recolorDigits(ctx, wave);

    const ringOn = ctx.settings.get<boolean>('dust.ring');
    if (ringOn) {
      this.ringHidden = false;
      // 番茄钟活跃时：秒环变为专注进度环（走满一圈换阶段）
      const progress = pomodoro.isActive() ? pomodoro.progress() : this.secondProgress();
      this.writeRing(ctx, progress, wave);
    } else if (!this.ringHidden) {
      this.hideRing(ctx);
      this.ringHidden = true;
    }
    ctx.field.uploadColors();
  }

  exit() {}

  /* ---------- 时间文本 ---------- */

  private currentText(ctx: SceneContext): string {
    const now = new Date();
    const h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    if (ctx.settings.get<string>('content.format') === '12') {
      const h12 = h % 12 || 12;
      return (h12 < 10 ? ' ' + h12 : String(h12)) + m;
    }
    return String(h).padStart(2, '0') + m;
  }

  private secondProgress(): number {
    const now = new Date();
    return (now.getSeconds() + now.getMilliseconds() / 1000) / 60;
  }

  /* ---------- 布局 ---------- */

  private applyLayout(ctx: SceneContext) {
    const aspect = ctx.viewport.width / Math.max(1, ctx.viewport.height);
    const halfW = aspect;

    const maxRing = 0.88;
    const ringForDigits = 0.78;

    const widthRatio = aspect > 1.2 ? 0.58 : 0.74;
    const totalWidth = halfW * 2 * widthRatio;
    const digitH = (totalWidth / 5.1) * 1.45;

    this.layoutScale = Math.min(digitH, maxRing / 1.45);
    this.ringRadius = Math.min(maxRing, Math.max(this.layoutScale * 1.02, ringForDigits));
  }

  /* ---------- 写入 ---------- */

  private writeDigits(ctx: SceneContext, text: string) {
    const digitH = this.layoutScale;
    const digitW = digitH / 1.45;
    const gap = digitW * 0.14;
    const colonW = digitW * 0.42;
    const sizeMul = ctx.settings.get<number>('dust.digitSize');

    // 显式列布局：D D : D D
    const widths = [digitW, digitW, colonW, digitW, digitW];
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * 4;
    let cursor = -totalW / 2;

    const digitCols = [0, 1, 3, 4];
    const chars = text.split('');

    for (let d = 0; d < DIGIT_SLOTS; d++) {
      const col = digitCols[d];
      const slot = this.slots[d];
      const ch = chars[d] ?? '0';
      if (ch === ' ') {
        // 12 小时制的空位：整槽移出画面
        this.hideSlot(slot, ctx);
        continue;
      }
      const glyph = sampleGlyph(ch, slot.count);
      let ox = cursor;
      for (let c = 0; c < col; c++) ox += widths[c] + gap;
      this.writeGlyph(slot, glyph, ox, digitH, ctx, 1.0 * sizeMul);
    }

    let colonX = cursor;
    for (let c = 0; c < COLON_INDEX; c++) colonX += widths[c] + gap;
    const colon = sampleColon(this.colonSlot.count);
    this.writeGlyph(this.colonSlot, colon, colonX, digitH, ctx, 1.05 * sizeMul);
  }

  /** 只写目标位置；粒子靠弹簧物理归位，数字跳变时是优雅的形变 */
  private writeGlyph(
    slot: Slot,
    glyph: Glyph,
    originX: number,
    height: number,
    ctx: SceneContext,
    sizeMul: number,
  ) {
    const { field } = ctx;
    const w = height / 1.45;
    for (let i = 0; i < slot.count; i++) {
      const idx = slot.start + i;
      const gx = glyph.points[i * 2];
      const gy = glyph.points[i * 2 + 1];
      field.setTarget(idx, originX + gx * w, (gy - 0.5) * height);
      field.setSize(idx, VISUAL.digitSize * sizeMul);
    }
  }

  private hideSlot(slot: Slot, ctx: SceneContext) {
    for (let i = 0; i < slot.count; i++) {
      ctx.field.setTarget(slot.start + i, 999, 999);
    }
  }

  /**
   * 呼吸波：8 秒周期的正弦，幅度由「呼吸」设置控制（0–1 → ±0–3.5%）。
   * 安静模式下呼吸放缓变浅。
   */
  private breathWave(ctx: SceneContext): number {
    const amp = ctx.settings.get<number>('dust.breath') * 0.035 * (1 - 0.6 * ctx.quiet);
    return amp * Math.sin(ctx.time * ((Math.PI * 2) / 8));
  }

  /** 每帧重着色：色温 + 呼吸 */
  private recolorDigits(ctx: SceneContext, wave: number) {
    const { field } = ctx;
    const c = ctx.temp.digit;
    const k = 1 + wave;
    for (let d = 0; d < DIGIT_SLOTS; d++) {
      const slot = this.slots[d];
      for (let i = slot.start, end = slot.start + slot.count; i < end; i++) {
        field.setColor(i, c.r * k, c.g * k, c.b * k);
      }
    }
    for (let i = this.colonSlot.start, end = this.colonSlot.start + this.colonSlot.count; i < end; i++) {
      field.setColor(i, c.r * k, c.g * k, c.b * k);
    }
  }

  private writeRing(ctx: SceneContext, progress: number, wave = 0) {
    const { field } = ctx;
    // 环随呼吸微弱起伏（±0.6% 半径）
    const R = this.ringRadius * (1 + wave * 0.18);
    const n = BUDGET.ring;
    const angleOffset = -Math.PI / 2;
    const accent = ctx.temp.accent;
    const trail = ctx.temp.trail;

    for (let i = 0; i < n; i++) {
      const idx = this.ringStart + i;
      const t = i / n;
      const angle = angleOffset + t * Math.PI * 2;
      field.setTarget(idx, Math.cos(angle) * R, Math.sin(angle) * R);

      const passed = t <= progress;
      const near = Math.abs(t - progress) < 0.006;
      if (near) {
        field.setColor(idx, accent.r * 1.25, accent.g * 1.25, accent.b * 1.25);
        field.setSize(idx, VISUAL.ringSize * 1.25);
      } else if (passed) {
        field.setColorHex(idx, accent);
        field.setSize(idx, VISUAL.ringSize * 0.85);
      } else {
        field.setColorHex(idx, trail);
        field.setSize(idx, VISUAL.ringSize * 0.6);
      }
    }
  }

  private hideRing(ctx: SceneContext) {
    for (let i = 0; i < BUDGET.ring; i++) {
      ctx.field.setTarget(this.ringStart + i, 999, 999);
    }
  }
}
