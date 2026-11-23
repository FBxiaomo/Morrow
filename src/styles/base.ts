import type { SceneContext } from '../scenes/types';
import { BUDGET, VISUAL } from '../core/palette';
import { sampleGlyph, sampleColon, type Glyph } from '../scenes/glyphs';

export interface Slot {
  start: number;
  count: number;
}

export const DIGIT_SLOTS = 4;
export const COLON_INDEX = 2;

/**
 * 衬线字形时钟样式基类：槽位分配、排版、字形写入、时间文本。
 * 轨道/声波等样式只差装饰层（环区粒子的用法）。
 */
export abstract class GlyphStyleBase {
  protected slots: Slot[] = [];
  protected colonSlot: Slot;
  protected ringStart: number;
  protected layoutScale = 1;
  protected ringRadius = 1;
  protected lastText = '';

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

  /* ---------- 时间文本 ---------- */

  protected currentText(ctx: SceneContext): string {
    const now = new Date();
    const h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    if (ctx.settings.get<string>('content.format') === '12') {
      const h12 = h % 12 || 12;
      return (h12 < 10 ? ' ' + h12 : String(h12)) + m;
    }
    return String(h).padStart(2, '0') + m;
  }

  protected secondProgress(): number {
    const now = new Date();
    return (now.getSeconds() + now.getMilliseconds() / 1000) / 60;
  }

  /* ---------- 布局 ---------- */

  protected applyLayout(ctx: SceneContext) {
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

  protected writeDigits(ctx: SceneContext, text: string, sizeMul: number, offsetFn?: (idx: number, i: number) => [number, number]) {
    const digitH = this.layoutScale;
    const digitW = digitH / 1.45;
    const gap = digitW * 0.14;
    const colonW = digitW * 0.42;

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
        this.hideSlot(slot, ctx);
        continue;
      }
      const glyph = sampleGlyph(ch, slot.count);
      let ox = cursor;
      for (let c = 0; c < col; c++) ox += widths[c] + gap;
      this.writeGlyph(slot, glyph, ox, digitH, ctx, 1.0 * sizeMul, offsetFn);
    }

    let colonX = cursor;
    for (let c = 0; c < COLON_INDEX; c++) colonX += widths[c] + gap;
    const colon = sampleColon(this.colonSlot.count);
    this.writeGlyph(this.colonSlot, colon, colonX, digitH, ctx, 1.05 * sizeMul, offsetFn);
  }

  protected writeGlyph(
    slot: Slot,
    glyph: Glyph,
    originX: number,
    height: number,
    ctx: SceneContext,
    sizeMul: number,
    offsetFn?: (idx: number, i: number) => [number, number],
  ) {
    const { field } = ctx;
    const w = height / 1.45;
    for (let i = 0; i < slot.count; i++) {
      const idx = slot.start + i;
      const gx = glyph.points[i * 2];
      const gy = glyph.points[i * 2 + 1];
      const off = offsetFn ? offsetFn(idx, i) : null;
      field.setTarget(idx, originX + gx * w + (off ? off[0] : 0), (gy - 0.5) * height + (off ? off[1] : 0));
      field.setSize(idx, VISUAL.digitSize * sizeMul);
    }
  }

  protected hideSlot(slot: Slot, ctx: SceneContext) {
    for (let i = 0; i < slot.count; i++) {
      ctx.field.setTarget(slot.start + i, 999, 999);
    }
  }

  protected hideRingArea(ctx: SceneContext) {
    for (let i = 0; i < BUDGET.ring; i++) {
      ctx.field.setTarget(this.ringStart + i, 999, 999);
    }
  }

  /** 数字与冒号统一着色（色温 + 呼吸系数 k） */
  protected recolorDigits(ctx: SceneContext, k: number) {
    const { field } = ctx;
    const c = ctx.temp.digit;
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

  /** 固定种子的 0–1 相位（同粒子同相位） */
  protected phaseOf(idx: number): number {
    const h = Math.sin(idx * 12.9898) * 43758.5453;
    return h - Math.floor(h);
  }
}
