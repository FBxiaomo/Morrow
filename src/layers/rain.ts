import * as THREE from 'three';
import type { SettingsStore } from '../data/settings';

/**
 * 雨丝（背景层）：WebGL LineSegments，渲染顺序在粒子之前。
 * 雨=斜落细丝、雪=缓飘、雾=漂移；强度随天气分类平滑过渡（约 4 秒渐入渐出）。
 */

export type PrecipKind = 'rain' | 'snow' | 'drift';

interface Strand {
  x: number;
  y: number;
  speed: number;
  len: number;
  phase: number;
}

const COUNT = 140;

export class RainLayer {
  readonly object: THREE.LineSegments;
  private strands: Strand[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private intensity = 0;      // 当前强度（平滑后）
  private target = 0;
  private kind: PrecipKind = 'rain';
  private store: SettingsStore;

  constructor(scene: THREE.Scene, store: SettingsStore) {
    this.store = store;
    this.positions = new Float32Array(COUNT * 6);
    this.colors = new Float32Array(COUNT * 6);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.LineSegments(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = -1; // 在粒子数字之前绘制 → 真背景
    scene.add(this.object);

    for (let i = 0; i < COUNT; i++) {
      this.strands.push({
        x: Math.random() * 2.4 - 1.2,
        y: Math.random() * 2.4 - 1.2,
        speed: 0.75 + Math.random() * 0.5,
        len: 0.1 + Math.random() * 0.16,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.write(0, 0.2);
    this.geometry.setDrawRange(0, 0);
  }

  /** 天气驱动：kind 决定形态，level 0–1 决定密度/透明度 */
  setWeather(kind: PrecipKind, level: number) {
    this.kind = kind;
    this.target = Math.min(1, Math.max(0, level));
    if (this.target > 0) {
      this.geometry.setDrawRange(0, COUNT * 2);
    }
  }

  /** 当前平滑强度（探针用） */
  get currentIntensity() {
    return this.intensity;
  }

  update(dt: number, time: number, trail?: { r: number; g: number; b: number }) {
    // 4 秒量级的渐入渐出，符合「永不硬切」
    const rate = dt / 4;
    if (this.intensity < this.target) this.intensity = Math.min(this.target, this.intensity + rate);
    else if (this.intensity > this.target) this.intensity = Math.max(this.target, this.intensity - rate);

    if (this.intensity <= 0.001 && this.target === 0) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const visualOn = this.store.get<boolean>('weather.visual');
    const alpha = visualOn ? this.intensity : 0;

    for (let i = 0; i < COUNT; i++) {
      const s = this.strands[i];
      if (this.kind === 'rain') {
        s.y -= s.speed * dt * 1.15;
        s.x += s.speed * dt * 0.16; // 轻微斜落
      } else if (this.kind === 'snow') {
        s.y -= s.speed * dt * 0.16;
        s.x += Math.sin(time * 0.8 + s.phase) * dt * 0.1; // 缓飘
      } else {
        s.y -= s.speed * dt * 0.05;
        s.x += Math.sin(time * 0.5 + s.phase) * dt * 0.06; // 漂移
      }
      if (s.y < -1.3) {
        s.y = 1.3;
        s.x = Math.random() * 2.4 - 1.2;
      }
      if (s.x > 1.3) s.x = -1.3;
      if (s.x < -1.3) s.x = 1.3;
    }

    this.write(time, alpha, trail);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    if (alpha <= 0.002 && this.target === 0) this.geometry.setDrawRange(0, 0);
  }

  /** 丝的颜色取自色温 trail（冷调），头部亮尾部淡 */
  private write(time: number, alpha: number, trail?: { r: number; g: number; b: number }) {
    const r = trail ? trail.r : 0.23, g = trail ? trail.g : 0.2, b = trail ? trail.b : 0.16;
    for (let i = 0; i < COUNT; i++) {
      const s = this.strands[i];
      const ix = i * 6;
      const slant = this.kind === 'rain' ? s.len * 0.14 : Math.sin(time + s.phase) * 0.012;
      this.positions[ix] = s.x;
      this.positions[ix + 1] = s.y;
      this.positions[ix + 3] = s.x + slant;
      this.positions[ix + 4] = s.y + s.len;
      // 头亮尾淡（整体压到柔光级别，不与数字争辉）
      this.colors[ix] = r * alpha * 0.22;
      this.colors[ix + 1] = g * alpha * 0.22;
      this.colors[ix + 2] = b * alpha * 0.22;
      this.colors[ix + 3] = r * alpha * 0.45;
      this.colors[ix + 4] = g * alpha * 0.45;
      this.colors[ix + 5] = b * alpha * 0.45;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
