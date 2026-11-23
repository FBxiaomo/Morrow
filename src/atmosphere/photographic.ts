import { SCENERY } from '../data/scenery';
import type { WeatherCategory } from '../data/weather';

export interface SceneryFrame {
  theme: string;
  width: number;
  height: number;
  phase: 'day' | 'dusk' | 'night';
  dark: number;
  clouds: number;
  fog: number;
  time: number;
  dt: number;
  still: boolean;
  realistic: boolean;
  volumetric?: boolean;
  category: WeatherCategory;
  intensity: number;
  visual: boolean;
  lightning: boolean;
}

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function valueNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx) * (1 - fy)
    + (hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx) * fy;
}

/** Image plates are local, decoded once, and graded only when lighting changes. */
export class PhotographicScenery {
  private images = new Map<string, HTMLImageElement>();
  private loading = new Set<string>();
  private plate = document.createElement('canvas');
  private plateContext = this.plate.getContext('2d', { alpha: false })!;
  private cacheKey = '';
  private dusk = 0;
  private night = 0;
  private clouds: HTMLCanvasElement | null = null;
  private haze: HTMLCanvasElement | null = null;
  private projection = document.createElement('canvas');
  private projectionMask: HTMLCanvasElement | null = null;
  private maskSource: HTMLImageElement | null = null;
  ready = false;

  constructor(private invalidate: () => void) {}

  releaseDetail() {
    for (const texture of [this.clouds, this.haze]) {
      if (texture) texture.width = texture.height = 1;
    }
    this.clouds = null; this.haze = null;
  }

  load(theme: string) {
    const url = SCENERY[theme] || SCENERY.sky;
    if (this.images.has(url) || this.loading.has(url)) return;
    this.loading.add(url);
    const image = new Image();
    image.onload = () => {
      this.images.set(url, image);
      this.loading.delete(url);
      this.cacheKey = '';
      this.invalidate();
    };
    image.onerror = () => { this.loading.delete(url); };
    image.src = url;
  }

  draw(ctx: CanvasRenderingContext2D, frame: SceneryFrame): boolean {
    const { theme, width: w, height: h } = frame;
    const image = this.images.get(SCENERY[theme] || SCENERY.sky);
    this.ready = !!image;
    if (!image) { this.load(theme); return false; }
    const rate = frame.still ? 1 : Math.min(1, frame.dt * 2);
    this.dusk += ((frame.phase === 'dusk' ? 1 : 0) - this.dusk) * rate;
    this.night += ((frame.phase === 'night' ? 1 : 0) - this.night) * rate;
    const key = [theme, w, h, Math.round(this.dusk * 30), Math.round(this.night * 30), Math.round(frame.dark * 30)].join(':');
    if (this.cacheKey !== key) {
      this.cacheKey = key;
      this.plate.width = w; this.plate.height = h;
      const c = this.plateContext;
      const scale = Math.max(w / image.width, h / image.height);
      c.filter = `saturate(${1 - frame.dark * .55})`;
      c.drawImage(image, (w - image.width * scale) / 2, (h - image.height * scale) / 2, image.width * scale, image.height * scale);
      c.filter = 'none';
      // Studio remains a readable indoor scene; weather changes its reflected light.
      const indoor = theme === 'studio';
      const shade = indoor ? this.night * .2 + frame.dark * .12 : this.night * .68 + frame.dark * .36;
      c.fillStyle = `rgba(9,23,45,${shade})`; c.fillRect(0, 0, w, h);
      if (this.dusk > .01) {
        const glow = c.createLinearGradient(0, 0, 0, h);
        glow.addColorStop(0, `rgba(57,49,78,${this.dusk * .24})`);
        glow.addColorStop(.65, `rgba(235,157,105,${this.dusk * (indoor ? .12 : .3)})`);
        glow.addColorStop(1, 'rgba(68,54,62,0)');
        c.fillStyle = glow; c.fillRect(0, 0, w, h);
      }
      if (!indoor) {
        // A very gradual central veil preserves white type over natural cloud detail.
        const veil = c.createLinearGradient(0, 0, 0, h);
        veil.addColorStop(0, 'rgba(6,17,31,.14)');
        veil.addColorStop(.43, 'rgba(6,17,31,.17)');
        veil.addColorStop(1, 'rgba(6,17,31,.19)');
        c.fillStyle = veil; c.fillRect(0, 0, w, h);
      }
    }
    ctx.drawImage(this.plate, 0, 0, w, h);
    if (theme === 'studio' && frame.visual) this.drawIndoorLight(ctx, frame, image);
    else if (frame.realistic) this.drawAtmosphere(ctx, frame);
    else if (this.clouds || this.haze) {
      // Release high-detail textures when the user chooses the light renderer.
      this.releaseDetail();
    }
    return true;
  }

  /** How much direct light still reaches the room: weather, dusk and night all take it away. */
  private sunLevel(f: SceneryFrame) {
    const base: Record<WeatherCategory, number> = { clear: 1, cloudy: .55, overcast: .2, rain: .3, snow: .5, fog: .4, thunder: .16 };
    let sun = base[f.category] * (1 - .72 * this.night) * (1 - .35 * this.dusk);
    // Clouds breathing across the sun: a slow swell, never a flicker.
    sun *= 1 - .18 * f.clouds * (.5 + .5 * Math.sin(f.time * .06));
    return Math.max(0, Math.min(1, sun));
  }

  private drawIndoorLight(c: CanvasRenderingContext2D, f: SceneryFrame, image: HTMLImageElement) {
    const { width: w, height: h, category, intensity, phase } = f;
    const levels: Record<WeatherCategory, number> = { clear: 0, cloudy: .08, overcast: .16, rain: .22, snow: .08, fog: .12, thunder: .27 };
    const strength = levels[category] * intensity;
    c.save();
    c.fillStyle = `rgba(72,92,110,${strength})`;
    c.fillRect(0, 0, w, h);
    if (f.fog > .02) { c.fillStyle = `rgba(226,234,241,${f.fog * .1 * intensity})`; c.fillRect(0, 0, w, h); }
    const glow = c.createLinearGradient(w * .3, 0, w, 0);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    const warm = phase === 'dusk' || phase === 'night';
    const sun = this.sunLevel(f);
    const alpha = .035 + .055 * sun + (category === 'snow' ? .05 * intensity : 0);
    glow.addColorStop(1, warm ? `rgba(255,207,151,${alpha})` : `rgba(225,238,248,${alpha})`);
    c.fillStyle = glow; c.fillRect(0, 0, w, h);
    if (category === 'thunder' && f.lightning && !f.still) {
      // The whole room answers the bolt, not only the sunlit wall.
      const pulse = Math.max(0, 1 - (f.time % 13) / .5);
      c.fillStyle = `rgba(214,228,255,${pulse * pulse * .12})`;
      c.fillRect(0, 0, w, h);
    }
    c.restore();
    this.drawProjection(c, f, image);
  }

  /** The mask follows the photographed sunlight: bright wall diagonal and the lit shelf strip. */
  private ensureProjectionMask(image: HTMLImageElement): HTMLCanvasElement {
    const w = 836, h = 470;
    if (this.projectionMask && this.maskSource === image) return this.projectionMask;
    this.projection.width = w; this.projection.height = h;
    const mask = document.createElement('canvas');
    mask.width = w; mask.height = h;
    const m = mask.getContext('2d', { willReadFrequently: true })!;
    try {
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const t = tmp.getContext('2d', { willReadFrequently: true })!;
      const scale = Math.max(w / image.width, h / image.height);
      t.drawImage(image, (w - image.width * scale) / 2, (h - image.height * scale) / 2, image.width * scale, image.height * scale);
      const src = t.getImageData(0, 0, w, h).data;
      const pixels = m.createImageData(w, h);
      const smooth = (v: number) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
      for (let i = 0; i < w * h; i++) {
        const luma = .2126 * src[i * 4] + .7152 * src[i * 4 + 1] + .0722 * src[i * 4 + 2];
        pixels.data[i * 4] = 255; pixels.data[i * 4 + 1] = 255; pixels.data[i * 4 + 2] = 255;
        pixels.data[i * 4 + 3] = 255 * smooth((luma - 192) / 34);
      }
      m.putImageData(pixels, 0, 0);
    } catch {
      // Without readable pixels, fall back to the geometric diagonal.
      const pixels = m.createImageData(w, h);
      const smooth = (v: number) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        pixels.data[(y * w + x) * 4 + 3] = 255 * smooth((x + y * 1.04 - 700) / 65)
          * smooth((382 - y) / 20) * smooth((836 - x) / 15);
      }
      m.putImageData(pixels, 0, 0);
    }
    this.projectionMask = mask;
    this.maskSource = image;
    return mask;
  }

  /** Artwork coordinates match the photographed diagonal light, including cover cropping. */
  private drawProjection(ctx: CanvasRenderingContext2D, f: SceneryFrame, image: HTMLImageElement) {
    const w = 836, h = 470;
    const mask = this.ensureProjectionMask(image);
    const c = this.projection.getContext('2d')!;
    c.clearRect(0, 0, w, h);
    const t = f.time, weather = f.category;
    // Sunlight tint cooled by night, then weather gloom composited over it into one zone wash.
    const sun = this.sunLevel(f);
    let sr = weather === 'snow' ? 232 : 255, sg = weather === 'snow' ? 242 : 214, sb = weather === 'snow' ? 252 : 140;
    sr += (168 - sr) * this.night; sg += (196 - sg) * this.night; sb += (228 - sb) * this.night;
    const cool = (1 - sun) * .55;
    sr += (196 - sr) * cool; sg += (204 - sg) * cool; sb += (214 - sb) * cool;
    const aSun = .04 + .26 * sun;
    const gloom: Record<WeatherCategory, [number, number, number, number]> = {
      clear: [0, 0, 0, 0], cloudy: [86, 104, 124, .1], overcast: [78, 96, 116, .2],
      rain: [52, 74, 98, .26], snow: [214, 232, 250, .1], fog: [226, 236, 242, .16], thunder: [36, 58, 92, .34],
    };
    const [gr, gg, gb, aGloom] = gloom[weather];
    const aG = aGloom * f.intensity;
    const zoneAlpha = aG + aSun * (1 - aG);
    c.fillStyle = `rgba(${(gr * aG + sr * aSun * (1 - aG)) / zoneAlpha | 0},${(gg * aG + sg * aSun * (1 - aG)) / zoneAlpha | 0},${(gb * aG + sb * aSun * (1 - aG)) / zoneAlpha | 0},${zoneAlpha})`;
    c.fillRect(0, 0, w, h);
    if (weather === 'snow') {
      for (let i = 0; i < 65; i++) {
        const x = hash(i, 6) * w + Math.sin(t * .3 + i) * 9;
        const y = (hash(i, 7) * (h + 20) + t * (7 + hash(i, 8) * 9)) % (h + 20) - 10;
        const r = 2 + hash(i, 9) * 5;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(235,246,255,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    } else if (weather !== 'rain' && weather !== 'thunder') {
      const fog = weather === 'fog';
      const count = weather === 'clear' ? 3 : 7;
      for (let i = 0; i < count; i++) {
        const x = ((hash(i, 10) * w + t * (fog ? 3 : 7)) % (w + 300)) - 150;
        const y = 60 + hash(i, 11) * 320;
        const r = fog ? 180 : weather === 'clear' ? 130 : 100;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        const color = weather === 'clear' ? '255,224,155' : fog ? '246,250,255' : '35,64,91';
        g.addColorStop(0, `rgba(${color},${weather === 'overcast' ? .35 : .24})`);
        g.addColorStop(1, `rgba(${color},0)`);
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    if (sun > .06 && f.clouds > .05) {
      // Cloud shadows crossing the sunlit wall, only while the sun still shines.
      c.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 4; i++) {
        const x = ((t * (5 + i * 2.3) + i * 331) % (w + 520)) - 260;
        const y = 40 + hash(i, 12) * 360;
        const r = 150 + hash(i, 13) * 130;
        const a = .3 * f.clouds * sun;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(196,200,206,${a})`);
        g.addColorStop(.7, `rgba(224,227,231,${a * .5})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.globalCompositeOperation = 'source-over';
    }
    if (weather === 'thunder' && f.lightning && !f.still) {
      const pulse = Math.max(0, 1 - (t % 13) / .55);
      c.fillStyle = `rgba(221,235,255,${pulse * .65})`; c.fillRect(0, 0, w, h);
    }
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = 'source-over';
    const scale = Math.max(f.width / image.width, f.height / image.height);
    ctx.save();
    ctx.globalAlpha = (.5 + .5 * sun) * (.45 + f.intensity * .55);
    ctx.drawImage(this.projection, (f.width - image.width * scale) / 2, (f.height - image.height * scale) / 2,
      image.width * scale, image.height * scale);
    ctx.restore();
  }

  private texture(dark: boolean) {
    const canvas = document.createElement('canvas');
    canvas.width = 384; canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      let n = 0, amplitude = .55, frequency = 1;
      for (let octave = 0; octave < 5; octave++) {
        n += valueNoise(x / 95 * frequency, y / 65 * frequency) * amplitude;
        frequency *= 2; amplitude *= .48;
      }
      const edge = Math.sin(Math.PI * x / canvas.width) * Math.sin(Math.PI * y / canvas.height);
      const alpha = Math.max(0, (n - .25) * 2) * Math.pow(Math.max(0, edge), .7);
      const i = (y * canvas.width + x) * 4;
      data.data[i] = dark ? 20 + n * 24 : 188 + n * 36;
      data.data[i + 1] = dark ? 32 + n * 28 : 202 + n * 30;
      data.data[i + 2] = dark ? 52 + n * 30 : 217 + n * 24;
      data.data[i + 3] = alpha * 220;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  private drawAtmosphere(c: CanvasRenderingContext2D, f: SceneryFrame) {
    const { width: w, height: h, time: t } = f;
    const indoor = f.theme === 'studio';
    if (!f.volumetric && !this.clouds) this.clouds = this.texture(true);
    if (!this.haze) this.haze = this.texture(false);
    c.save();
    // Slowly translating, multi-scale cloud density; never a full-screen flicker.
    if (!f.volumetric)
      for (let i = 0; i < 3; i++) {
        c.globalAlpha = (indoor ? .08 : .22) * f.clouds;
        const drift = Math.sin(t * .009 + i * 2) * w * .11;
        c.drawImage(this.clouds!, -w * .3 + drift + i * w * .13, -h * .2 + i * h * .08, w * 1.4, h * .85);
      }
    if (!indoor && f.fog > .02) {
      c.globalAlpha = Math.min(.68, f.fog * .6);
      c.drawImage(this.haze, -w * .2 + Math.sin(t * .012) * w * .08, h * .3, w * 1.4, h * .8);
      c.globalAlpha *= .6;
      c.drawImage(this.haze, -w * .3 - Math.sin(t * .017) * w * .1, h * .5, w * 1.8, h * .6);
    }
    if (!indoor && !f.still && f.dark < .3) {
      // Tiny distortion in the photographed water adds depth without moving the horizon.
      c.globalAlpha = .28;
      const start = Math.round(h * .81);
      for (let y = start; y < h; y += 5) {
        const shift = Math.sin(y * .045 + t * .65) * (y - start) / Math.max(1, h - start) * 1.6;
        c.drawImage(this.plate, 0, y, w, Math.min(5, h - y), shift, y, w, Math.min(5, h - y));
      }
    }
    c.restore();
  }
}
