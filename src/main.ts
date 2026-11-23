import './desktop.css';
import './customizer.css';
import './responsive.css';
import './weather.css';
import './window.css';
import './liquid-settings.css';
import './focus.css';
import { SettingsStore, GLOBAL_SETTINGS, FONT_STACKS } from './data/settings';
import { ThemeManager, THEMES } from './data/themes';
import { WeatherService } from './data/weather';
import { Landscape } from './atmosphere/landscape';
import { Dashboard } from './ui/dashboard';
import { Customizer } from './ui/customizer';
import { FocusDialog } from './ui/focus';
import { Shell } from './ui/shell';
import { pomodoro } from './data/pomodoro';
import { audio } from './data/audio';

const store = new SettingsStore();
store.register(GLOBAL_SETTINGS);
if (store.get('experience.version') !== 5) {
    store.set('weather.visual', true);
    store.set('experience.version', 5);
}
const themes = new ThemeManager(store);
const weather = new WeatherService();
const canvas = document.getElementById('stage') as HTMLCanvasElement;
canvas.setAttribute('aria-hidden', 'true');
const landscape = new Landscape(canvas, store);
let customizer: Customizer;
let focusDialog: FocusDialog;

function fullscreen() {
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    void request?.catch(() => customizer.notify('浏览器暂时无法进入全屏，请使用 F11'));
}
function focusDurations() {
    pomodoro.durations = { work: store.get<number>('focus.work'), short: store.get<number>('focus.short'), long: store.get<number>('focus.long') };
}
focusDurations();

const dashboard = new Dashboard(store, weather, {
    themes: () => customizer.open('themes'),
    settings: () => customizer.open(),
    fullscreen,
    focus: () => focusDialog.open(),
    end: () => { if (pomodoro.stop()) customizer.notify('本次专注已结束，记录已保存在本机'); },
    city: () => customizer.open('weather'),
    pure: () => togglePure(),
});
customizer = new Customizer(store, themes, weather, () => landscape.loadImage());
focusDialog = new FocusDialog(store, text => customizer.notify(text));

const pureExit = document.createElement('button');
pureExit.className = 'pure-exit';
pureExit.innerHTML = '<span>退出纯净显示</span><kbd>H</kbd>';
pureExit.hidden = true;
pureExit.addEventListener('click', () => togglePure(false));
document.body.append(pureExit);

function togglePure(force?: boolean) {
    const pure = force ?? !document.body.classList.contains('pure-mode');
    document.body.classList.toggle('pure-mode', pure);
    pureExit.hidden = !pure;
    if (pure) {
        customizer.close();
        focusDialog.close();
        customizer.notify('纯净显示 · 按 H 或点击右下角退出');
    }
}

let wakeLock: WakeLockSentinel | null = null;
async function updateWakeLock(enabled: boolean) {
    if (!enabled) {
        await wakeLock?.release();
        wakeLock = null;
        return;
    }
    if (!('wakeLock' in navigator)) {
        store.set('general.wake', false);
        customizer.notify('此浏览器暂不支持屏幕常亮');
        return;
    }
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
        customizer.notify('屏幕常亮已开启');
    } catch {
        store.set('general.wake', false);
        customizer.notify('暂时无法保持常亮，请在页面处于前台时重试');
    }
}

function appearance() {
    const root = document.documentElement;
    const font = store.get<string>('appearance.font');
    const custom = store.get<string>('appearance.fontCustom').trim();
    if (custom) root.style.setProperty('--clock-font', JSON.stringify(custom) + ', ' + (FONT_STACKS[font] || FONT_STACKS.sans));
    else root.style.setProperty('--clock-font', FONT_STACKS[font] || FONT_STACKS.sans);
    root.style.setProperty('--clock-weight', custom ? '400' : font === 'light' ? '200' : font === 'display' ? '800' : font === 'sans' ? '500' : '400');
    document.body.dataset.customFont = custom ? 'true' : 'false';
    root.style.setProperty('--clock-scale', String(store.get<number>('appearance.size') / 100));
    root.style.setProperty('--clock-ink', store.get<string>('appearance.color'));
    document.body.dataset.position = store.get<string>('appearance.position');
    document.body.dataset.motion = store.get<string>('appearance.motion');
    document.body.classList.toggle('quiet', store.get<boolean>('appearance.quiet'));
    dashboard.refresh();
}

let audioRevision = 0;
store.onChange((key, value) => {
    if (key.startsWith('appearance.') || key === 'theme') appearance();
    if (key.startsWith('focus.') && key !== 'focus.notifications') focusDurations();
    if (key === 'general.wake') void updateWakeLock(Boolean(value));
    if (key === 'audio.enabled') {
        const revision = ++audioRevision;
        if (value) {
            void audio.enable().then(ok => {
                if (revision !== audioRevision) {
                    if (!store.get('audio.enabled')) audio.disable();
                    return;
                }
                if (!ok) {
                    store.set('audio.enabled', false);
                    customizer.notify('未能启用麦克风，请检查浏览器权限');
                }
            });
        } else audio.disable();
    }
});
weather.onChange(info => { dashboard.setWeather(info); landscape.setWeather(info); });
pomodoro.onChange(() => { dashboard.tick(); focusDialog.tick(); });
appearance();
document.fonts.addEventListener('loadingdone', () => dashboard.refresh());
focusDurations();
if (store.get('audio.enabled')) store.set('audio.enabled', false);
landscape.setWeather(weather.current());
dashboard.setWeather(weather.current());
if (weather.hasLocation()) void weather.refresh();
else if (store.get<string>('weather.city') && store.get('weather.city') !== '当前位置') void weather.setCity(store.get<string>('weather.city'));

window.setInterval(() => {
    if (document.hidden) return;
    dashboard.tick();
    focusDialog.tick();
    landscape.audioLevel = audio.isActive() ? audio.update().rms : 0;
}, 200);
window.setInterval(() => { if (!document.hidden) void weather.refresh(); }, 30 * 60 * 1000);
window.setInterval(() => landscape.invalidate(), 60 * 1000);
window.addEventListener('online', () => void weather.refresh());
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        dashboard.refresh();
        void weather.refresh();
        if (store.get<boolean>('general.wake') && !wakeLock) void updateWakeLock(true);
    }
});
window.addEventListener('pointerdown', () => {
    if (store.get<boolean>('general.wake') && !wakeLock) void updateWakeLock(true);
}, { once: true });

/** Timestamp of the last Escape that dismissed a panel. */
let dismissedAt = 0;
export const wasJustDismissed = () => Date.now() - dismissedAt < 400;

new Shell({
    onSettings: () => customizer.toggle(),
    onEscape: () => {
        if (document.body.classList.contains('pure-mode')) togglePure(false);
        else {
            if (focusDialog.isOpen || customizer.isOpen) dismissedAt = Date.now();
            customizer.close();
            focusDialog.close();
            // Return focus to the page so a following Space cannot re-activate the opening button.
            (document.activeElement as HTMLElement | null)?.blur?.();
        }
    },
    onFullscreen: fullscreen,
    onFormatToggle: () => store.set('content.format', store.get('content.format') === '24' ? '12' : '24'),
    onMusicToggle: () => store.set('audio.enabled', !store.get<boolean>('audio.enabled')),
    onPomodoroToggle: () => focusDialog.toggle(),
    onPureToggle: () => togglePure(),
    isBusy: () => customizer.isOpen || focusDialog.isOpen || document.body.classList.contains('pure-mode'),
    onStyleSwitch: index => { if (THEMES[index]) themes.switch(THEMES[index].id); },
    isDismissed: () => wasJustDismissed(),
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => { /* Online use remains available. */ }));
}

(window as unknown as { desktop: unknown }).desktop = { store, themes, weather, landscape, dashboard, customizer, focusDialog, pomodoro, audio };
