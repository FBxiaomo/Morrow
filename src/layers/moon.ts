import * as THREE from 'three';
import type { ParticleField } from '../core/field';
import type { SettingsStore } from '../data/settings';
import { lunarInfo } from '../data/lunar';
import { BUDGET } from '../core/palette';

/**
 * 月相装饰：小型粒子月相盘（右上角）。
 * 明暗界线按朔望月推算：上半月亮右侧、下半月亮左侧，与真实月相同步。
 * 装饰计入亮度预算（500 粒子，lit 亮度取 accent 的一半）。
 */

const RADIUS = 0.095;

export class MoonLayer {
  private field: ParticleField;
  private store: SettingsStore;
  private start: number;
  private ux: Float32Array;
  private uy: Float32Array;
  private phase = 0;
  private minuteKey = -1;
  private testPhase: number | null = null;

  constructor(field: ParticleField, store: SettingsStore) {
    this.field = field;
    this.store = store;
    this.start = BUDGET.digits * 4 + BUDGET.colon + BUDGET.ring;

    // 固定种子的单位圆内散点（同一月亮永远同一点集）
    const n = BUDGET.moon;
    this.ux = new Float32Array(n);
    this.uy = new Float32Array(n);
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.97;
      this.ux[i] = Math.cos(a) * r;
      this.uy[i] = Math.sin(a) * r;
      this.field.setSize(this.start + i, 0.55);
    }
    this.refreshPhase();
  }

  /** 测试用：固定相位（0–1，0=朔，0.5=望）；传 null 恢复真实月相 */
  setPhase(p: number | null) {
    this.testPhase = p;
    if (p === null) this.refreshPhase();
  }

  private refreshPhase() {
    try {
      this.phase = lunarInfo(new Date()).moonPhase;
    } catch {
      this.phase = 0;
    }
    this.minuteKey = Math.floor(Date.now() / 60000);
  }

  /** 每帧调用：位置/明暗随视口与色温更新（月相每分钟才重算一次） */
  update(_time: number, temp: { accent: THREE.Color }, aspect: number) {
    const now = Math.floor(Date.now() / 60000);
    if (this.testPhase === null && now !== this.minuteKey) this.refreshPhase();

    const on = this.store.get<boolean>('content.moon');
    const mx = aspect - 0.32;
    const my = 0.74;
    const phase = this.testPhase === null ? this.phase : this.testPhase;
    const phi = phase * Math.PI * 2;
    const b = Math.cos(phi);
    const dir = phase < 0.5 ? 1 : -1; // 上弦月亮右侧，下弦月亮左侧
    const acc = temp.accent;

    for (let i = 0; i < BUDGET.moon; i++) {
      const idx = this.start + i;
      const px = this.ux[i];
      const py = this.uy[i];
      this.field.setTarget(idx, mx + px * RADIUS, my + py * RADIUS);

      if (!on) {
        this.field.setColor(idx, 0, 0, 0);
        continue;
      }
      const s = Math.sqrt(1 - py * py);
      const lit = dir * (px - dir * b * s) > 0;
      if (lit) {
        // 亮度取 accent 一半，克制在亮度预算内
        this.field.setColor(idx, acc.r * 0.5, acc.g * 0.5, acc.b * 0.5);
      } else {
        this.field.setColor(idx, 0, 0, 0);
      }
    }
  }
}
