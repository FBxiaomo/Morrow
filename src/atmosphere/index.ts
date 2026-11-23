import type { SceneContext } from '../scenes/types';
import type { StyleDef } from '../styles/registry';
import type { SettingSchema } from '../data/settings';
import { audio } from '../data/audio';

/**
 * 氛围层（v3）：粒子不再描字，全部投入背景气质。
 * 三种形态共用 [0, ATMOS) 号段 —— 切换时同一批粒子靠弹簧自然形变，无硬切。
 * 星野：三层景深、极慢视差、微光闪烁。
 * 雾：大软颗粒双层慢卷，极低对比。
 * 流体：curl-noise 流场，形似墨在水中散开。
 */

const ATMOS = 6000;

/** 0–1 确定性哈希（无状态、可复现） */
function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function halfWidth(ctx: SceneContext): number {
  return (ctx.viewport.width / Math.max(1, ctx.viewport.height)) * 1.12;
}

/** 把 [from, count) 的粒子移出画面（月相层会在自己的号段内自行接管） */
function hideRest(ctx: SceneContext, from: number) {
  for (let i = from; i < ctx.field.count; i++) ctx.field.setTarget(i, 999, 999);
}

/* ---------------- 星野 ---------------- */

export class StarfieldStyle implements StyleDef {
  readonly id = 'starfield';
  readonly title = '星野';
  readonly settings: SettingSchema[] = [
    { key: 'starfield.drift', label: '漂移', kind: 'slider', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'starfield.twinkle', label: '闪烁', kind: 'slider', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'starfield.meteor', label: '流星', kind: 'toggle', default: true },
  ];

  /** 流星预留粒子数（头 + 尾链） */
  private static readonly METEOR_N = 36;
  /** 流星粒子号段起点（探针可读） */
  readonly meteorFirst = ATMOS - StarfieldStyle.METEOR_N;
  private meteor = { active: false, x: 0, y: 0, vx: 0, vy: 0, next: 0 };

  private x = new Float32Array(ATMOS);
  private y = new Float32Array(ATMOS);

  enter(ctx: SceneContext) {
    const halfW = halfWidth(ctx);
    const stars = ATMOS - StarfieldStyle.METEOR_N;
    for (let i = 0; i < stars; i++) {
      this.x[i] = (hash(i, 1) * 2 - 1) * halfW;
      this.y[i] = (hash(i, 2) * 2 - 1) * 1.08;
      ctx.field.setTarget(i, this.x[i], this.y[i]);
      ctx.field.setSize(i, [0.95, 0.72, 0.55][i % 3]);
    }
    // 流星：40–90 秒一颗；安静模式 / 开关关闭时不发
    this.meteor.active = false;
    this.meteor.next = ctx.time + 40 + hash(Math.floor(ctx.time * 7) % 977, 12) * 50;
    this.hideMeteor(ctx);
    hideRest(ctx, ATMOS);
    this.update(ctx);
  }

  update(ctx: SceneContext) {
    const { field, temp } = ctx;
    const t = ctx.time;
    const halfW = halfWidth(ctx);
    const drift = ctx.settings.get<number>('starfield.drift');
    const twinkleAmt = ctx.settings.get<number>('starfield.twinkle');
    const quiet = 1 - 0.5 * ctx.quiet;
    const treble = audio.bands().treble;
    const motion = (0.3 + drift) * quiet;

    for (let i = 0; i < ATMOS - StarfieldStyle.METEOR_N; i++) {
      const layer = i % 3;
      // 近/中/远三层：不同视差速度
      this.x[i] += [0.014, 0.008, 0.004][layer] * motion * ctx.dt * (layer === 2 ? -1 : 1);
      this.y[i] += [0.0022, 0.0013, 0.0007][layer] * motion * ctx.dt;
      if (this.x[i] > halfW) this.x[i] -= halfW * 2;
      if (this.x[i] < -halfW) this.x[i] += halfW * 2;
      if (this.y[i] > 1.1) this.y[i] = -1.1;
      field.setTarget(i, this.x[i], this.y[i]);

      const w = 0.35 + hash(i, 3) * 0.75;
      const ph = hash(i, 4) * Math.PI * 2;
      const tw = 1 + twinkleAmt * quiet * 0.26 * Math.sin(t * w + ph) + treble * 0.35;
      const base = [0.36, 0.24, 0.15][layer] * tw;
      field.setColor(i, temp.digit.r * base, temp.digit.g * base, temp.digit.b * base);
    }
    this.updateMeteor(ctx);
    field.uploadColors();
  }

  exit() {}

  /* ---------- 流星 ---------- */

  private hideMeteor(ctx: SceneContext) {
    for (let k = 0; k < StarfieldStyle.METEOR_N; k++) {
      ctx.field.setTarget(this.meteorFirst + k, 999, 999);
    }
  }

  private updateMeteor(ctx: SceneContext) {
    const m = this.meteor;
    const N = StarfieldStyle.METEOR_N;
    if (!m.active) {
      if (ctx.time < m.next) return;
      const quiet = ctx.settings.get<boolean>('appearance.quiet');
      if (!ctx.settings.get<boolean>('starfield.meteor') || quiet) {
        m.next = ctx.time + 20; // 关闭或安静时稍后再评估
        return;
      }
      // 发射：上半区右侧随机点，向左下缓慢划过
      const h1 = hash(Math.floor(ctx.time * 13) % 991, 21);
      const h2 = hash(Math.floor(ctx.time * 17) % 983, 22);
      const h3 = hash(Math.floor(ctx.time * 19) % 979, 23);
      m.active = true;
      m.x = halfWidth(ctx) * (0.25 + h1 * 0.6);
      m.y = 0.55 + h2 * 0.45;
      // 整条划线从头部原位出发：清掉隐匿期积累的速度，避免超调甩鞭
      ctx.field.snapRange(this.meteorFirst, this.meteorFirst + StarfieldStyle.METEOR_N - 1, m.x, m.y);
      const speed = 0.42 + h3 * 0.16;
      const ux = -(0.78 + h3 * 0.12);
      const uy = -(0.56 + h2 * 0.1);
      const inv = speed / Math.hypot(ux, uy);
      m.vx = ux * inv;
      m.vy = uy * inv;
      return;
    }

    // 飞行中：头在前，尾链沿反方向排成细短划线，亮度沿尾衰减
    m.x += m.vx * ctx.dt;
    m.y += m.vy * ctx.dt;
    const { field, temp } = ctx;
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const bx = -m.vx / sp;
    const by = -m.vy / sp;
    for (let k = 0; k < N; k++) {
      const idx = this.meteorFirst + k;
      const t = k / (N - 1);
      field.setTarget(idx, m.x + bx * k * 0.012, m.y + by * k * 0.012);
      const bk = Math.pow(1 - t, 1.8) * 0.9;
      field.setColor(
        idx,
        (temp.digit.r * 0.8 + temp.accent.r * 0.2) * bk,
        (temp.digit.g * 0.8 + temp.accent.g * 0.2) * bk,
        (temp.digit.b * 0.8 + temp.accent.b * 0.2) * bk,
      );
      field.setSize(idx, 1.05 - t * 0.6);
    }
    if (m.y < -1.06 || m.x < -halfWidth(ctx) - 0.5) {
      m.active = false;
      m.next = ctx.time + 40 + hash(Math.floor(ctx.time * 11) % 977, 12) * 50;
      this.hideMeteor(ctx);
    }
  }
}

/* ---------------- 雾 ---------------- */

export class FogStyle implements StyleDef {
  readonly id = 'fog';
  readonly title = '雾';
  readonly settings: SettingSchema[] = [
    { key: 'fog.flow', label: '流速', kind: 'slider', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'fog.softness', label: '柔度', kind: 'slider', min: 0.5, max: 1.8, step: 0.05, default: 1 },
  ];

  private x = new Float32Array(ATMOS);
  private y = new Float32Array(ATMOS);

  enter(ctx: SceneContext) {
    const halfW = halfWidth(ctx);
    for (let i = 0; i < ATMOS; i++) {
      this.x[i] = (hash(i, 5) * 2 - 1) * halfW;
      this.y[i] = (hash(i, 6) * 2 - 1) * 1.12;
      ctx.field.setTarget(i, this.x[i], this.y[i]);
      const soft = ctx.settings.get<number>('fog.softness');
      ctx.field.setSize(i, (1.7 + hash(i, 7) * 0.7) * soft);
    }
    hideRest(ctx, ATMOS);
    this.update(ctx);
  }

  update(ctx: SceneContext) {
    const { field, temp } = ctx;
    const t = ctx.time;
    const halfW = halfWidth(ctx);
    const flow = ctx.settings.get<number>('fog.flow') * (1 + 0.6 * audio.bands().bass) * (1 - 0.5 * ctx.quiet);
    const soft = ctx.settings.get<number>('fog.softness');

    for (let i = 0; i < ATMOS; i++) {
      const layer = i % 2;
      // 双层反向慢卷 + 正弦摆动
      const dir = layer === 0 ? 1 : -1;
      const ph = hash(i, 8) * Math.PI * 2;
      this.x[i] += (dir * 0.012 + Math.sin(this.y[i] * 1.7 + t * 0.06 + ph) * 0.016) * flow * ctx.dt * 6;
      this.y[i] += Math.cos(this.x[i] * 1.3 - t * 0.05 + ph) * 0.010 * flow * ctx.dt * 6;
      if (this.x[i] > halfW) this.x[i] -= halfW * 2;
      if (this.x[i] < -halfW) this.x[i] += halfW * 2;
      if (this.y[i] > 1.15) this.y[i] = -1.15;
      if (this.y[i] < -1.15) this.y[i] = 1.15;
      field.setTarget(i, this.x[i], this.y[i]);
      field.setSize(i, (1.7 + hash(i, 7) * 0.7) * soft);

      const breathe = 1 + 0.14 * Math.sin(t * 0.11 + ph);
      const k = (0.15 + audio.bands().bass * 0.10) * breathe;
      // 雾色 = 余晖色打底、主色微提
      field.setColor(
        i,
        temp.trail.r * k + temp.digit.r * k * 0.32,
        temp.trail.g * k + temp.digit.g * k * 0.32,
        temp.trail.b * k + temp.digit.b * k * 0.32,
      );
    }
    field.uploadColors();
  }

  exit() {}
}

/* ---------------- 流体 ---------------- */

export class FluidStyle implements StyleDef {
  readonly id = 'fluid';
  readonly title = '流体';
  readonly settings: SettingSchema[] = [
    { key: 'fluid.flow', label: '流速', kind: 'slider', min: 0, max: 1, step: 0.05, default: 0.5 },
  ];

  private x = new Float32Array(ATMOS);
  private y = new Float32Array(ATMOS);

  enter(ctx: SceneContext) {
    const halfW = halfWidth(ctx);
    for (let i = 0; i < ATMOS; i++) {
      this.x[i] = (hash(i, 9) * 2 - 1) * halfW;
      this.y[i] = (hash(i, 10) * 2 - 1) * 1.1;
      ctx.field.setTarget(i, this.x[i], this.y[i]);
      ctx.field.setSize(i, 0.6 + hash(i, 11) * 0.25);
    }
    hideRest(ctx, ATMOS);
    this.update(ctx);
  }

  update(ctx: SceneContext) {
    const { field, temp } = ctx;
    const t = ctx.time;
    const halfW = halfWidth(ctx);
    const speed = ctx.settings.get<number>('fluid.flow') * (1 + 0.8 * audio.bands().bass) * (1 - 0.5 * ctx.quiet) * 0.055;

    for (let i = 0; i < ATMOS; i++) {
      const x = this.x[i];
      const y = this.y[i];
      // curl of stream ψ = sin(1.1x+0.23t)cos(0.9y−0.17t) + 0.6 sin(0.7x+0.6y+0.13t)
      const a = 1.1 * x + 0.23 * t;
      const b = 0.9 * y - 0.17 * t;
      const c = 0.7 * x + 0.6 * y + 0.13 * t;
      const dpsiDy = -0.9 * Math.sin(a) * Math.sin(b) + 0.36 * Math.cos(c);
      const dpsiDx = 1.1 * Math.cos(a) * Math.cos(b) + 0.42 * Math.cos(c);
      const vx = dpsiDy;
      const vy = -dpsiDx;

      this.x[i] += vx * speed * ctx.dt * 8;
      this.y[i] += vy * speed * ctx.dt * 8;
      if (this.x[i] > halfW) this.x[i] -= halfW * 2;
      if (this.x[i] < -halfW) this.x[i] += halfW * 2;
      if (this.y[i] > 1.12) this.y[i] -= 2.24;
      if (this.y[i] < -1.12) this.y[i] += 2.24;
      field.setTarget(i, this.x[i], this.y[i]);

      // 亮度随流速起伏，像墨的浓淡
      const mag = Math.min(1, Math.abs(vx) + Math.abs(vy));
      const k = 0.16 + mag * 0.22;
      field.setColor(
        i,
        temp.trail.r * k + temp.digit.r * k * 0.22,
        temp.trail.g * k + temp.digit.g * k * 0.22,
        temp.trail.b * k + temp.digit.b * k * 0.22,
      );
    }
    field.uploadColors();
  }

  exit() {}
}
