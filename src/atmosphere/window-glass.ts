/**
 * Rain on the outside of a pane: displacement, condensation and clear water trails.
 * Independently implemented for Morrow; visual reference:
 * https://github.com/Lavender-z/demo/tree/master/雨特效（css%2Bjs）
 * No external textures, libraries or animation loop are needed.
 */
const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * .5 + .5;
  gl_Position = vec4(position, 0., 1.);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 uv;
uniform sampler2D scenery;
uniform vec2 resolution;
uniform float seconds;
uniform float rainfall;

float randomCell(vec2 cell) {
  return fract(sin(dot(cell, vec2(41.73, 289.17))) * 14831.23);
}

// XY = refractive surface slope, Z = water-cleared condensation, W = rim light.
vec4 fallingWater(vec2 pixels, vec2 spacing, float seed, float speed) {
  float column = floor(pixels.x / spacing.x);
  float stagger = randomCell(vec2(column, seed));
  vec2 grid = pixels / spacing;
  grid.y -= seconds * speed * (.55 + stagger * .8);
  grid.y += stagger * 7.;
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - .5;
  float variation = randomCell(cell + seed);
  float visible = smoothstep(variation, variation + .12, rainfall);
  float bend = sin((local.y + cell.y) * 3.8 + stagger * 11.);
  float center = (stagger - .5) * .65 + bend * .035;
  float radius = .053 + variation * .044;
  vec2 q = (local - vec2(center, .12)) / vec2(radius, radius * .8);
  float lengthQ = length(q);
  float body = 1. - smoothstep(.78, 1., lengthQ);
  vec2 normal = q * sqrt(max(0., 1. - dot(q, q))) * body;

  // Small beads remain in the wake; the broader streak exposes sharper scenery.
  float behind = 1. - smoothstep(-.01, .10, local.y);
  float channel = (1. - smoothstep(.018, .052, abs(local.x - center))) * behind;
  float beadY = (fract((local.y + .5) * 13. + variation) - .5) / 13.;
  vec2 tiny = vec2((local.x - center) / (radius * .37), beadY / .012);
  float tinyBody = (1. - smoothstep(.65, 1., length(tiny))) * behind;
  normal += tiny * tinyBody * .27;
  float rim = exp(-pow((lengthQ - .87) * 14., 2.));
  float light = rim * (.05 - q.y * .055) - body * .012;
  return vec4(normal * radius * spacing.x, max(body, channel * .85), light) * visible;
}

vec4 restingWater(vec2 pixels) {
  vec2 grid = pixels / 26.;
  vec2 cell = floor(grid), p = fract(grid);
  float seed = randomCell(cell + 43.);
  vec2 center = vec2(randomCell(cell + 15.), randomCell(cell - 28.)) * .6 + .2;
  float radius = .022 + seed * .052;
  vec2 q = (p - center) / vec2(radius, radius * 1.25);
  float body = 1. - smoothstep(.65, 1., length(q));
  float visible = smoothstep(seed, seed + .15, rainfall * .65);
  return vec4(q * body * radius * 16., body, body * .012) * visible;
}

void main() {
  vec2 pixels = vec2(uv.x, 1. - uv.y) * resolution;
  vec4 water = fallingWater(pixels, vec2(112., 196.), 9.2, .21);
  water += fallingWater(pixels + vec2(48., 93.), vec2(76., 143.), 27.1, .31) * .75;
  water += restingWater(pixels);
  vec2 shift = vec2(water.x, -water.y) / resolution * 2.8;
  vec2 sampleUV = clamp(uv + shift, .001, .999);
  vec3 crisp = texture2D(scenery, sampleUV).rgb;
  float clearTrail = clamp(water.z, 0., 1.);
  float blurRadius = (1. - clearTrail * .94) * rainfall * 5.5;
  vec2 stepUV = vec2(blurRadius) / resolution;
  vec3 soft = crisp * .2;
  soft += texture2D(scenery, clamp(sampleUV + stepUV * vec2(1., .4), .001, .999)).rgb * .1;
  soft += texture2D(scenery, clamp(sampleUV + stepUV * vec2(-1., -.4), .001, .999)).rgb * .1;
  soft += texture2D(scenery, clamp(sampleUV + stepUV * vec2(.4, -1.), .001, .999)).rgb * .1;
  soft += texture2D(scenery, clamp(sampleUV + stepUV * vec2(-.4, 1.), .001, .999)).rgb * .1;
  soft += texture2D(scenery, clamp(sampleUV + stepUV * vec2(.7, .8), .001, .999)).rgb * .1;
  soft += texture2D(scenery, clamp(sampleUV + stepUV * vec2(-.7, -.8), .001, .999)).rgb * .1;
  soft += texture2D(scenery, clamp(sampleUV + stepUV * vec2(.8, -.7), .001, .999)).rgb * .1;
  soft += texture2D(scenery, clamp(sampleUV + stepUV * vec2(-.8, .7), .001, .999)).rgb * .1;
  vec3 color = mix(soft, crisp, clearTrail * .85);
  color += water.w * rainfall;
  color = mix(color, color * vec3(.98, 1.005, 1.02), rainfall * .4);
  gl_FragColor = vec4(clamp(color, 0., 1.), 1.);
}`;

export class WindowGlass {
  readonly canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private texture: WebGLTexture;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private lost = false;
  private lastUpload = -Infinity;
  private draws = 0;
  private uploads = 0;

  static create(invalidate: () => void): WindowGlass | null {
    try { return new WindowGlass(invalidate); }
    catch { return null; }
  }

  private constructor(private invalidate: () => void) {
    const gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let texture: WebGLTexture | null = null;
    try {
      for (const [kind, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error('Shader unavailable');
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Glass shader compilation failed');
      }
      program = gl.createProgram();
      if (!program) throw new Error('Program unavailable');
      for (const shader of shaders) gl.attachShader(program, shader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Glass shader link failed');
      buffer = gl.createBuffer(); texture = gl.createTexture();
      if (!buffer || !texture) throw new Error('Glass resources unavailable');
      this.program = program; this.buffer = buffer; this.texture = texture;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      for (const name of ['scenery', 'resolution', 'seconds', 'rainfall']) this.uniforms[name] = gl.getUniformLocation(program, name);
      gl.uniform1i(this.uniforms.scenery, 0);
    } catch (error) {
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw error;
    } finally { for (const shader of shaders) gl.deleteShader(shader); }
    this.canvas.className = 'window-glass';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    document.body.append(this.canvas);
  }

  private contextLost = (event: Event) => {
    event.preventDefault(); this.lost = true; this.canvas.style.visibility = 'hidden';
    this.invalidate();
  };

  get ready() { return !this.lost && !this.gl.isContextLost(); }
  get diagnostics() { return { renderer: 'webgl', draws: this.draws, uploads: this.uploads, width: this.canvas.width, height: this.canvas.height }; }

  render(source: HTMLCanvasElement, width: number, height: number, time: number, rain: number, still: boolean) {
    if (!this.ready) return false;
    const gl = this.gl;
    // Bound fragment work at large display sizes. The photograph remains full resolution.
    const scale = Math.min(1, Math.sqrt(1_800_000 / (width * height)));
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const resized = this.canvas.width !== w || this.canvas.height !== h;
    if (resized) { this.canvas.width = w; this.canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Background motion is slow; the lens itself can update at the full draw cadence.
    if (resized || still || time - this.lastUpload >= 1 / 30) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.lastUpload = time; this.uploads++;
    }
    gl.uniform2f(this.uniforms.resolution, width, height);
    gl.uniform1f(this.uniforms.seconds, time);
    gl.uniform1f(this.uniforms.rainfall, Math.max(0, Math.min(1, rain)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.draws++;
    return true;
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    const gl = this.gl;
    gl.deleteTexture(this.texture); gl.deleteBuffer(this.buffer); gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove(); this.canvas.width = this.canvas.height = 1;
  }
}
