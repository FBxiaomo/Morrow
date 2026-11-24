/** Schema-driven settings with explicit local persistence feedback. */
import { CLOCK_ZONE_OPTIONS } from './cities';

export type SettingValue = number | boolean | string;
export type SettingSchema = {
    key: string;
    label: string;
    kind: 'slider';
    min: number;
    max: number;
    step: number;
    default: number;
} | {
    key: string;
    label: string;
    kind: 'toggle';
    default: boolean;
} | {
    key: string;
    label: string;
    kind: 'select';
    options: { value: string; label: string }[];
    default: string;
} | {
    key: string;
    label: string;
    kind: 'segment';
    options: { value: string; label: string }[];
    default: string;
} | {
    key: string;
    label: string;
    kind: 'color';
    default: string;
} | {
    key: string;
    label: string;
    kind: 'text';
    default: string;
};
export type SettingsListener = (key: string, value: SettingValue) => void;
const STORAGE_KEY = 'desktop.v2.settings';

export class SettingsStore {
    private values: Record<string, SettingValue> = {};
    private schemas = new Map<string, SettingSchema>();
    private listeners = new Set<SettingsListener>();
    private persistenceListeners = new Set<(ok: boolean) => void>();
    private persistent = true;

    constructor() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Record<string, SettingValue>;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    for (const [k, v] of Object.entries(parsed)) {
                        if (['number', 'boolean', 'string'].includes(typeof v) && k !== '__proto__') this.values[k] = v;
                    }
                }
            }
        } catch {
            this.persistent = false;
        }
    }

    register(schemas: SettingSchema[]) {
        for (const s of schemas) {
            this.schemas.set(s.key, s);
            this.values[s.key] = this.validate(s, this.values[s.key]);
        }
        this.save();
    }

    schema(key: string): SettingSchema | undefined { return this.schemas.get(key); }
    allSchemas(): SettingSchema[] { return Array.from(this.schemas.values()); }
    isPersistent(): boolean { return this.persistent; }

    get<T extends SettingValue = SettingValue>(key: string): T {
        const s = this.schemas.get(key);
        if (key in this.values) return this.values[key] as T;
        return (s ? s.default : ('' as SettingValue)) as T;
    }

    set(key: string, value: SettingValue) {
        const s = this.schemas.get(key);
        const v = s ? this.validate(s, value) : value;
        if (this.values[key] === v) return;
        this.values[key] = v;
        this.save();
        for (const cb of this.listeners) cb(key, v);
    }

    onChange(cb: SettingsListener): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    onPersistenceChange(cb: (ok: boolean) => void): () => void {
        this.persistenceListeners.add(cb);
        return () => this.persistenceListeners.delete(cb);
    }

    retrySave(): boolean { return this.save(); }

    private validate(schema: SettingSchema, value: unknown): SettingValue {
        if (schema.kind === 'slider') {
            return typeof value === 'number' && Number.isFinite(value)
                ? Math.min(schema.max, Math.max(schema.min, Math.round(value / schema.step) * schema.step)) : schema.default;
        }
        if (schema.kind === 'toggle') return typeof value === 'boolean' ? value : schema.default;
        if (schema.kind === 'select' || schema.kind === 'segment') return schema.options.some(option => option.value === value) ? value as string : schema.default;
        if (schema.kind === 'color') return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : schema.default;
        return typeof value === 'string' ? value : schema.default;
    }

    private save(): boolean {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
            this.persistent = true;
        } catch {
            this.persistent = false;
        }
        for (const cb of this.persistenceListeners) cb(this.persistent);
        return this.persistent;
    }

    snapshot(keys?: string[]): Record<string, SettingValue> {
        return Object.fromEntries(Object.entries(this.values).filter(([key]) => !keys || keys.includes(key)));
    }
}

export const FONT_STACKS: Record<string, string> = {
    smiley: '"Smiley Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
    system: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    light: '"Josefin Sans", "Avenir Next", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif',
    rounded: '"Quicksand", "Avenir Next Rounded", "Trebuchet MS", "PingFang SC", sans-serif',
    display: '"Bebas Neue", "Arial Black", "Impact", "PingFang SC", sans-serif',
    serif: '"Didot", "Bodoni MT", "Cormorant Garamond", "Georgia", "Songti SC", serif',
    playfair: '"Playfair Display", "Didot", "Bodoni MT", "Georgia", "Songti SC", serif',
    sans: '"Barlow Condensed", "Avenir Next", "Helvetica Neue", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    mono: '"JetBrains Mono", "Cascadia Code", "Consolas", "Menlo", monospace',
    pixel: '"Fusion Pixel 12px Proportional zh_hans", "JetBrains Mono", "Cascadia Code", monospace',
    kuaile: '"ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif',
};

export const GLOBAL_SETTINGS: SettingSchema[] = [
    { key: 'appearance.size', label: '时钟大小', kind: 'slider', min: 65, max: 135, step: 1, default: 100 },
    { key: 'appearance.color', label: '文字颜色', kind: 'color', default: '#ffffff' },
    { key: 'appearance.position', label: '时间位置', kind: 'select', options: [{ value: 'auto', label: '主题默认' }, { value: 'center', label: '居中' }, { value: 'left', label: '靠左' }, { value: 'right', label: '靠右' }], default: 'auto' },
    { key: 'appearance.motion', label: '动态效果', kind: 'select', options: [{ value: 'full', label: '完整动态' }, { value: 'lite', label: '轻量动态' }, { value: 'off', label: '静态画面' }], default: 'full' },
    { key: 'background.type', label: '背景', kind: 'select', options: [{ value: 'scene', label: '主题风景' }, { value: 'gradient', label: '渐变' }, { value: 'solid', label: '纯色' }, { value: 'image', label: '我的图片' }], default: 'scene' },
    { key: 'background.color', label: '背景颜色', kind: 'color', default: '#273956' },
    { key: 'background.dim', label: '背景遮罩', kind: 'slider', min: 0, max: 80, step: 1, default: 8 },
    { key: 'background.blur', label: '背景模糊', kind: 'slider', min: 0, max: 20, step: 1, default: 0 },
    { key: 'content.seconds', label: '显示秒数（旧版）', kind: 'toggle', default: false },
    { key: 'content.secondsStyle', label: '秒的显示', kind: 'select', options: [{ value: 'off', label: '不显示' }, { value: 'digits', label: '数字秒数' }, { value: 'bar', label: '秒进度条' }, { value: 'both', label: '数字 + 进度条' }], default: 'bar' },
    { key: 'weather.quality', label: '天气画质', kind: 'segment', options: [{ value: 'light', label: '轻量 · 日常常驻' }, { value: 'realistic', label: '写实 · 细节与互动' }], default: 'light' },
    { key: 'weather.wetClock', label: '雨雪与数字互动', kind: 'toggle', default: true },
    { key: 'weather.glass', label: '前景玻璃水滴', kind: 'toggle', default: true },
    { key: 'weather.mode', label: '天气来源', kind: 'segment', options: [{ value: 'live', label: '真实天气' }, { value: 'manual', label: '自选天气' }], default: 'live' },
    { key: 'weather.manual', label: '自选天气', kind: 'select', options: [{ value: 'clear', label: '晴天' }, { value: 'cloudy', label: '多云' }, { value: 'overcast', label: '阴天' }, { value: 'rain', label: '下雨' }, { value: 'snow', label: '下雪' }, { value: 'fog', label: '雾天' }, { value: 'thunder', label: '雷雨' }], default: 'clear' },
    { key: 'weather.daytime', label: '天空时段', kind: 'select', options: [{ value: 'auto', label: '跟随昼夜' }, { value: 'day', label: '白昼' }, { value: 'dusk', label: '日落' }, { value: 'night', label: '夜晚' }], default: 'auto' },
    { key: 'weather.apiKey', label: 'uapis API Key', kind: 'text', default: '' },
    { key: 'weather.intensityAuto', label: '强度自动调节', kind: 'toggle', default: false },
    { key: 'weather.intensity', label: '天气强度', kind: 'slider', min: 10, max: 100, step: 5, default: 65 },
    { key: 'weather.lightning', label: '闪电效果', kind: 'toggle', default: true },
    { key: 'appearance.exposure', label: '曝光', kind: 'slider', min: 0.3, max: 1.2, step: 0.01, default: 0.72 },
    { key: 'appearance.font', label: '字体', kind: 'select', options: [
        { value: 'smiley', label: '得意黑 · Smiley Sans' }, { value: 'system', label: '跟随系统' },
        { value: 'light', label: '轻盈 · Light' }, { value: 'serif', label: '衬线' },
        { value: 'playfair', label: '优雅衬线 · Playfair' }, { value: 'sans', label: '无衬线' },
        { value: 'mono', label: '等宽' }, { value: 'rounded', label: '圆润' },
        { value: 'display', label: '粗体 · Display' }, { value: 'pixel', label: '点阵 · 像素' },
        { value: 'kuaile', label: '快乐体 · 站酷' },
    ], default: 'serif' },
    { key: 'appearance.fontCustom', label: '本机字体', kind: 'text', default: '' },
    { key: 'appearance.quiet', label: '夜间调暗', kind: 'toggle', default: false },
    { key: 'content.format', label: '制式', kind: 'segment', options: [{ value: '24', label: '24 小时' }, { value: '12', label: '12 小时' }], default: '24' },
    { key: 'content.clockZone', label: '主时钟时区', kind: 'select', options: [{ value: 'auto', label: '跟随本机' }, ...CLOCK_ZONE_OPTIONS], default: 'auto' },
    { key: 'content.date', label: '显示日期', kind: 'toggle', default: true },
    { key: 'content.world', label: '世界时钟', kind: 'toggle', default: true },
    { key: 'content.cities', label: '城市列表', kind: 'text', default: '东京,伦敦,纽约' },
    { key: 'content.moon', label: '月相盘', kind: 'toggle', default: false },
    { key: 'content.lunar', label: '显示农历', kind: 'toggle', default: true },
    { key: 'focus.work', label: '专注时长(分)', kind: 'slider', min: 5, max: 60, step: 5, default: 25 },
    { key: 'focus.short', label: '短休(分)', kind: 'slider', min: 1, max: 15, step: 1, default: 5 },
    { key: 'focus.long', label: '长休(分)', kind: 'slider', min: 5, max: 30, step: 5, default: 15 },
    { key: 'focus.notifications', label: '到时系统通知', kind: 'toggle', default: false },
    { key: 'audio.enabled', label: '音乐律动', kind: 'toggle', default: false },
    { key: 'weather.city', label: '城市', kind: 'text', default: '' },
    { key: 'weather.show', label: '显示天气', kind: 'toggle', default: true },
    { key: 'weather.visual', label: '天气视觉', kind: 'toggle', default: true },
    { key: 'general.wake', label: '保持屏幕常亮', kind: 'toggle', default: false },
];
