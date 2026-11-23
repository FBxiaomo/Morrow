import type { SettingsStore } from '../data/settings';
import type { WeatherCategory, WeatherInfo } from '../data/weather';
import { backgroundImage } from '../data/themes';
import { PhotographicScenery } from './photographic';
import { RealWeatherEffects } from './real-weather';
import { WindowGlass } from './window-glass';
import { VolumetricClouds } from './volumetric';
import { snowTone } from '../data/snow';
type RGB = [
    number,
    number,
    number
];
type Phase = 'day' | 'dusk' | 'night';
const PALETTES: Record<Phase, RGB[]> = {
    day: [[57, 102, 146], [138, 178, 194], [232, 217, 186], [139, 164, 169], [88, 125, 142], [40, 78, 97]],
    dusk: [[51, 58, 104], [158, 127, 157], [247, 183, 140], [155, 137, 160], [100, 104, 140], [48, 66, 99]],
    night: [[7, 16, 36], [22, 41, 65], [69, 83, 103], [46, 63, 82], [28, 47, 65], [13, 33, 50]],
};
const WEATHER: Record<WeatherCategory, {
    clouds: number;
    rain: number;
    snow: number;
    fog: number;
    dark: number;
}> = {
    clear: { clouds: 0.16, rain: 0, snow: 0, fog: 0, dark: 0 }, cloudy: { clouds: 0.65, rain: 0, snow: 0, fog: 0.1, dark: 0.13 },
    overcast: { clouds: 1, rain: 0, snow: 0, fog: 0.22, dark: 0.35 }, rain: { clouds: 1, rain: 1, snow: 0, fog: 0.25, dark: 0.45 },
    snow: { clouds: 0.8, rain: 0, snow: 1, fog: 0.35, dark: 0.2 }, fog: { clouds: 0.4, rain: 0, snow: 0, fog: 1, dark: 0.13 },
    thunder: { clouds: 1, rain: 1, snow: 0, fog: 0.25, dark: 0.65 },
};
function rgb(c: RGB, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function noise(x: number, seed: number) { return Math.sin(x * 5.7 + seed) * 0.48 + Math.sin(x * 13.1 + seed * 2) * 0.24 + Math.sin(x * 29.3 + seed * 3) * 0.12 + Math.sin(x * 63.5 + seed) * 0.06; }
function rand(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
/** Local photographic scenery with a procedural fallback and one bounded canvas loop. */
export class Landscape {
    private ctx: CanvasRenderingContext2D;
    private width = 0;
    private height = 0;
    private dpr = 1;
    private time = 0;
    private last = 0;
    private dirty = true;
    private weather: WeatherInfo | null = null;
    private colors = PALETTES.dusk.map(c => [...c] as RGB);
    private state = { ...WEATHER.clear };
    private category: WeatherCategory = 'clear';
    private phase: Phase = 'dusk';
    private image: HTMLImageElement | null = null;
    private imageRevision = 0;
    private reduced = matchMedia('(prefers-reduced-motion: reduce)');
    private photos = new PhotographicScenery(() => this.invalidate());
    private effects: RealWeatherEffects | null = null;
    private windowGlass: WindowGlass | null = null;
    private windowGlassFailed = false;
    private volumetric: VolumetricClouds | null = null;
    private volumetricFailed = false;
    private frameDt = 0;
    private drawnFrames = 0;
    private drawCost = 0;
    private peakCost = 0;
    audioLevel = 0;
    constructor(readonly canvas: HTMLCanvasElement, private store: SettingsStore) {
        this.ctx = canvas.getContext('2d', { alpha: false })!;
        window.addEventListener('resize', () => this.resize());
        document.addEventListener('visibilitychange', () => { this.last = 0; this.dirty = true; });
        this.reduced.addEventListener('change', () => { this.dirty = true; });
        window.addEventListener('clock-layoutchange', () => {
            this.effects?.invalidateMask();
            if (this.effects) this.dirty = true;
        });
        store.onChange(key => {
            this.dirty = true;
            if (key === 'theme' || key === 'background.type')
                void this.loadImage();
            if (key === 'appearance.motion')
                this.resize();
            if (key === 'theme') {
                this.photos.load(this.store.get<string>('theme'));
                this.settleClockGeometry();
            }
            if (['weather.quality', 'weather.visual', 'weather.glass', 'theme', 'background.type'].includes(key)) {
                this.windowGlassFailed = false;
                this.volumetricFailed = false;
                this.syncQuality();
            }
            this.sync();
        });
        this.resize();
        this.sync();
        this.syncQuality();
        this.photos.load(this.store.get<string>('theme'));
        void this.loadImage();
        requestAnimationFrame(this.frame);
    }
    setWeather(info: WeatherInfo | null) { this.weather = info; this.sync(); this.dirty = true; }
    invalidate() { this.dirty = true; }
    get snapshot() { return { category: this.category, phase: this.phase, ...this.state }; }
    get diagnostics() {
        return { quality: this.store.get('weather.quality'), sceneReady: this.photos.ready,
            frames: this.drawnFrames, averageDrawMs: this.drawnFrames ? this.drawCost / this.drawnFrames : 0,
            peakDrawMs: this.peakCost, effects: this.effects?.stats ?? null,
            windowGlass: this.windowGlass?.diagnostics ?? null, glassFallback: this.windowGlassFailed,
            clouds: this.volumetric?.diagnostics ?? null, cloudFallback: this.volumetricFailed,
            snowTone:this.category === 'snow' ? snowTone(this.snowTemperature()) : null };
    }
    private syncQuality() {
        const high = this.store.get('weather.quality') === 'realistic' && this.store.get<boolean>('weather.visual');
        const particleEffects = high;
        if (particleEffects && !this.effects) this.effects = new RealWeatherEffects(this.store);
        if (!particleEffects && this.effects) { this.effects.dispose(); this.effects = null; }
        if (!high) this.photos.releaseDetail();
        if (!this.wantsVolumetric()) this.disposeVolumetric();
        if (!high || this.store.get('theme') !== 'window' || !this.store.get('weather.glass')) this.disposeGlass();
        document.body.dataset.weatherQuality = this.store.get<string>('weather.quality');
        this.dirty = true;
    }
    /** The theme entrance animates the clock; re-read digit geometry once it ends (static mode included). */
    private settleClockGeometry() {
        const area = document.querySelector('.clock-area');
        if (area)
            area.addEventListener('animationend', () => { this.effects?.invalidateMask(); this.dirty = true; }, { once: true });
    }
    private snowTemperature() { return this.store.get('weather.mode') === 'live' ? this.weather?.temp : undefined; }
    private disposeGlass() {
        this.windowGlass?.dispose(); this.windowGlass = null;
        document.body.dataset.windowGlass = 'off';
    }
    private syncWindowGlass() {
        const wanted = !!this.effects && this.store.get('theme') === 'window' && this.store.get('weather.glass')
            && this.state.rain * this.store.get<number>('weather.intensity') / 100 > .015;
        if (!wanted) {
            if (this.windowGlass) this.disposeGlass();
            else if (document.body.dataset.windowGlass !== 'off') document.body.dataset.windowGlass = 'off';
            return;
        }
        if (this.windowGlass && !this.windowGlass.ready) {
            this.disposeGlass(); this.windowGlassFailed = true;
        }
        if (!this.windowGlass && !this.windowGlassFailed) {
            this.windowGlass = WindowGlass.create(() => this.invalidate());
            this.windowGlassFailed = !this.windowGlass;
        }
        document.body.dataset.windowGlass = this.windowGlass ? 'webgl' : 'canvas';
    }
    async loadImage() {
        const revision = ++this.imageRevision;
        if (this.store.get('background.type') !== 'image') {
            this.image = null;
            return;
        }
        try {
            const blob = await backgroundImage('get', this.store.get<string>('theme'));
            if (revision !== this.imageRevision)
                return;
            this.image = null;
            if (!blob) {
                this.dirty = true;
                return;
            }
            const url = URL.createObjectURL(blob);
            const image = new Image();
            try {
                image.src = url;
                await image.decode();
                if (revision === this.imageRevision)
                    this.image = image;
            }
            finally {
                URL.revokeObjectURL(url);
            }
            this.dirty = true;
        }
        catch {
            this.image = null;
            this.dirty = true;
        }
    }
    private sync() {
        this.category = this.store.get('weather.visual')
            ? this.store.get('weather.mode') === 'manual' ? this.store.get<WeatherCategory>('weather.manual') : this.weather?.category ?? 'clear'
            : 'clear';
        const selected = this.store.get<string>('weather.daytime');
        const hour = new Date().getHours() + new Date().getMinutes() / 60;
        const epoch = Date.now() / 1000;
        const nearHorizon = this.weather && [this.weather.sunrise, this.weather.sunset].some(at => at && Math.abs(epoch - at) < 35 * 60);
        this.phase = selected !== 'auto' ? selected as Phase : this.weather?.isDay !== undefined && !this.weather.stale && this.store.get('weather.mode') === 'live'
            ? nearHorizon ? 'dusk' : this.weather.isDay ? 'day' : 'night' : hour >= 17 && hour < 19 || hour >= 5 && hour < 7 ? 'dusk' : hour >= 7 && hour < 17 ? 'day' : 'night';
        document.body.dataset.phase = this.phase;
        document.body.dataset.weather = this.category;
    }
    private resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.dpr = Math.min(devicePixelRatio || 1, this.store.get('appearance.motion') === 'lite' ? 1 : 1.5);
        this.canvas.width = Math.round(this.width * this.dpr);
        this.canvas.height = Math.round(this.height * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.dirty = true;
    }
    private frame = (now: number) => {
        requestAnimationFrame(this.frame);
        if (document.hidden)
            return;
        const motion = this.store.get<string>('appearance.motion');
        const still = motion === 'off' || this.reduced.matches;
        const interval = motion === 'lite' ? 66 : this.effects ? 16 : 33;
        if (!this.dirty && (still || now - this.last < interval))
            return;
        const dt = this.last ? Math.min((now - this.last) / 1000, 0.15) : 0.05;
        this.last = now;
        this.frameDt = still ? 0 : dt * (this.store.get('appearance.quiet') ? .35 : 1);
        this.sync();
        if (!still)
            this.time += dt * (this.store.get('appearance.quiet') ? 0.35 : 1);
        const factor = still ? 1 : Math.min(1, dt * 1.4);
        const target = WEATHER[this.category] || WEATHER.clear;
        for (const key of Object.keys(this.state) as (keyof typeof this.state)[])
            this.state[key] += (target[key] - this.state[key]) * factor;
        this.colors.forEach((c, i) => c.forEach((v, j) => { c[j] = v + (PALETTES[this.phase][i][j] - v) * factor; }));
        const started = performance.now();
        this.draw(still);
        this.syncWindowGlass();
        this.effects?.render({width:this.width, height:this.height, time:this.time, dt:this.frameDt, still,
            rain:this.state.rain, snow:this.state.snow, fog:this.state.fog, category:this.category, background:this.canvas,
            refractedWindow:!!this.windowGlass, temperature:this.snowTemperature()});
        if (this.store.get('theme') === 'window' && this.effects) {
            // Precipitation belongs outside: composite it before the lens and the DOM frame.
            this.ctx.drawImage(this.effects.canvas, 0, 0, this.width, this.height);
        }
        this.windowGlass?.render(this.canvas, this.width, this.height, this.time,
            this.state.rain * this.store.get<number>('weather.intensity') / 100, still);
        const cost = performance.now() - started;
        this.drawnFrames++; this.drawCost += cost; this.peakCost = Math.max(this.peakCost, cost);
        this.dirty = false;
    };
    private draw(still: boolean) {
        const { ctx: c, width: w, height: h, time: t } = this;
        const theme = this.store.get<string>('theme');
        const bg = this.store.get<string>('background.type');
        const studio = theme === 'studio';
        const volume = this.prepareVolumetric();
        c.save();
        c.fillStyle = '#101a29';
        c.fillRect(0, 0, w, h);
        c.filter = `blur(${this.store.get<number>('background.blur')}px)`;
        if (bg === 'image' && this.image) {
            const scale = Math.max(w / this.image.width, h / this.image.height) * 1.03;
            c.drawImage(this.image, (w - this.image.width * scale) / 2, (h - this.image.height * scale) / 2, this.image.width * scale, this.image.height * scale);
        }
        else if (bg === 'solid' || bg === 'gradient') {
            const gradient = c.createLinearGradient(0, 0, w, h);
            gradient.addColorStop(0, this.store.get<string>('background.color'));
            gradient.addColorStop(1, '#0e1727');
            c.fillStyle = bg === 'solid' ? this.store.get<string>('background.color') : gradient;
            c.fillRect(-30, -30, w + 60, h + 60);
        }
        else if (this.photos.draw(c, {theme, width:w, height:h, phase:this.phase, dark:this.state.dark,
            clouds:this.state.clouds, fog:this.state.fog, time:t, dt:this.frameDt, still,
            realistic:this.store.get('weather.quality') === 'realistic' && this.store.get<boolean>('weather.visual'), volumetric:volume,
            category:this.category, intensity:this.store.get<number>('weather.intensity') / 100,
            visual:this.store.get<boolean>('weather.visual'), lightning:this.store.get<boolean>('weather.lightning')})) {
            // Local photographic plate plus independently animated weather and light.
            this.drawVolumetric(still);
            if (!volume && !this.effects && !studio && this.state.clouds > .25) this.clouds(t);
        }
        else {
            const sky = c.createLinearGradient(0, 0, 0, h);
            this.colors.slice(0, 3).forEach((col, i) => sky.addColorStop(i / 2, rgb(col)));
            c.fillStyle = sky;
            c.fillRect(-30, -30, w + 60, h + 60);
            const glow = c.createRadialGradient(w * .73, h * .52, 0, w * .73, h * .52, w * .58);
            glow.addColorStop(0, `rgba(255,212,172,${this.phase === 'night' ? .03 : .22})`);
            glow.addColorStop(1, 'rgba(255,212,172,0)');
            c.fillStyle = glow;
            c.fillRect(0, 0, w, h);
            this.drawVolumetric(still);
            this.celestial();
            if (!this.volumetric)
                this.clouds(t);
            for (let layer = 0; layer < 5; layer++) {
                const col = this.colors[Math.min(5, 3 + Math.floor(layer / 2))];
                const y = h * (.65 + layer * .074);
                c.beginPath();
                c.moveTo(-20, h + 20);
                for (let x = -20; x <= w + 20; x += 4) {
                    const nx = x / w;
                    c.lineTo(x, y + noise(nx * 1.3, layer * 2.9 + 3) * h * (.09 + layer * .012) + Math.sin(nx * 4 + layer) * h * .025);
                }
                c.lineTo(w + 20, h + 20);
                c.closePath();
                const ridge = c.createLinearGradient(0, y - h * .1, 0, h);
                ridge.addColorStop(0, rgb(col, .65 + layer * .07));
                ridge.addColorStop(1, rgb(col));
                c.fillStyle = ridge;
                c.fill();
            }
            const haze = c.createLinearGradient(0, h * .63, 0, h * .92);
            haze.addColorStop(0, 'rgba(171,184,197,0)');
            haze.addColorStop(.45, `rgba(171,184,197,${this.phase === 'night' ? .03 : .14})`);
            haze.addColorStop(1, 'rgba(171,184,197,0)');
            c.fillStyle = haze;
            c.fillRect(0, h * .6, w, h * .4);
            c.fillStyle = `rgba(13,25,42,${this.state.dark * .65})`;
            c.fillRect(0, 0, w, h);
            if (studio) {
                c.fillStyle = 'rgba(240,239,231,.96)';
                c.fillRect(0, 0, w, h);
                this.studioShape(t);
            }
            if (theme === 'editorial') {
                c.fillStyle = 'rgba(8,12,18,.87)';
                c.fillRect(0, 0, w, h);
            }
        }
        c.filter = 'none';
        if (this.store.get('weather.visual'))
            this.precipitation(still, studio);
        c.fillStyle = `rgba(0,0,0,${this.store.get<number>('background.dim') / 100})`;
        c.fillRect(0, 0, w, h);
        if (this.store.get('appearance.quiet')) {
            c.fillStyle = 'rgba(5,9,16,.18)';
            c.fillRect(0, 0, w, h);
        }
        c.restore();
    }
    private celestial() {
        const { ctx: c, width: w, height: h, time: t } = this;
        if (this.phase === 'night') {
            for (let i = 0; i < 150; i++) {
                c.fillStyle = `rgba(225,235,255,${(.18 + rand(i + 1) * .5) * (1 - this.state.clouds * .8) * (.8 + .2 * Math.sin(t * .3 + i))})`;
                c.beginPath();
                c.arc(rand(i + 2) * w, rand(i + 600) * h * .65, rand(i + 900) * 1.1 + .35, 0, Math.PI * 2);
                c.fill();
            }
        }
        const x = w * .76, y = h * (this.phase === 'dusk' ? .49 : .25), r = Math.min(w, h) * (this.phase === 'night' ? .025 : .037);
        c.globalAlpha = 1 - this.state.clouds * .8;
        const light = c.createRadialGradient(x, y, 0, x, y, r * 6);
        light.addColorStop(0, this.phase === 'night' ? 'rgba(211,229,255,.13)' : 'rgba(255,235,204,.27)');
        light.addColorStop(1, 'rgba(255,235,204,0)');
        c.fillStyle = light;
        c.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
        c.fillStyle = this.phase === 'night' ? '#dbe6ee' : '#ffead1';
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
    }
    /** Reserve ray marching for the realistic outdoor scenery; retain the light renderer. */
    private wantsVolumetric() {
        return this.store.get('weather.quality') === 'realistic' && this.store.get<boolean>('weather.visual')
            && this.store.get<string>('theme') !== 'studio' && this.store.get('background.type') === 'scene'
            && this.state.clouds > .25;
    }
    private disposeVolumetric() {
        this.volumetric?.dispose(); this.volumetric = null;
        document.body.dataset.cloudRenderer = 'off';
    }
    private prepareVolumetric() {
        if (!this.wantsVolumetric()) {
            if (this.volumetric) this.disposeVolumetric();
            else if (document.body.dataset.cloudRenderer !== 'off') document.body.dataset.cloudRenderer = 'off';
            return false;
        }
        if (this.volumetric && !this.volumetric.ready) {
            this.disposeVolumetric(); this.volumetricFailed = true;
        }
        if (!this.volumetric && !this.volumetricFailed) {
            this.volumetric = VolumetricClouds.create(() => this.invalidate());
            this.volumetricFailed = !this.volumetric;
        }
        document.body.dataset.cloudRenderer = this.volumetric ? 'webgl' : 'canvas';
        return !!this.volumetric;
    }
    private drawVolumetric(still: boolean) {
        const vc = this.volumetric;
        if (!vc) return;
        vc.render({width:this.width, height:this.height, time:this.time, cover:this.state.clouds,
            night:this.phase === 'night' ? 1 : 0, dusk:this.phase === 'dusk' ? 1 : 0,
            still, lite:this.store.get('appearance.motion') === 'lite'});
        this.ctx.save();
        this.ctx.globalAlpha = 1;
        this.ctx.drawImage(vc.canvas, 0, 0, this.width, this.height);
        this.ctx.restore();
    }

    /** 闪电：全屏微闪 + 递归中点位移电弧（midpoint-displacement，经典算法） */
    private boltSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
    private boltBorn = -10;
    private boltNext = 4;
    private createBolt(x1: number, y1: number, x2: number, y2: number, depth: number,
        out: { x1: number; y1: number; x2: number; y2: number }[]) {
        if (depth === 0 || out.length > 380)
            return;
        const span = Math.abs(y2 - y1) + 30;
        const midX = (x1 + x2) / 2 + (Math.random() - .5) * span * .38;
        const midY = (y1 + y2) / 2 + (Math.random() - .5) * span * .1;
        out.push({ x1, y1, x2: midX, y2: midY });
        out.push({ x1: midX, y1: midY, x2, y2 });
        if (Math.random() > .74)
            this.createBolt(midX, midY, midX + (Math.random() - .3) * 110, midY + 60 + Math.random() * 70, depth - 2, out);
        this.createBolt(x1, y1, midX, midY, depth - 1, out);
        this.createBolt(midX, midY, x2, y2, depth - 1, out);
    }
    private lightning(c: CanvasRenderingContext2D, w: number, h: number, t: number, intensity: number) {
        if (t - this.boltBorn > .5) {
            this.boltBorn = -10;
            if (t >= this.boltNext) {
                this.boltNext = t + 7 + Math.random() * 15;
                this.boltBorn = t;
                this.boltSegments = [];
                const x1 = w * (.15 + Math.random() * .7);
                this.createBolt(x1, h * (.1 + Math.random() * .12),
                    x1 + (Math.random() - .5) * w * .34, h * (.52 + Math.random() * .3), 5, this.boltSegments);
            }
        }
        if (this.boltBorn < 0)
            return;
        const a = t - this.boltBorn;
        // 双重闪烁包络：主闪 → 回落 → 复闪 → 衰减
        const env = a < .07 ? 1 : a < .14 ? .35 : a < .22 ? .8 : Math.max(0, 1 - (a - .22) / .28);
        const k = env * (.75 + .25 * Math.sin(a * 140)) * intensity;
        if (k <= .01)
            return;
        c.fillStyle = `rgba(214,226,255,${.1 * k})`;
        c.fillRect(0, 0, w, h);
        c.save();
        c.lineCap = 'round';
        c.lineJoin = 'round';
        const passes: [number, string][] = [
            [7, `rgba(150,180,255,${.1 * k})`],
            [2.6, `rgba(205,222,255,${.5 * k})`],
            [1.1, `rgba(255,255,255,${.85 * k})`],
        ];
        for (const [lw, style] of passes) {
            c.lineWidth = lw;
            c.strokeStyle = style;
            c.beginPath();
            for (const s of this.boltSegments) {
                c.moveTo(s.x1, s.y1);
                c.lineTo(s.x2, s.y2);
            }
            c.stroke();
        }
        c.restore();
    }

    private clouds(t: number) {
        const { ctx: c, width: w, height: h } = this;
        const cover = this.state.clouds;
        if (cover <= .02)
            return;
        c.save();
        // 多云（0.65）显出成团层次；阴天（1）压低对比铺满。
        const layered = Math.max(0, Math.min(1, (cover - .16) / .5));
        const flat = Math.max(0, cover - .65);
        const nightK = this.phase === 'night' ? .45 : this.phase === 'dusk' ? .8 : 1;
        const tint = (a: number) => `rgba(225,230,238,${a})`;
        const shade = (a: number) => this.phase === 'dusk' ? `rgba(214,200,190,${a})` : `rgba(196,204,214,${a})`;
        // 三层景深：远(慢小淡) 中(中速) 近(快大亮)。
        const LAYERS = [
            { n: 7, y0: .1, y1: .34, r0: .07, r1: .1, speed: .5, depth: .45 },
            { n: 8, y0: .16, y1: .46, r0: .1, r1: .15, speed: .85, depth: .75 },
            { n: 6, y0: .22, r0: .14, r1: .22, y1: .56, speed: 1.35, depth: 1 },
        ];
        for (let li = 0; li < LAYERS.length; li++) {
            const L = LAYERS[li];
            const depth = L.depth * (0.35 + .65 * layered);
            for (let i = 0; i < L.n; i++) {
                const seed = li * 131 + i;
                const x = ((rand(seed + 4) * 1.7 + t * .0012 * L.speed * (i % 2 ? 1 : -0.7) + 1.7) % 1.7 - .35) * w;
                const y = (L.y0 + rand(seed + 34) * (L.y1 - L.y0)) * h;
                const rx = w * (L.r0 + rand(seed + 45) * (L.r1 - L.r0));
                const ry = h * (.022 + rand(seed + 94) * .05);
                // 云团 = 主体 + 阴影底 + 受光顶
                c.save();
                c.translate(x, y);
                c.scale(1, ry / rx);
                const a = (.08 + cover * .16) * depth * nightK;
                let g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
                g.addColorStop(0, tint(a));
                g.addColorStop(.55, tint(a * .55));
                g.addColorStop(1, tint(0));
                c.fillStyle = g;
                c.fillRect(-rx, -rx, rx * 2, rx * 2);
                if (layered > .25) {
                    // 成团才有的立体感：下压阴影 + 上挑受光边
                    g = c.createRadialGradient(0, ry * .5, 0, 0, ry * .5, rx * .8);
                    g.addColorStop(0, shade(a * .5));
                    g.addColorStop(1, shade(0));
                    c.fillStyle = g;
                    c.fillRect(-rx, -rx, rx * 2, rx * 2);
                    g = c.createRadialGradient(0, -ry * .35, 0, 0, -ry * .35, rx * .62);
                    g.addColorStop(0, tint(a * .9));
                    g.addColorStop(1, tint(0));
                    c.fillStyle = g;
                    c.fillRect(-rx, -rx, rx * 2, rx * 2);
                }
                c.restore();
            }
        }
        if (flat > 0) {
            // 阴天：整幅压顶的低对比云盖，维持压抑感
            const g = c.createLinearGradient(0, 0, 0, h * .8);
            const a = flat * .14 * nightK;
            g.addColorStop(0, tint(a));
            g.addColorStop(1, tint(0));
            c.fillStyle = g;
            c.fillRect(0, 0, w, h * .8);
        }
        c.restore();
    }
    private studioShape(t: number) {
        const { ctx: c, width: w, height: h } = this;
        const x = w * .84, y = h * .4, r = Math.min(w * .22, h * .32);
        c.save();
        c.globalAlpha = .8;
        const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, this.phase === 'night' ? '#929ba9' : this.category === 'rain' ? '#a2b8c2' : '#d8b7a1');
        g.addColorStop(1, '#e6dfce');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(249,247,238,.48)';
        c.lineWidth = 1;
        for (let i = 0; i < 26; i++) {
            const yy = y - r + i * r / 13;
            const half = Math.sqrt(Math.max(0, r * r - (yy - y) * (yy - y)));
            c.beginPath();
            c.moveTo(x - half, yy + Math.sin(t * .12 + i) * 2);
            c.lineTo(x + half, yy);
            c.stroke();
        }
        c.restore();
    }
    private precipitation(still: boolean, studio: boolean) {
        const { ctx: c, width: w, height: h, time: t, state: s } = this;
        const intensity = this.store.get<number>('weather.intensity') / 100;
        c.save();
        if (!studio && s.fog > .01) {
            for (let i = 0; i < 4; i++) {
                const x = (.2 + i * .3 + Math.sin(t * .017 + i) * .12) * w, y = h * (.4 + i * .14), r = w * .55;
                const g = c.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(205,218,227,${s.fog * .27 * intensity})`);
                g.addColorStop(1, 'rgba(205,218,227,0)');
                c.fillStyle = g;
                c.fillRect(0, 0, w, h);
            }
        }
        const light = s.snow > s.rain ? snowTone(this.snowTemperature()).rgb : studio ? '54,78,90' : '224,237,250';
        if (!this.effects && s.rain > .01) {
            c.strokeStyle = `rgba(${light},${s.rain * .35 * intensity})`;
            c.lineWidth = .8;
            c.beginPath();
            const count = this.store.get('appearance.motion') === 'lite' ? 130 : 260;
            for (let i = 0; i < count; i++) {
                const speed = 300 + rand(i + 234) * 600;
                const x = ((rand(i) * w - t * speed * .2) % (w + 100) + w + 100) % (w + 100) - 50;
                const y = (rand(i + 543) * h + t * speed) % (h + 100) - 50;
                c.moveTo(x, y);
                c.lineTo(x - 5, y + 12 + rand(i + 78) * 20);
            }
            c.stroke();
        }
        if (!this.effects && s.snow > .01) {
            for (let i = 0; i < 120; i++) {
                const x = (rand(i + 42) * w + Math.sin(t * .25 + i) * 26 + w) % w, y = (rand(i + 61) * h + t * (10 + rand(i + 36) * 35)) % (h + 10);
                c.fillStyle = `rgba(${light},${s.snow * (.25 + rand(i + 56) * .55) * intensity})`;
                c.beginPath();
                c.arc(x, y, 1 + rand(i + 1) * 2, 0, Math.PI * 2);
                c.fill();
            }
        }
        if (!this.effects && this.store.get('theme') === 'window' && this.store.get('weather.glass') && s.rain > .1) {
            c.lineWidth = 1;
            for (let i = 0; i < 34; i++) {
                const x = rand(i + 77) * w, y = (rand(i + 39) * h + t * (4 + rand(i + 88) * 18)) % h, r = 2 + rand(i + 25) * 5;
                c.strokeStyle = `rgba(230,241,250,${.16 * s.rain * intensity})`;
                c.fillStyle = 'rgba(215,231,244,.04)';
                c.beginPath();
                c.ellipse(x, y, r, r * 1.6, 0, 0, Math.PI * 2);
                c.fill();
                c.stroke();
            }
        }
        if (!still && !studio && this.category === 'thunder' && this.store.get('weather.lightning'))
            this.lightning(c, w, h, t, intensity);
        if (this.audioLevel > .02) {
            c.fillStyle = `rgba(220,232,255,${Math.min(.04, this.audioLevel * .06)})`;
            c.fillRect(0, 0, w, h);
        }
        c.restore();
    }
}
