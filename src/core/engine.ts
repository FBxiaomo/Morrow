import * as THREE from 'three';
import { ParticleField } from './field';
import { PALETTE, VISUAL, BUDGET } from './palette';
import { colorTemp } from './colortemp';
import type { SettingsStore } from '../data/settings';
import type { Scene, SceneContext } from '../scenes/types';

/**
 * 引擎：只负责渲染、主循环、环境（色温）。
 * 不含场景逻辑，不含任何鼠标交互——画面只对真实世界反应。
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly field: ParticleField;

  private settings: SettingsStore;
  private scene_: Scene | null = null;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private quiet = 0;
  private quietTarget = 0;
  private disposed = false;
  private exposureScale = 1;
  private frameHooks: Array<(dt: number, time: number, temp: ReturnType<typeof colorTemp>) => void> = [];

  constructor(canvas: HTMLCanvasElement, settings: SettingsStore) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(PALETTE.background, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    // 正交相机：纵向可视范围为 [-1, 1]，横向按宽高比展开
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.z = 10;

    this.field = new ParticleField({ count: BUDGET.total, scene: this.scene });

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.field.setPixelRatio(this.renderer.getPixelRatio());

    const aspect = w / h;
    const halfH = 1;
    const halfW = aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();

    // 点尺寸基准：随视口高度缩放，保证不同分辨率下观感一致
    const basePx = Math.max(2.2, h / 300);
    this.field.setPointScale(basePx);
  };

  /** 世界单位 → 屏幕像素（供 UI 定位） */
  worldToScreen = (x: number, y: number, out: THREE.Vector2) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    out.set(((x + this.camera.right) / (this.camera.right * 2)) * w, ((this.camera.top - y) / (this.camera.top * 2)) * h);
    return out;
  };

  /** 逐帧回调（雨丝、水珠等环境层用），返回取消函数 */
  addFrameHook(cb: (dt: number, time: number, temp: ReturnType<typeof colorTemp>) => void): () => void {
    this.frameHooks.push(cb);
    return () => {
      this.frameHooks = this.frameHooks.filter((h) => h !== cb);
    };
  }

  setQuiet(on: boolean) {
    this.quietTarget = on ? 1 : 0;
  }

  /** 用户自定义曝光倍率（1.0 = 默认） */
  setExposureScale(scale: number) {
    this.exposureScale = Math.max(0.2, Math.min(2, scale));
  }

  get isQuiet() {
    return this.quietTarget > 0.5;
  }

  setScene(scene: Scene) {
    this.scene_?.exit();
    this.scene_ = scene;
    scene.enter(this.buildContext(colorTemp()));
  }

  private buildContext(temp: ReturnType<typeof colorTemp>): SceneContext {
    return {
      field: this.field,
      worldToScreen: this.worldToScreen,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      time: this.elapsed,
      dt: 0,
      quiet: this.quiet,
      temp,
      settings: this.settings,
    };
  }

  start() {
    const loop = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.elapsed += dt;

      this.quiet += (this.quietTarget - this.quiet) * Math.min(1, dt * 6);

      const temp = colorTemp();
      const ctx = this.buildContext(temp);
      ctx.dt = dt;

      this.scene_?.update(ctx);
      for (const hook of this.frameHooks) hook(dt, this.elapsed, temp);

      const motion = VISUAL.quietMotion + (1 - VISUAL.quietMotion) * (1 - this.quiet);
      this.field.step(dt, motion);
      this.field.setExposure(
        (VISUAL.exposure * (1 - this.quiet) + VISUAL.quietExposure * this.quiet) * this.exposureScale * temp.light,
      );
      this.field.uploadColors();

      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}
