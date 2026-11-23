import type { SettingsStore } from '../data/settings';
import type { WeatherCategory } from '../data/weather';
import { GlyphSurface, type SurfacePoint } from './glyph-surface';
import { snowTone } from '../data/snow';

interface RainParticle { x: number; y: number; speed: number; depth: number; seed: number }
interface WaterDrop { x: number; y: number; r: number; speed: number; age: number; attached: boolean; life: number; edgeAge?: number; vx?: number }
interface Splash { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number }
export interface WeatherFrame {
  width: number; height: number; time: number; dt: number; still: boolean;
  rain: number; snow: number; fog: number; category: WeatherCategory;
  background: HTMLCanvasElement;
  refractedWindow?: boolean;
  temperature?: number;
}

const LIMITS = { rain: 700, snow: 180, beads: 100, splashes: 240, glass: 48 };
function seeded(n: number) { const x = Math.sin(n * 127.1 + 17.7) * 43758.5453; return x - Math.floor(x); }

/** The expensive layer exists only in realistic mode. Its canvas never intercepts input. */
export class RealWeatherEffects {
  readonly canvas = document.createElement('canvas');
  readonly surface = new GlyphSurface();
  private ctx = this.canvas.getContext('2d')!;
  private material = document.createElement('canvas');
  private materialContext = this.material.getContext('2d')!;
  private particles: RainParticle[] = [];
  private beads: WaterDrop[] = [];
  private glass: WaterDrop[] = [];
  private splashes: Splash[] = [];
  private snowCaps: SurfacePoint[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private wetness = 0;
  private counter = 1;
  private totalCollisions = 0;
  private totalDrips = 0;
  private totalSplashes = 0;
  private lastSurfaceRevision = -1;
  private elapsed = 0;
  private surfaceActive = false;

  constructor(private store: SettingsStore) {
    this.canvas.className = 'weather-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.append(this.canvas);
  }
  get stats() {
    return { particles: this.particles.length, beads: this.beads.length, splashes: this.splashes.length, glass: this.glass.length,
      collisions: this.totalCollisions, drips: this.totalDrips, emittedSplashes: this.totalSplashes,
      surfacePoints: this.surfaceActive ? this.surface.tops.length : 0, surfaceRevision: this.surface.revision, wetness: this.wetness, elapsed: this.elapsed };
  }
  invalidateMask() { this.surface.dirty = true; }
  private random() { return seeded(this.counter++); }

  render(frame: WeatherFrame) {
    const { width: w, height: h, still } = frame;
    const dpr = Math.min(devicePixelRatio || 1, this.store.get('appearance.motion') === 'lite' ? 1 : 1.5);
    if (this.width !== w || this.height !== h || this.dpr !== dpr) {
      this.width = w; this.height = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.surface.dirty = true; this.particles = []; this.glass = [];
    }
    // The window clock sits indoors, in front of the pane. Its digits stay dry.
    const interaction = this.store.get<boolean>('weather.wetClock') && this.store.get('theme') !== 'window';
    this.surfaceActive = interaction;
    if (interaction) this.surface.rebuild();
    if (this.lastSurfaceRevision !== this.surface.revision) {
      this.lastSurfaceRevision = this.surface.revision;
      // Seconds change independently: retain water on unchanged strokes instead of
      // restarting the entire clock's water simulation every second.
      this.beads = this.beads.filter(drop => !drop.attached || this.surface.contains(drop.x, drop.y));
      this.snowCaps = this.snowCaps.filter(point => this.surface.contains(point.x, point.y));
    }
    if (!interaction) { this.beads = []; this.snowCaps = []; this.splashes = []; this.wetness = 0; }
    const dt = still ? 0 : Math.min(frame.dt, .05);
    this.elapsed += dt;
    const intensity = this.store.get<number>('weather.intensity') / 100;
    const rain = frame.rain * intensity, snow = frame.snow * intensity;
    const targetWet = interaction ? rain : 0;
    this.wetness = still ? targetWet : this.wetness + (targetWet - this.wetness) * Math.min(1, dt * (targetWet > this.wetness ? .8 : .18));
    this.ctx.clearRect(0, 0, w, h);
    const snowy = snow > rain;
    const amount = Math.max(rain, snow);
    const count = amount < .01 ? 0 : Math.round((snowy ? LIMITS.snow : LIMITS.rain) * amount * (this.store.get('appearance.motion') === 'lite' ? .5 : 1));
    while (this.particles.length < count) this.particles.push(this.spawn(false));
    if (this.particles.length > count) this.particles.length = count;
    const darkInk = this.store.get('theme') === 'studio';
    const snowColor = snowTone(frame.temperature).rgb;
    const color = snowy ? snowColor : darkInk ? '70,92,107' : '211,230,249';
    const c = this.ctx;
    for (const p of this.particles) {
      const previousX = p.x, previousY = p.y;
      const speed = snowy ? 16 + p.depth * 55 : p.speed;
      p.x += (snowy ? Math.sin(this.elapsed * .7 + p.seed) * 15 : -speed * .055) * dt;
      p.y += speed * dt;
      if (p.y > h + 40 || p.x < -50) Object.assign(p, this.spawn(true));
      if (interaction && dt > 0 && p.depth > .24) {
        const point = this.surface.hit(previousX, previousY, p.x, p.y);
        if (point) {
          this.totalCollisions++;
          if (snowy) {
            if (this.snowCaps.length < 150) this.snowCaps.push(point);
          } else {
            this.impact(point, p.depth, rain);
          }
          Object.assign(p, this.spawn(true));
          continue;
        }
      }
      if (snowy) {
        c.globalAlpha = .2 + p.depth * .65;
        const radius = .7 + p.depth * 3.4;
        if (p.depth > .78) {
          const glow = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2);
          glow.addColorStop(0, `rgba(${color},.8)`); glow.addColorStop(1, `rgba(${color},0)`);
          c.fillStyle = glow; c.fillRect(p.x - radius * 2, p.y - radius * 2, radius * 4, radius * 4);
        } else { c.fillStyle = `rgb(${color})`; c.beginPath(); c.arc(p.x, p.y, radius, 0, Math.PI * 2); c.fill(); }
      } else {
        const length = 8 + p.depth * 35;
        c.globalAlpha = .12 + p.depth * .28;
        c.strokeStyle = `rgb(${color})`; c.lineWidth = .4 + p.depth * 1.35; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + length * .055, p.y - length); c.stroke();
        if (p.depth > .9) {
          c.globalAlpha = .04; c.lineWidth = 4;
          c.stroke();
        }
      }
    }
    c.globalAlpha = 1;
    if (interaction) {
      if (still && rain > .1 && !this.beads.length) this.seedSurface();
      this.drawMaterial(rain, snow, frame.time, snowColor);
      this.updateBeads(dt, rain, frame.background);
      this.updateSplashes(dt, color);
    }
    if (this.store.get('theme') === 'window' && this.store.get('weather.glass') && !frame.refractedWindow) this.drawGlass(dt, rain, frame.background);
    else this.glass = [];
  }

  private spawn(top: boolean): RainParticle {
    const depth = this.random();
    return { x: this.random() * (this.width + 60), y: top ? -30 - this.random() * 80 : this.random() * this.height,
      speed: 290 + depth * 820, depth, seed: this.random() * 100 };
  }
  private impact(point: SurfacePoint, depth: number, rain: number) {
    const nearby = this.beads.find(d => d.attached && Math.hypot(d.x - point.x, d.y - point.y) < d.r + 5);
    if (nearby) nearby.r = Math.min(4.2, Math.cbrt(nearby.r ** 3 + 1.5 + depth * 3));
    else if (this.beads.length < LIMITS.beads && this.random() > .35) this.beads.push({ ...point, y: point.y + 1, r: .7 + depth * 1.1, speed: 0, age: 0, life: .5 + this.random() * 1.8, attached: true });
    // The same depth controls the incoming streak's thickness and speed.
    // Larger drops scatter larger beads; heavier rain gently strengthens the impact.
    const strength = 1 + depth * .45 + rain * .15;
    const count = 2 + Math.floor(depth * 2 + rain);
    for (let i = 0; i < count && this.splashes.length < LIMITS.splashes; i++) {
      const angle = -Math.PI * (.15 + this.random() * .7), velocity = (20 + this.random() * 65) * Math.sqrt(strength);
      this.splashes.push({ ...point, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, age: 0, life: .2 + this.random() * .23 + depth * .04, r: (.28 + this.random() * .55) * strength });
      this.totalSplashes++;
    }
  }
  private seedSurface() {
    const tops = this.surface.tops;
    for (let i = 0; i < 18 && tops.length; i++) {
      const p = tops[Math.floor(this.random() * tops.length)];
      this.beads.push({ ...p, y: p.y + 1, r: .8 + this.random() * 1.2, speed: 0, age: .3, life: 2, attached: true });
    }
  }

  private drawMaterial(rain: number, snow: number, time: number, snowColor: string) {
    const b = this.surface.bounds;
    if (!b.width || !b.height) return;
    if (this.material.width !== b.width || this.material.height !== b.height) {
      this.material.width = b.width; this.material.height = b.height;
    }
    const m = this.materialContext;
    const darkInk = this.store.get('theme') === 'studio';
    m.clearRect(0, 0, b.width, b.height);
    if (this.wetness > .015) {
      // Broken moving specular patches, clipped to the actual font, like the supplied rain reference.
      m.globalCompositeOperation = 'source-over';
      m.fillStyle = `rgba(35,66,102,${this.wetness * .43})`; m.fillRect(0, 0, b.width, b.height);
      for (let i = 0; i < 23; i++) {
        const x = seeded(i + 30) * b.width, y = (seeded(i + 90) * b.height + time * (.4 + seeded(i) * .8)) % (b.height + 50) - 25;
        const r = 9 + seeded(i + 100) * 30;
        const glow = m.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, `rgba(224,243,255,${this.wetness * (darkInk ? .08 : .22)})`);
        glow.addColorStop(1, 'rgba(224,243,255,0)');
        m.fillStyle = glow; m.fillRect(x - r, y - r, r * 2, r * 2);
      }
      m.globalCompositeOperation = 'destination-in'; m.drawImage(this.surface.canvas, 0, 0);
      m.globalCompositeOperation = 'source-over';
      this.ctx.drawImage(this.material, b.x, b.y);
      // Very small water beads on the upper edges make the wet surface legible at clock scale.
      const points = this.surface.tops;
      for (let i = 0; i < points.length; i += 8) {
        const p = points[i], r = .65 + seeded(i + 55) * 1.1;
        this.ctx.fillStyle = `rgba(224,244,255,${this.wetness * .65})`;
        this.ctx.beginPath(); this.ctx.ellipse(p.x, p.y, r * 1.3, r * .5, 0, 0, Math.PI * 2); this.ctx.fill();
      }
    }
    if (snow > .02) {
      const points = this.surface.tops;
      this.ctx.fillStyle = `rgba(${snowColor},${Math.min(.95, snow * 1.1)})`;
      for (let i = 0; i < points.length; i += 3) {
        const p = points[i];
        this.ctx.beginPath(); this.ctx.ellipse(p.x, p.y - .4, 2.2, .6 + seeded(i + 3) * 1.8, 0, 0, Math.PI * 2); this.ctx.fill();
      }
      for (const p of this.snowCaps) { this.ctx.beginPath(); this.ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); this.ctx.fill(); }
    } else if (rain < .02) this.snowCaps = [];
  }

  private updateBeads(dt: number, rain: number, source: HTMLCanvasElement) {
    const alive: WaterDrop[] = [];
    for (const drop of this.beads) {
      drop.age += dt;
      if (drop.attached) {
        drop.r = Math.min(4.2, drop.r + dt * rain * .16);
        if (dt > 0 && drop.age > drop.life) {
          const target = Math.max(1, (drop.r - .65) ** 2 * 8);
          drop.speed += (target - drop.speed) * Math.min(1, dt * 4);
          const step = Math.min(3, drop.speed * dt);
          let moved = false;
          for (const dx of [0, -step * .6, step * .6, -step, step]) {
            if (this.surface.contains(drop.x + dx, drop.y + step)) {
              drop.x += dx; drop.y += step; drop.vx = dx / dt; drop.edgeAge = 0; moved = true; break;
            }
          }
          if (!moved) {
            drop.speed *= Math.exp(-dt * 8);
            drop.edgeAge = (drop.edgeAge || 0) + dt;
            if (drop.edgeAge > .25 + .8 / drop.r) {
              drop.attached = false; drop.age = 0; drop.speed = 8; this.totalDrips++;
            }
          }
        }
      } else { drop.speed += dt * 720; drop.y += drop.speed * dt; drop.x += (drop.vx || 0) * dt * .3; }
      if (drop.y > this.height + 10 || (!drop.attached && drop.age > 1.8) || (rain < .02 && drop.age > 3)) continue;
      this.waterDrop(drop, source, drop.attached ? .95 : .7, false);
      alive.push(drop);
    }
    this.beads = alive;
  }
  private updateSplashes(dt: number, color: string) {
    const alive: Splash[] = [];
    for (const p of this.splashes) {
      p.age += dt; if (p.age > p.life) continue;
      p.vy += dt * 440; p.x += p.vx * dt; p.y += p.vy * dt;
      this.ctx.fillStyle = `rgba(${color},${(1 - p.age / p.life) * .85})`;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); this.ctx.fill(); alive.push(p);
    }
    this.splashes = alive;
  }
  private drawGlass(dt: number, rain: number, source: HTMLCanvasElement) {
    const desired = rain > .02 ? Math.round(LIMITS.glass * rain) : 0;
    if (rain > .02 && this.glass.length > desired) this.glass.length = desired;
    while (this.glass.length < desired) {
      this.glass.push({ x: this.random() * this.width, y: this.random() * this.height, r: 2 + this.random() * 6.5,
        speed: 0, age: 0, life: 2 + this.random() * 8, attached: false });
    }
    const alive: WaterDrop[] = [];
    for (const drop of this.glass) {
      drop.age += dt;
      if (drop.r > 5.5 && drop.age > drop.life) { drop.speed = Math.min(95, drop.speed + dt * 35); drop.y += drop.speed * dt; drop.x += Math.sin(drop.y * .02) * dt * 2; }
      if (rain < .02) drop.speed += dt * 100;
      if (rain < .02) drop.y += drop.speed * dt;
      if (drop.y > this.height + 15) continue;
      this.waterDrop(drop, source, Math.min(.75, rain * 1.4), true); alive.push(drop);
    }
    this.glass = alive.slice(0, LIMITS.glass);
  }

  private waterDrop(drop: WaterDrop, source: HTMLCanvasElement, alpha: number, refract: boolean) {
    const c = this.ctx, { x, y, r } = drop;
    const stretch = drop.attached ? 1 + Math.min(.7, (drop.edgeAge || 0) * .8) : 1 + Math.min(.9, drop.speed / 420);
    c.save(); c.globalAlpha = alpha;
    if (refract && source.width && source.height) {
      c.save(); c.beginPath(); c.ellipse(x, y, r, r * stretch, 0, 0, Math.PI * 2); c.clip();
      const sx = source.width / this.width, sy = source.height / this.height;
      const sample = r * 3;
      c.drawImage(source, Math.max(0, x - sample) * sx, Math.max(0, y - sample) * sy, sample * 2 * sx, sample * 2 * sy, x - r, y - r * stretch, r * 2, r * stretch * 2);
      c.restore();
    }
    const g = c.createRadialGradient(x - r * .3, y - r * .4, 0, x, y, r * 1.25);
    g.addColorStop(0, 'rgba(224,244,255,.24)'); g.addColorStop(.45, 'rgba(140,177,210,.06)'); g.addColorStop(.8, 'rgba(6,22,44,.28)'); g.addColorStop(1, 'rgba(214,238,255,.6)');
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * stretch, 0, 0, Math.PI * 2); c.fill();
    c.lineWidth = .65; c.strokeStyle = 'rgba(225,245,255,.75)';
    c.beginPath(); c.ellipse(x, y, r * .83, r * stretch * .83, 0, Math.PI * 1.08, Math.PI * 1.62); c.stroke();
    if (refract && drop.speed > 18) {
      c.strokeStyle = 'rgba(216,238,252,.14)'; c.lineWidth = Math.max(.7, r * .5);
      c.beginPath(); c.moveTo(x, y - r * stretch); c.lineTo(x + Math.sin(y * .02) * 1.5, y - r * stretch - Math.min(25, drop.speed * .16)); c.stroke();
    }
    c.restore();
  }

  dispose() {
    this.canvas.remove(); this.canvas.width = this.canvas.height = 1;
    this.material.width = this.material.height = 1; this.surface.dispose();
    this.particles = []; this.beads = []; this.glass = []; this.splashes = []; this.snowCaps = [];
  }
}
