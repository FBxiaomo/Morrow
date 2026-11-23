import * as THREE from 'three';
import { VISUAL } from './palette';

const VERT = String.raw`
  uniform float uPointScale;
  uniform float uPixelRatio;
  uniform vec3 uClickPos;
  uniform float uClickStrength;

  attribute float aSize;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vGlow;

  void main() {
    vec3 p = position;

    // 脉冲涟漪：克制的水波纹，位移不超过字高的 4%。
    // 由样式在整分、阶段切换等时刻调用，与鼠标无关
    vec3 d = p - uClickPos;
    float dist = length(d);
    float ripple = uClickStrength * exp(-dist * dist * 60.0);
    p += normalize(d + vec3(1e-5)) * ripple;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vColor = aColor;
    vGlow = ripple;

    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, aSize * uPointScale * uPixelRatio);
  }
`;

const FRAG = String.raw`
  uniform float uExposure;
  uniform float uMaxLum;
  varying vec3 vColor;
  varying float vGlow;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    // 柔和的圆形点，边缘快速衰减
    float alpha = smoothstep(0.5, 0.12, d);
    alpha *= alpha;

    vec3 col = vColor * uExposure * (0.72 + vGlow * 0.6);

    // 亮度钳制：加法混合下也不会无限叠加
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    if (lum > uMaxLum) col *= uMaxLum / lum;

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

export interface FieldOptions {
  count: number;
  scene: THREE.Scene;
}

/**
 * 粒子场：负责缓冲、弹簧物理、GPU 上传。
 * 场景只通过 setTarget / setColor 写数据，不直接碰 Three.js 对象。
 */
export class ParticleField {
  readonly count: number;
  readonly points: THREE.Points;

  private positions: Float32Array;
  private targets: Float32Array;
  private velocities: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;

  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private click = { active: false, x: 0, y: 0, strength: 0 };

  constructor(options: FieldOptions) {
    this.count = options.count;
    this.positions = new Float32Array(this.count * 3);
    this.targets = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPointScale: { value: 900 },
        uPixelRatio: { value: 1 },
        uExposure: { value: VISUAL.exposure },
        uMaxLum: { value: VISUAL.maxLuminance },
        uClickPos: { value: new THREE.Vector3(999, 999, 0) },
        uClickStrength: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    options.scene.add(this.points);

    // 初始全部聚在原点，避免首帧出现随机散点
    this.positions.fill(0);
    this.geometry.setDrawRange(0, this.count);
  }

  get uniforms() {
    return this.material.uniforms;
  }

  /** 一次性写入目标位置（初始化用，立即到位） */
  snapTargets(fn: (i: number, out: THREE.Vector3) => void) {
    const v = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      fn(i, v);
      const ix = i * 3;
      this.targets[ix] = v.x;
      this.targets[ix + 1] = v.y;
      this.targets[ix + 2] = v.z;
      this.positions[ix] = v.x;
      this.positions[ix + 1] = v.y;
      this.positions[ix + 2] = v.z;
    }
    this.velocities.fill(0);
    this.uploadPositions();
  }

  /** 立即归位一段粒子：位置=目标、速度清零（流星等反复显隐的号段） */
  snapRange(from: number, to: number, x: number, y: number) {
    for (let i = from; i <= to && i < this.count; i++) {
      const ix = i * 3;
      this.positions[ix] = x;
      this.positions[ix + 1] = y;
      this.targets[ix] = x;
      this.targets[ix + 1] = y;
      this.velocities[ix] = 0;
      this.velocities[ix + 1] = 0;
    }
    this.uploadPositions();
  }

  setTarget(i: number, x: number, y: number, z = 0) {
    const ix = i * 3;
    this.targets[ix] = x;
    this.targets[ix + 1] = y;
    this.targets[ix + 2] = z;
  }

  setColor(i: number, r: number, g: number, b: number) {
    const ix = i * 3;
    this.colors[ix] = r;
    this.colors[ix + 1] = g;
    this.colors[ix + 2] = b;
  }

  setColorHex(i: number, color: THREE.Color) {
    this.setColor(i, color.r, color.g, color.b);
  }

  setSize(i: number, size: number) {
    this.sizes[i] = size;
  }

  setPointScale(scale: number) {
    this.material.uniforms.uPointScale.value = scale;
  }

  setPixelRatio(ratio: number) {
    this.material.uniforms.uPixelRatio.value = ratio;
  }

  setExposure(exposure: number) {
    this.material.uniforms.uExposure.value = exposure;
  }

  /** 绽放：从中心向外的轻柔扩散脉冲，整分等时刻使用。幅度微小（字高的 3% 量级） */
  bloom(strength = 1, radius = 2.4) {
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      const x = this.positions[ix];
      const y = this.positions[ix + 1];
      const d = Math.sqrt(x * x + y * y);
      if (d > radius || d < 1e-4) continue;
      const f = ((1 - d / radius) * 0.01 * strength) / d;
      this.velocities[ix] += x * f;
      this.velocities[ix + 1] += y * f;
    }
  }

  /** 脉冲涟漪：局部坐标。内部特效 API，供样式在整分等时刻使用 */
  pulse(x: number, y: number, strength = 1) {
    this.click.active = true;
    this.click.x = x;
    this.click.y = y;
    this.click.strength = strength;
    this.material.uniforms.uClickPos.value.set(x, y, 0);
    this.material.uniforms.uClickStrength.value = 0.016 * strength;

    // 物理冲量：极轻的推挤，像手指点了一下水面
    const radius = 0.16;
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      const dx = this.positions[ix] - x;
      const dy = this.positions[ix + 1] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const d = Math.sqrt(d2) + 1e-5;
      const f = (1 - d / radius) * 0.028;
      this.velocities[ix] += (dx / d) * f;
      this.velocities[ix + 1] += (dy / d) * f;
    }
  }

  /** 每帧推进物理，dt 单位秒 */
  step(dt: number, motion: number) {
    const spring = 1 - Math.pow(0.0009, dt);
    const damping = Math.pow(0.0004, dt);
    const pos = this.positions;
    const tgt = this.targets;
    const vel = this.velocities;
    const n = this.count * 3;

    for (let ix = 0; ix < n; ix += 3) {
      vel[ix] += (tgt[ix] - pos[ix]) * spring;
      vel[ix + 1] += (tgt[ix + 1] - pos[ix + 1]) * spring;
      vel[ix + 2] += (tgt[ix + 2] - pos[ix + 2]) * spring;

      vel[ix] *= damping;
      vel[ix + 1] *= damping;
      vel[ix + 2] *= damping;

      pos[ix] += vel[ix] * motion;
      pos[ix + 1] += vel[ix + 1] * motion;
      pos[ix + 2] += vel[ix + 2] * motion;
    }

    // 涟漪缓慢消散
    if (this.click.strength > 0) {
      this.click.strength *= Math.pow(0.08, dt);
      this.material.uniforms.uClickStrength.value = 0.06 * this.click.strength;
      if (this.click.strength < 0.01) {
        this.click.strength = 0;
        this.material.uniforms.uClickPos.value.set(999, 999, 0);
        this.material.uniforms.uClickStrength.value = 0;
      }
    }

    this.uploadPositions();
  }

  private uploadPositions() {
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  uploadColors() {
    (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** 把局部坐标转到世界坐标（供调试标记使用） */
  localToWorld(x: number, y: number, out: THREE.Vector3) {
    return out.set(x, y, 0).applyMatrix4(this.points.matrixWorld);
  }
}
