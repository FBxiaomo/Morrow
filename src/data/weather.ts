import type { SettingValue } from './settings';

export type WeatherCategory = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'rain' | 'snow' | 'thunder';
export const WEATHER_LABELS: Record<WeatherCategory, string> = { clear: '晴', cloudy: '多云', overcast: '阴', fog: '雾', rain: '雨', snow: '雪', thunder: '雷雨' };
export interface WeatherInfo {
    temp: number;
    code: number;
    label: string;
    category: WeatherCategory;
    city: string;
    observedAt: number;
    stale: boolean;
    /** 由实况推导的氛围强度（10–100，步进 5），供「强度自动调节」消费。 */
    intensity?: number;
    feelsLike?: number;
    humidity?: number;
    windText?: string;
    isDay?: boolean;
    sunrise?: number;
    sunset?: number;
}
export interface Location {
    name: string;
    /** uapis 区划码锚点（keyed 模式回写，刷新优先使用）。 */
    adcode?: string;
    /** Open-Meteo 免 Key 回退模式所需坐标。 */
    latitude?: number;
    longitude?: number;
}
export interface CityCandidate {
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
}
interface Cache {
    location: Location;
    info: WeatherInfo;
    fetchedAt: number;
}
interface UapisWeather {
    province?: string;
    city?: string;
    district?: string;
    adcode?: string;
    weather?: string;
    weather_icon?: string;
    temperature?: number;
    wind_direction?: string;
    wind_power?: string;
    humidity?: number;
    report_time?: string;
    feels_like?: number;
    forecast?: { date?: string; sunrise?: string; sunset?: string }[];
}
const CACHE_KEY = 'horloge.weather.v5';
const LOCATION_KEY = 'horloge.weather-location.v2';
const LEGACY_CACHE_KEY = 'horloge.weather.v4';
const LEGACY_LOCATION_KEY = 'horloge.weather-location.v1';
const ENDPOINT = 'https://uapis.cn/api/v1/misc/weather';
const TTL = 30 * 60 * 1000;
const CITY_NOT_FOUND = '未找到城市，请重选或使用 IP 定位';
const LOCATE_FAILED = 'IP 定位失败，请手动搜索城市';
const NO_COORDS = '该位置缺少坐标，请重新搜索城市';
/** 高德系天气码 → 七分类；未知码回退多云（keyed uapis 档）。 */
export function mapCategory(icon: number): WeatherCategory {
    if (icon === 100 || icon === 150)
        return 'clear';
    if ((icon >= 101 && icon <= 103) || (icon >= 151 && icon <= 153))
        return 'cloudy';
    if (icon === 104)
        return 'overcast';
    if (icon === 302 || icon === 303 || icon === 304)
        return 'thunder';
    if (icon >= 300 && icon <= 313)
        return 'rain';
    if (icon >= 400 && icon <= 499)
        return 'snow';
    if (icon >= 500 && icon <= 508)
        return 'fog';
    return 'cloudy';
}
/** WMO 天气码 → 七分类；未知码回退多云（Open-Meteo 免 Key 回退档）。 */
export function mapWmo(code: number): { label: string; category: WeatherCategory } {
    if (code <= 1)
        return { label: '晴', category: 'clear' };
    if (code === 2)
        return { label: '多云', category: 'cloudy' };
    if (code === 3)
        return { label: '阴', category: 'overcast' };
    if (code === 45 || code === 48)
        return { label: '雾', category: 'fog' };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
        return { label: code < 60 ? '毛毛雨' : '雨', category: 'rain' };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86)
        return { label: '雪', category: 'snow' };
    if (code >= 95 && code <= 99)
        return { label: '雷雨', category: 'thunder' };
    return { label: '多云', category: 'cloudy' };
}
/** 国际城市 report_time 自带 ISO 偏移；国内朴素格式按 +08:00 解析。 */
function parseReportTime(raw: string): number | null {
    if (!raw)
        return null;
    if (/T/.test(raw)) {
        const parsed = Date.parse(raw);
        return Number.isFinite(parsed) ? parsed : null;
    }
    const naive = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(raw);
    if (!naive)
        return null;
    const parsed = Date.parse(`${naive[1]}T${naive[2]}+08:00`);
    return Number.isFinite(parsed) ? parsed : null;
}
function clockText(raw: string | undefined): string | null {
    if (!raw)
        return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}
/** 当日日出日落（HH:MM，城市当地时间）→ epoch；时区偏移取 report_time，国内朴素格式按 +08:00。 */
function dayBounds(data: UapisWeather, reportTime: string): { sunrise?: number; sunset?: number } {
    const day = data.forecast?.[0]?.date;
    const rise = clockText(data.forecast?.[0]?.sunrise);
    const set = clockText(data.forecast?.[0]?.sunset);
    if (!day || !rise || !set)
        return {};
    let offset: string;
    if (/[+-]\d{2}:\d{2}$/.test(reportTime))
        offset = /[+-]\d{2}:\d{2}$/.exec(reportTime)![0];
    else if (!/T/.test(reportTime))
        offset = '+08:00';
    else
        return {};
    const sunrise = Date.parse(`${day}T${rise}:00${offset}`);
    const sunset = Date.parse(`${day}T${set}:00${offset}`);
    return Number.isFinite(sunrise) && Number.isFinite(sunset) ? { sunrise, sunset } : {};
}
function windTextOf(data: UapisWeather): string | undefined {
    const parts: string[] = [];
    if (data.wind_direction?.trim())
        parts.push(data.wind_direction.trim());
    const power = data.wind_power?.trim();
    if (power)
        parts.push(/^[0-9]+(?:-[0-9]+)?$/.test(power) ? `${power}级` : power);
    return parts.length ? parts.join(' ') : undefined;
}
/** 图标码自带的强度语义（小/中/大/暴雨、小/中/大雪、雾档）→ 氛围强度基准。 */
const ICON_INTENSITY: Record<number, number> = {
    300: 50, 301: 55, 302: 85, 303: 90, 304: 95, 305: 35, 306: 55, 307: 75, 308: 95, 309: 20, 310: 90, 311: 95, 312: 100, 313: 45,
    400: 30, 401: 50, 402: 70, 403: 95, 404: 45, 405: 50, 406: 45, 407: 40, 408: 40, 409: 60, 410: 85, 499: 55,
    500: 30, 501: 55, 502: 45, 503: 70, 504: 75, 505: 40, 506: 60, 507: 80, 508: 65,
};
const BASE_INTENSITY: Record<WeatherCategory, number> = { clear: 40, cloudy: 50, overcast: 55, fog: 50, rain: 55, snow: 55, thunder: 85 };
/** 实况 → 氛围强度（10–100，步进 5）：图标码基准 + 风力等级修正（keyed uapis 档）。 */
export function deriveIntensity(icon: number, category: WeatherCategory, windPower?: string): number {
    let value = ICON_INTENSITY[icon] ?? BASE_INTENSITY[category];
    const level = /^([0-9]+)(?:-([0-9]+))?(?:级)?$/.exec(windPower?.trim() || '');
    if (level) {
        const mean = level[2] ? (Number(level[1]) + Number(level[2])) / 2 : Number(level[1]);
        if (Number.isFinite(mean))
            value += (mean - 3) * 5;
    }
    return Math.round(Math.min(100, Math.max(10, value)) / 5) * 5;
}
/** 生效强度：live 模式开自动档时取实况推导值，其余回落手动滑杆。 */
export function effectiveIntensity(store: { get(key: string): SettingValue }, info: WeatherInfo | null): number {
    if (store.get('weather.mode') === 'live' && store.get('weather.intensityAuto') === true && typeof info?.intensity === 'number')
        return info.intensity;
    return Number(store.get('weather.intensity')) || 65;
}
function normalizeLocation(raw: { name?: unknown; adcode?: unknown; latitude?: unknown; longitude?: unknown }): Location | null {
    if (typeof raw.name !== 'string' || !raw.name.trim())
        return null;
    return {
        name: raw.name.trim(),
        adcode: typeof raw.adcode === 'string' && raw.adcode.trim() ? raw.adcode.trim() : undefined,
        latitude: Number.isFinite(raw.latitude as number) ? raw.latitude as number : undefined,
        longitude: Number.isFinite(raw.longitude as number) ? raw.longitude as number : undefined,
    };
}
function sameLocation(a: Location, b: Location): boolean {
    return a.name === b.name && a.adcode === b.adcode && a.latitude === b.latitude && a.longitude === b.longitude;
}
export class WeatherService {
    private cache: Cache | null = null;
    private location: Location | null = null;
    private listeners = new Set<(info: WeatherInfo | null) => void>();
    private revision = 0;
    status = '选择城市，让天气走进画面';
    loading = false;
    constructor(private options: { apiKey?: () => string } = {}) {
        try {
            localStorage.removeItem(LEGACY_CACHE_KEY);
        }
        catch { /* 旧 v4 缓存随数据源替换作废。 */ }
        try {
            const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Cache | null;
            if (raw && typeof raw.location?.name === 'string' && Number.isFinite(raw.info?.temp) && Number.isFinite(raw.fetchedAt)) {
                this.cache = raw;
                this.location = normalizeLocation(raw.location);
                raw.info.stale = Date.now() - raw.fetchedAt >= TTL;
                this.status = raw.info.stale ? '正在显示上次天气' : '天气已更新';
            }
            else if (raw) {
                localStorage.removeItem(CACHE_KEY);
            }
        }
        catch {
            try {
                localStorage.removeItem(CACHE_KEY);
            }
            catch { /* 受损缓存不可用，本次会话重新获取。 */ }
        }
        this.loadLocation();
    }
    /** keyed 档：用户已在设置中自备 uapis Key。 */
    private keyed(): boolean {
        return !!(this.options.apiKey?.() || '').trim();
    }
    private loadLocation() {
        try {
            const saved = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null');
            const location = normalizeLocation(saved);
            if (location) {
                this.applySavedLocation(location);
                return;
            }
        }
        catch { /* v2 缺失或受损时尝试 v1 迁移。 */ }
        try {
            const legacy = JSON.parse(localStorage.getItem(LEGACY_LOCATION_KEY) || 'null');
            const location = normalizeLocation(legacy);
            if (location) {
                // v1（坐标结构）尽力迁移：名称与有限坐标均保留。
                this.applySavedLocation(location);
                this.persistLocation();
            }
            localStorage.removeItem(LEGACY_LOCATION_KEY);
        }
        catch { /* 无位置时提示用户选择，不阻塞时钟。 */ }
    }
    private applySavedLocation(location: Location) {
        this.location = location;
        if (this.cache && !sameLocation(this.cache.location, location))
            this.cache = null;
    }
    private persistLocation() {
        if (!this.location)
            return;
        try {
            localStorage.setItem(LOCATION_KEY, JSON.stringify(this.location));
        }
        catch { /* 会话内位置仍可用。 */ }
    }
    onChange(cb: (info: WeatherInfo | null) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
    current() { return this.cache?.info ?? null; }
    hasLocation() { return this.location !== null; }
    private emit() { for (const cb of this.listeners)
        cb(this.current()); }
    async search(name: string): Promise<CityCandidate[]> {
        if (name.trim().length < 2)
            return [];
        const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=zh&name=' + encodeURIComponent(name.trim()), { signal: AbortSignal.timeout(10000) });
        if (!res.ok)
            throw new Error('城市搜索暂不可用');
        const data = await res.json() as {
            results?: CityCandidate[];
        };
        return (data.results || []).filter(hit => typeof hit.name === 'string' && hit.name.trim()
            && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude));
    }
    /** Resolves coordinates into a Chinese place name for the keyless fallback locate; throws when the lookup fails. */
    async reverseGeocode(latitude: number, longitude: number): Promise<string> {
        const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), localityLanguage: 'zh' });
        const res = await fetch('https://api-bdc.io/data/reverse-geocode-client?' + params, { signal: AbortSignal.timeout(10000) });
        if (!res.ok)
            throw new Error('位置名称暂不可用');
        const data = await res.json() as {
            city?: string;
            locality?: string;
            principalSubdivision?: string;
        };
        const name = [data.city, data.locality, data.principalSubdivision].find(value => value?.trim())?.trim();
        if (!name)
            throw new Error('位置名称暂不可用');
        return name;
    }
    private async fetchUapis(location: Location | null): Promise<UapisWeather> {
        const params = new URLSearchParams({ extended: 'true', forecast: 'true' });
        if (location?.adcode)
            params.set('adcode', location.adcode);
        else if (location?.name)
            params.set('city', location.name);
        const headers: Record<string, string> = {};
        const key = (this.options.apiKey?.() || '').trim();
        if (key)
            headers.Authorization = 'Bearer ' + key;
        const res = await fetch(ENDPOINT + '?' + params, { headers, signal: AbortSignal.timeout(12000) });
        if (res.status === 404)
            throw new Error(CITY_NOT_FOUND);
        if (!res.ok)
            throw new Error('天气服务暂不可用');
        const data = await res.json() as UapisWeather;
        if (!Number.isFinite(data.temperature) || !data.weather?.trim() || !data.weather_icon?.trim())
            throw new Error('天气数据不完整');
        return data;
    }
    private buildInfo(data: UapisWeather, query: Location): WeatherInfo {
        const icon = Number(data.weather_icon);
        const category = mapCategory(icon);
        const reportTime = data.report_time?.trim() || '';
        const reportEpoch = parseReportTime(reportTime);
        const { sunrise, sunset } = dayBounds(data, reportTime);
        return {
            temp: Math.round(data.temperature!),
            code: Number.isFinite(icon) ? icon : -1,
            label: data.weather!.trim(),
            category,
            city: (data.district || data.city || query.name).trim(),
            observedAt: reportEpoch ?? Date.now(),
            stale: false,
            intensity: deriveIntensity(icon, category, data.wind_power),
            feelsLike: typeof data.feels_like === 'number' && Number.isFinite(data.feels_like) ? Math.round(data.feels_like) : undefined,
            humidity: typeof data.humidity === 'number' && Number.isFinite(data.humidity) ? data.humidity : undefined,
            windText: windTextOf(data),
            isDay: sunrise !== undefined && sunset !== undefined && reportEpoch !== null ? reportEpoch >= sunrise && reportEpoch < sunset : undefined,
            sunrise,
            sunset,
        };
    }
    /** 免 Key 回退档：Open-Meteo 坐标直连（0.2.1 原始数据面）。 */
    private async fetchOpenMeteo(query: Location): Promise<WeatherInfo> {
        if (!Number.isFinite(query.latitude) || !Number.isFinite(query.longitude))
            throw new Error(NO_COORDS);
        const params = new URLSearchParams({ latitude: String(query.latitude), longitude: String(query.longitude),
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
            daily: 'sunrise,sunset', timezone: 'auto', forecast_days: '1', timeformat: 'unixtime' });
        const res = await fetch('https://api.open-meteo.com/v1/forecast?' + params, { signal: AbortSignal.timeout(12000) });
        if (!res.ok)
            throw new Error('天气服务暂不可用');
        const data = await res.json() as { current?: Record<string, number>; daily?: { sunrise?: number[]; sunset?: number[] } };
        const cur = data.current;
        if (!cur || !Number.isFinite(cur.temperature_2m) || !Number.isFinite(cur.weather_code))
            throw new Error('天气数据不完整');
        const mapped = mapWmo(cur.weather_code);
        const sunrise = data.daily?.sunrise?.[0];
        const sunset = data.daily?.sunset?.[0];
        return {
            temp: Math.round(cur.temperature_2m),
            code: cur.weather_code,
            label: mapped.label,
            category: mapped.category,
            city: query.name,
            observedAt: Number.isFinite(cur.time) ? cur.time * 1000 : Date.now(),
            stale: false,
            intensity: BASE_INTENSITY[mapped.category],
            feelsLike: Number.isFinite(cur.apparent_temperature) ? Math.round(cur.apparent_temperature) : undefined,
            humidity: Number.isFinite(cur.relative_humidity_2m) ? cur.relative_humidity_2m : undefined,
            windText: Number.isFinite(cur.wind_speed_10m) ? `${Math.round(cur.wind_speed_10m)} km/h` : undefined,
            isDay: cur.is_day === 1,
            sunrise: Number.isFinite(sunrise) ? sunrise : undefined,
            sunset: Number.isFinite(sunset) ? sunset : undefined,
        };
    }
    async setCity(name: string) {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        if (this.location?.name === trimmed) {
            await this.refresh();
            return;
        }
        if (this.keyed()) {
            await this.selectLocation({ name: trimmed });
            return;
        }
        const revision = ++this.revision;
        this.loading = true;
        this.status = '正在查找城市…';
        this.emit();
        try {
            const hits = await this.search(trimmed);
            if (revision !== this.revision)
                return;
            if (!hits.length)
                throw new Error('未找到城市，请试试完整名称');
            await this.selectLocation({ name: hits[0].name, latitude: hits[0].latitude, longitude: hits[0].longitude });
        }
        catch (error) {
            if (revision === this.revision) {
                this.status = error instanceof Error ? error.message : '连接失败';
                this.loading = false;
                this.emit();
            }
        }
    }
    async selectLocation(location: Location) {
        const normalized = normalizeLocation(location);
        if (!normalized)
            return;
        this.location = normalized;
        this.persistLocation();
        if (this.cache && !sameLocation(this.cache.location, this.location)) {
            this.cache = null;
            try {
                localStorage.removeItem(CACHE_KEY);
            }
            catch { /* Storage is optional. */ }
        }
        await this.refresh(true);
    }
    async locateByIp() {
        if (!this.keyed()) {
            this.status = LOCATE_FAILED;
            this.emit();
            return false;
        }
        const revision = ++this.revision;
        this.loading = true;
        this.status = '正在按网络定位当前位置…';
        this.emit();
        try {
            const data = await this.fetchUapis(null);
            if (revision !== this.revision)
                return false;
            const name = (data.district || data.city || '').trim();
            if (!name)
                throw new Error(LOCATE_FAILED);
            await this.selectLocation({ name, adcode: data.adcode?.trim() || undefined });
            return true;
        }
        catch {
            if (revision !== this.revision)
                return false;
            this.status = LOCATE_FAILED;
            this.loading = false;
            this.emit();
            return false;
        }
    }
    async refresh(force = false) {
        if (!this.location) {
            this.emit();
            return;
        }
        if (!force && this.cache && Date.now() - this.cache.fetchedAt < TTL) {
            this.emit();
            return;
        }
        const revision = ++this.revision;
        const query = { ...this.location };
        if (this.cache)
            this.cache.info.stale = Date.now() - this.cache.fetchedAt >= TTL;
        this.loading = true;
        this.status = '正在更新天气…';
        this.emit();
        try {
            let info: WeatherInfo;
            if (this.keyed()) {
                const data = await this.fetchUapis(query);
                if (revision !== this.revision)
                    return;
                // 国内回包携带 adcode 时回写锚点，后续刷新按区划码精确查询。
                if (data.adcode?.trim() && !query.adcode) {
                    this.location = { ...query, adcode: data.adcode.trim() };
                    this.persistLocation();
                }
                info = this.buildInfo(data, query);
            }
            else {
                info = await this.fetchOpenMeteo(query);
                if (revision !== this.revision)
                    return;
            }
            this.cache = { location: this.location, fetchedAt: Date.now(), info };
            this.status = '天气已更新';
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache));
            }
            catch { /* Session weather remains usable. */ }
        }
        catch (error) {
            if (revision !== this.revision)
                return;
            if (this.cache)
                this.cache.info.stale = true;
            this.status = error instanceof Error && (error.message === CITY_NOT_FOUND || error.message === NO_COORDS)
                ? error.message
                : this.cache ? '连接暂不可用 · 显示上次天气' : '天气连接失败，请稍后重试';
        }
        finally {
            if (revision === this.revision) {
                this.loading = false;
                this.emit();
            }
        }
    }
}
export function weatherText(info: WeatherInfo): string { return `${info.temp}° ${info.label}${info.stale ? ' · 上次天气' : ''}`; }
