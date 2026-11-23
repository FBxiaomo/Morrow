import type * as THREE from 'three';
import type { ParticleField } from '../core/field';
import type { TempColors } from '../core/colortemp';
import type { SettingsStore } from '../data/settings';

export interface SceneContext {
  /** 粒子场，场景通过它写目标位置 */
  field: ParticleField;
  /** 世界单位 / 像素，用于把 UI 定位到世界坐标 */
  worldToScreen(x: number, y: number, out: THREE.Vector2): THREE.Vector2;
  /** 当前视口尺寸（CSS 像素） */
  viewport: { width: number; height: number };
  /** 秒级时间戳 */
  time: number;
  /** 帧间隔（秒） */
  dt: number;
  /** 安静模式 0 或 1 */
  quiet: number;
  /** 当前时段色温（对象复用，勿长期持有） */
  temp: TempColors;
  /** 设置存储，样式从这里读自己的设置 */
  settings: SettingsStore;
}

export interface Scene {
  readonly id: string;
  readonly title: string;
  enter(ctx: SceneContext): void;
  update(ctx: SceneContext): void;
  exit(): void;
}
