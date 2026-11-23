import type { SettingsStore } from '../data/settings';
import { THEMES } from '../data/themes';
import { lunarInfo, lunarText } from '../data/lunar';
import { WEATHER_LABELS, type WeatherInfo, type WeatherCategory, type WeatherService } from '../data/weather';
import { pomodoro } from '../data/pomodoro';
import { formatCityTime, parseCities, resolveCity } from '../data/cities';
import { icon } from './icons';

export class Dashboard {
    readonly root = document.createElement('main');
    private info: WeatherInfo | null = null;
    private lastMinute = '';
    private lastSecondProgress = 0;
    private lastTheme = '';

    constructor(private store: SettingsStore, private weather: WeatherService, actions: {
        themes: () => void;
        settings: () => void;
        fullscreen: () => void;
        focus: () => void;
        end: () => void;
        city: () => void;
        pure: () => void;
    }) {
        this.root.className = 'desktop';
        this.root.innerHTML = `
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>末时钟<small>天气氛围与专注时钟</small></span></div>
        <button class="location-button" data-action="city" aria-label="选择天气城市"></button>
      </header>
      <section class="clock-area" aria-label="本地时钟">
        <div class="clock-eyebrow"></div>
        <div class="clock-time" role="timer" aria-live="off"><span class="hours"></span><span class="colon">:</span><span class="minutes"></span><span class="seconds"></span><span class="period"></span></div>
        <div class="clock-meta"><span class="clock-date"></span><span class="meta-separator"></span><span class="clock-lunar"></span></div>
        <div class="seconds-display"><div class="clock-progress" role="progressbar" aria-label="秒进度" aria-valuemin="0" aria-valuemax="60"><i></i></div><span class="seconds-caption"></span></div>
        <div class="focus-inline"><button class="focus-status" data-action="focus"></button><button class="focus-end" data-action="end" aria-label="结束本次专注">${icon('stop')}<span>结束</span></button></div>
        <div class="focus-progress" aria-label="专注进度"><i></i></div>
      </section>
      <div class="window-frame" aria-hidden="true"><div class="window-mullion"></div><div class="window-transom"></div><div class="window-latch"></div><div class="window-sill"></div></div>
      <section class="bottom-info"><div class="scene-note"><span class="small-label"></span><div class="scene-title"></div><div class="weather-stats"></div></div><div class="world-clocks"></div><div class="moon-widget" hidden></div></section>
      <footer class="desktop-footer">
        <div class="theme-label"><span class="theme-index">01</span><span class="theme-name"></span><span class="mode-label"></span></div>
        <nav class="toolbar" aria-label="时钟工具">
          <button data-action="themes">${icon('themes')}<span>主题</span><kbd>1–4</kbd></button>
          <button class="toolbar-focus" data-action="focus" aria-label="开始专注">${icon('focus')}<span class="focus-button-label">专注</span><kbd>空格</kbd></button>
          <button data-action="settings">${icon('settings')}<span>个性化</span><kbd>S</kbd></button>
          <span class="toolbar-divider"></span>
          <button data-action="pure" aria-label="进入纯净显示" title="纯净显示 · H">${icon('pure')}</button>
          <button data-action="fullscreen" aria-label="切换全屏" title="全屏 · F">${icon('expand')}</button>
        </nav>
        <span class="footer-hint"></span>
      </footer>`;
        document.body.append(this.root.querySelector('.window-frame')!, this.root);
        new ResizeObserver(() => this.refresh()).observe(this.root);
        this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => btn.addEventListener('click', () => actions[btn.dataset.action as keyof typeof actions]()));
        store.onChange(() => this.refresh());
        this.refresh();
        requestAnimationFrame(() => document.body.classList.add('is-ready'));
    }

    private el<T extends HTMLElement = HTMLElement>(selector: string) { return this.root.querySelector<T>(selector)!; }
    setWeather(info: WeatherInfo | null) { this.info = info; this.refresh(); }

    refresh() {
        this.el('.clock-time').style.fontSize = '';
        const theme = THEMES.find(t => t.id === this.store.get('theme')) || THEMES[0];
        const index = THEMES.findIndex(t => t.id === theme.id);
        if (this.lastTheme && this.lastTheme !== theme.id) {
            this.root.classList.remove('scene-enter');
            void this.root.offsetWidth;
            this.root.classList.add('scene-enter');
        }
        this.lastTheme = theme.id;
        this.el('.theme-index').textContent = String(index + 1).padStart(2, '0');
        this.el('.theme-name').textContent = theme.name;
        this.el('.scene-title').textContent = theme.description;
        this.el('.scene-note .small-label').textContent = theme.en;
        this.el('.clock-eyebrow').textContent = theme.id === 'studio' ? 'LOCAL TIME / 本地时间' : theme.id === 'editorial' ? 'THE QUIET PASSAGE OF TIME' : theme.id === 'window' ? 'A MOMENT TO YOURSELF' : '此刻，恰好。';
        const manual = this.store.get('weather.mode') === 'manual';
        const category = manual ? this.store.get<WeatherCategory>('weather.manual') : this.info?.category;
        const location = this.el('.location-button');
        location.replaceChildren();
        const glyph = document.createElement('span');
        glyph.innerHTML = icon(category || 'pin');
        location.append(glyph);
        const label = document.createElement('span');
        label.textContent = manual ? `${WEATHER_LABELS[category!]} · 自选氛围` : this.info ? `${this.info.city}　${this.info.temp}°　${this.info.label}${this.info.stale ? ' · 上次天气' : ''}` : '选择城市';
        location.append(label);
        location.hidden = !this.store.get<boolean>('weather.show');
        this.el('.mode-label').textContent = manual ? '自选天气' : this.info ? '天气联动' : '本地昼夜';
        this.el('.weather-stats').textContent = !this.store.get('weather.show') ? '' : manual ? '当前为视觉预览，不代表实时天气' : this.info
            ? `${Number.isFinite(this.info.feelsLike) ? '体感 ' + this.info.feelsLike + '°　' : ''}${Number.isFinite(this.info.wind) ? '风速 ' + this.info.wind + ' km/h　' : ''}${Number.isFinite(this.info.humidity) ? '湿度 ' + this.info.humidity + '%　' : ''}${new Date(this.info.observedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新`
            : this.weather.status;
        this.lastMinute = '';
        this.tick();
        const time = this.el('.clock-time');
        const range = document.createRange();
        range.selectNodeContents(time);
        const width = range.getBoundingClientRect().width;
        if (width > time.clientWidth) time.style.fontSize = `${parseFloat(getComputedStyle(time).fontSize) * time.clientWidth / width * .97}px`;
        window.dispatchEvent(new Event('clock-layoutchange'));
    }

    tick() {
        pomodoro.tick();
        const now = new Date(), format = this.store.get('content.format');
        const h = now.getHours(), hh = String(format === '12' ? (h % 12 || 12) : h).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
        const secondsStyle = this.store.get<string>('content.secondsStyle');
        const showDigits = secondsStyle === 'digits' || secondsStyle === 'both';
        const secondText = showDigits ? String(now.getSeconds()).padStart(2, '0') : '';
        const geometryChanged = this.el('.hours').textContent !== hh || this.el('.minutes').textContent !== mm || this.el('.seconds').textContent !== secondText;
        if (this.el('.hours').textContent !== hh) this.el('.hours').textContent = hh;
        if (this.el('.minutes').textContent !== mm) this.el('.minutes').textContent = mm;
        this.el('.clock-time').setAttribute('aria-label', `${hh}:${mm}${showDigits ? ':' + secondText : ''}`);
        if (this.el('.seconds').textContent !== secondText) this.el('.seconds').textContent = secondText;
        this.el('.seconds-display').hidden = secondsStyle === 'off' || secondsStyle === 'digits';
        this.el('.seconds-caption').textContent = secondsStyle === 'both' ? 'SECONDS' : `${String(now.getSeconds()).padStart(2, '0')} / 60`;
        if (geometryChanged) window.dispatchEvent(new Event('clock-layoutchange'));
        this.el('.period').textContent = format === '12' ? (h < 12 ? 'AM' : 'PM') : '';
        if (this.lastMinute !== `${hh}:${mm}`) {
            this.lastMinute = `${hh}:${mm}`;
            this.el('.clock-date').textContent = this.store.get('content.date') ? new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now) : '';
            const lunar = lunarInfo(now);
            this.el('.clock-lunar').textContent = this.store.get('content.lunar') ? lunarText(lunar) + (lunar.term ? ' · ' + lunar.term : '') : '';
            this.el('.meta-separator').hidden = !this.store.get('content.date') || !this.store.get('content.lunar');
            const world = this.el('.world-clocks');
            world.replaceChildren();
            if (this.store.get('content.world')) {
                for (const city of parseCities(this.store.get<string>('content.cities'))) {
                    const row = document.createElement('div'), label = document.createElement('span'), time = document.createElement('strong');
                    const resolved = resolveCity(city);
                    label.textContent = resolved.label;
                    if (resolved.ok) {
                        time.textContent = formatCityTime(now, resolved.zone);
                    } else {
                        time.textContent = resolved.reason;
                        row.classList.add('invalid');
                        row.title = `${resolved.label}：${resolved.reason}。可使用内置城市名，或 IANA 时区，例如 Asia/Shanghai。`;
                    }
                    row.append(label, time);
                    world.append(row);
                }
            }
            const moon = this.el('.moon-widget');
            moon.hidden = !this.store.get<boolean>('content.moon');
            moon.textContent = `月相 / ${lunarText(lunar)}`;
            const today = pomodoro.today();
            this.el('.footer-hint').textContent = today.count ? `今日 ${today.count} 段 · ${today.minutes} 分钟` : '为学习、办公与休息留一段安静时间';
        }
        const active = pomodoro.isActive();
        const progress = (now.getSeconds() + now.getMilliseconds() / 1000) / 60;
        const fill = this.el('.clock-progress i');
        fill.style.transition = progress < this.lastSecondProgress ? 'none' : '';
        fill.style.transform = `scaleX(${progress})`;
        this.lastSecondProgress = progress;
        this.el('.clock-progress').setAttribute('aria-valuenow', String(now.getSeconds()));
        this.el('.focus-progress').hidden = !active;
        this.el('.focus-progress i').style.transform = `scaleX(${pomodoro.progress()})`;
        this.el('.focus-end').hidden = !active;
        const focus = this.el<HTMLButtonElement>('.focus-status');
        focus.hidden = !active;
        const task = pomodoro.task();
        focus.textContent = `${pomodoro.isPaused() ? '已暂停' : ''}${pomodoro.label()}${task ? ` · ${task}` : ''}`;
        focus.title = task || '查看专注';
        this.el('.focus-button-label').textContent = active ? pomodoro.remainingLabel() : '专注';
        this.el<HTMLButtonElement>('.toolbar-focus').classList.toggle('active', active);
        this.el<HTMLButtonElement>('.toolbar-focus').setAttribute('aria-label', active ? '查看当前专注' : '开始专注');
    }
}
