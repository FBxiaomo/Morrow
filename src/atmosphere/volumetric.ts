/**
 * Volumetric sky enhancement, based on the existing Morrow density renderer.
 * Visual references: https://www.shadertoy.com/view/XslGRr and
 * https://github.com/zhangyili199862/three-cesium-examples/blob/dev/threeExamples/shader/whiteCloud.js
 * Bounded ray marching, front-to-back light absorption, cached between updates.
 */

const VERTEX = `attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * .5 + .5;
  gl_Position = vec4(position, 0., 1.);
}`;

const FRAGMENT = `precision highp float;
varying vec2 uv;
uniform vec2 resolution;
uniform float seconds;
uniform float cover;      // 0-1 云量
uniform float night;      // 0-1 夜晚权重
uniform float dusk;       // 0-1 黄昏权重

// ---- 值噪声（GPU 版，自研哈希）----
float hash13(vec3 p) {
  p = fract(p * .1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x) {
  vec3 p = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  float n000 = hash13(p);
  float n100 = hash13(p + vec3(1., 0., 0.));
  float n010 = hash13(p + vec3(0., 1., 0.));
  float n110 = hash13(p + vec3(1., 1., 0.));
  float n001 = hash13(p + vec3(0., 0., 1.));
  float n101 = hash13(p + vec3(1., 0., 1.));
  float n011 = hash13(p + vec3(0., 1., 1.));
  float n111 = hash13(p + vec3(1., 1., 1.));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

// ---- fBm 云密度：上疏下密，风沿时间推移 ----
float cloudDensity(vec3 p) {
  vec3 q = p;
  q.x -= seconds * .035;
  q.z -= seconds * .012;
  float f = 0.;
  float a = .55;
  for (int i = 0; i < 5; i++) {
    f += a * vnoise(q);
    q = q * 2.07 + vec3(11.3, 7.1, 5.7);
    a *= .52;
  }
  // 高度剖面：底部平坦（积云感），顶部渐稀
  float profile = smoothstep(.0, .35, p.y) * (1. - smoothstep(.5, 1., p.y));
  float cloudy = smoothstep(.4, .6, cover) * (1. - smoothstep(.72, .9, cover));
  float d = f - mix(.78, .30, cover) + cloudy * .055;
  return clamp(d * 3.4 * profile, 0., 1.);
}

void main() {
  vec2 fragPx = uv * resolution;
  // 相机：略微上仰，视线穿过云层
  vec2 p = (fragPx - .5 * resolution) / resolution.y;
  vec3 ro = vec3(0., -0.18, 0.);
  vec3 rd = normalize(vec3(p.x, p.y + .34, 1.15));

  // ---- 光照颜色随昼夜 ----
  vec3 sunTint  = mix(vec3(1., .96, .88), vec3(1., .74, .45), dusk);
  sunTint       = mix(sunTint, vec3(.55, .62, .78), night * .85);
  vec3 skyTint  = mix(vec3(.62, .72, .84), vec3(.63, .52, .58), dusk);
  skyTint       = mix(skyTint, vec3(.20, .26, .38), night);
  vec3 sunDir   = normalize(mix(vec3(.35, .5, -.75), vec3(.5, .12, -.8), dusk));

  // ---- raymarch（前→后合成）----
  vec4 sum = vec4(0.);
  float t = .12 + hash13(vec3(fragPx, 2.71)) * .08; // 固定抖动，避免静止区域闪烁
  const int STEPS = 38;
  for (int i = 0; i < STEPS; i++) {
    vec3 pos = ro + t * rd;
    if (pos.y > 1.05) break;
    float den = cloudDensity(pos);
    if (den > .004) {
      // 单次方向导数近似光照（比密度梯度省 2 次采样）
      float dif = clamp((den - cloudDensity(pos + .24 * sunDir)) * 2.4, 0., 1.);
      float overcast = smoothstep(.72, 1., cover);
      vec3 lin = (skyTint * .5 + sunTint * (.38 + .7 * dif)) * (1. - overcast * .35);
      vec3 col = mix(vec3(1., .97, .92), vec3(.62, .66, .74), den);
      col = mix(col, vec3(.5, .54, .62), overcast * .6);
      col *= lin;
      float alpha = 1. - exp(-den * .34);
      // 远处融进天色（深度雾）
      float fogK = 1. - exp(-.16 * t * t);
      col = mix(col, skyTint * .8, fogK);
      sum.rgb += col * alpha * (1. - sum.a);
      sum.a += alpha * (1. - sum.a);
    }
    t += .1 + t * .03;
    if (sum.a > .96) break;
  }

  // 输出：云层合成（透明度承载，背景由 2D 天空提供）
  vec3 outCol = sum.rgb / max(sum.a, .0001) * (1.28 - night * .45 - dusk * .08);
  // Keep photographed mountains and foreground unobscured. Premultiplied output.
  float skyMask = smoothstep(.30, .61, uv.y);
  float alpha = clamp(sum.a * .9, 0., .9) * smoothstep(.22, .55, cover) * skyMask;
  gl_FragColor = vec4(clamp(outCol, 0., 1.) * alpha, alpha);
}`;


export interface CloudFrame {
  width: number; height: number; time: number; cover: number;
  night: number; dusk: number; still: boolean; lite: boolean;
}

export class VolumetricClouds {
  readonly canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private lost = false;
  private lastDraw = -Infinity;
  private lastKey = '';
  private draws = 0;
  private phaseNight = 0;
  private phaseDusk = 0;

  static create(invalidate: () => void): VolumetricClouds | null {
    try { return new VolumetricClouds(invalidate); }
    catch { return null; }
  }

  private constructor(private invalidate: () => void) {
    const gl = this.canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('Cloud WebGL unavailable');
    this.gl = gl;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    try {
      for (const [kind, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error('Cloud shader unavailable');
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Cloud shader compilation failed');
      }
      program = gl.createProgram();
      if (!program) throw new Error('Cloud program unavailable');
      for (const shader of shaders) gl.attachShader(program, shader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Cloud shader link failed');
      buffer = gl.createBuffer();
      if (!buffer) throw new Error('Cloud buffer unavailable');
      this.program = program; this.buffer = buffer;
      gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const name of ['resolution', 'seconds', 'cover', 'night', 'dusk']) this.uniforms[name] = gl.getUniformLocation(program, name);
    } catch (error) {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw error;
    } finally { for (const shader of shaders) gl.deleteShader(shader); }
    this.canvas.className = 'cloud-volume';
    this.canvas.hidden = true; this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    document.body.append(this.canvas);
  }

  private contextLost = (event: Event) => {
    event.preventDefault(); this.lost = true; this.invalidate();
  };
  get ready() { return !this.lost && !this.gl.isContextLost(); }
  get diagnostics() { return { renderer: 'webgl', draws: this.draws, width: this.canvas.width, height: this.canvas.height }; }

  render(frame: CloudFrame) {
    if (!this.ready) return false;
    const gl = this.gl;
    const scale = Math.min(.6, Math.sqrt((frame.lite ? 90_000 : 180_000) / (frame.width * frame.height)));
    const width = Math.max(1, Math.floor(frame.width * scale)), height = Math.max(1, Math.floor(frame.height * scale));
    const phaseRate = frame.still ? 1 : Math.min(1, Math.max(0, frame.time - this.lastDraw) * 1.8);
    this.phaseNight += (frame.night - this.phaseNight) * phaseRate;
    this.phaseDusk += (frame.dusk - this.phaseDusk) * phaseRate;
    const key = [width, height, Math.round(frame.cover * 30), Math.round(this.phaseNight * 24), Math.round(this.phaseDusk * 24)].join(':');
    if (key === this.lastKey && (frame.still || frame.time - this.lastDraw < 1 / (frame.lite ? 10 : 18))) return true;
    this.lastKey = key; this.lastDraw = frame.time;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(this.uniforms.resolution, width, height);
    gl.uniform1f(this.uniforms.seconds, frame.time);
    gl.uniform1f(this.uniforms.cover, frame.cover);
    gl.uniform1f(this.uniforms.night, this.phaseNight);
    gl.uniform1f(this.uniforms.dusk, this.phaseDusk);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.draws++;
    return true;
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove(); this.canvas.width = this.canvas.height = 1;
  }
}
