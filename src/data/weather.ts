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
    feelsLike?: number;
    humidity?: number;
    wind?: number;
    cloudCover?: number;
    precipitation?: number;
    isDay?: boolean;
    sunrise?: number;
    sunset?: number;
}
export interface Location {
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country?: string;
}
interface Cache {
    location: Location;
    info: WeatherInfo;
    fetchedAt: number;
}
const CACHE_KEY = 'horloge.weather.v4';
const LOCATION_KEY = 'horloge.weather-location.v1';
const TTL = 30 * 60 * 1000;
export function mapCode(code: number): {
    label: string;
    category: WeatherCategory;
} {
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
export class WeatherService {
    private cache: Cache | null = null;
    private location: Location | null = null;
    private listeners = new Set<(info: WeatherInfo | null) => void>();
    private revision = 0;
    status = '选择城市，让天气走进画面';
    loading = false;
    constructor() {
        try {
            const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Cache | null;
            if (raw && Number.isFinite(raw.location?.latitude) && Number.isFinite(raw.location?.longitude) && Number.isFinite(raw.info?.temp) && Number.isFinite(raw.fetchedAt)) {
                this.cache = raw;
                this.location = raw.location;
                raw.info.stale = Date.now() - raw.fetchedAt >= TTL;
                this.status = raw.info.stale ? '正在显示上次天气' : '天气已更新';
            }
        }
        catch { /* Ignore damaged cache. */ }
        try {
            const saved = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null') as Location | null;
            if (saved && typeof saved.name === 'string' && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) {
                this.location = saved;
                if (this.cache && (this.cache.location.latitude !== saved.latitude || this.cache.location.longitude !== saved.longitude))
                    this.cache = null;
            }
        }
        catch { /* Coordinates are optional. */ }
    }
    onChange(cb: (info: WeatherInfo | null) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
    current() { return this.cache?.info ?? null; }
    hasLocation() { return this.location !== null; }
    private emit() { for (const cb of this.listeners)
        cb(this.current()); }
    async search(name: string): Promise<Location[]> {
        if (name.trim().length < 2)
            return [];
        const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=zh&name=' + encodeURIComponent(name.trim()), { signal: AbortSignal.timeout(10000) });
        if (!res.ok)
            throw new Error('城市搜索暂不可用');
        const data = await res.json() as {
            results?: Location[];
        };
        return (data.results || []).filter(hit => Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude));
    }
    /** Resolves coordinates into a Chinese place name for display; throws when the lookup fails. */
    async reverseGeocode(latitude: number, longitude: number): Promise<string> {
        const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), localityLanguage: 'zh' });
        const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?' + params, { signal: AbortSignal.timeout(10000) });
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
    async setCity(name: string) {
        if (!name.trim())
            return;
        if (this.location?.name === name.trim()) {
            await this.refresh();
            return;
        }
        const revision = ++this.revision;
        this.loading = true;
        this.status = '正在查找城市…';
        this.emit();
        try {
            const hits = await this.search(name);
            if (revision !== this.revision)
                return;
            if (!hits.length)
                throw new Error('未找到城市，请试试完整名称');
            await this.selectLocation(hits[0]);
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
        this.location = location;
        try {
            localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
        }
        catch { /* Session location remains usable. */ }
        if (this.cache && (this.cache.location.latitude !== location.latitude || this.cache.location.longitude !== location.longitude)) {
            this.cache = null;
            try {
                localStorage.removeItem(CACHE_KEY);
            }
            catch { /* Storage is optional. */ }
        }
        await this.refresh(true);
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
        const location = { ...this.location };
        if (this.cache)
            this.cache.info.stale = Date.now() - this.cache.fetchedAt >= TTL;
        this.loading = true;
        this.status = '正在更新天气…';
        this.emit();
        try {
            const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude),
                current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m',
                daily: 'sunrise,sunset', timezone: 'auto', forecast_days: '1', timeformat: 'unixtime' });
            const res = await fetch('https://api.open-meteo.com/v1/forecast?' + params, { signal: AbortSignal.timeout(12000) });
            if (!res.ok)
                throw new Error('天气服务暂不可用');
            const data = await res.json() as {
                current?: Record<string, number>;
                daily?: {
                    sunrise?: number[];
                    sunset?: number[];
                };
            };
            const cur = data.current;
            if (!cur || !Number.isFinite(cur.temperature_2m) || !Number.isFinite(cur.weather_code))
                throw new Error('天气数据不完整');
            if (revision !== this.revision)
                return;
            this.cache = { location, fetchedAt: Date.now(), info: { temp: Math.round(cur.temperature_2m), code: cur.weather_code, ...mapCode(cur.weather_code), city: location.name,
                    observedAt: Number.isFinite(cur.time) ? cur.time * 1000 : Date.now(), stale: false, feelsLike: Math.round(cur.apparent_temperature), humidity: cur.relative_humidity_2m,
                    wind: cur.wind_speed_10m, cloudCover: cur.cloud_cover, precipitation: cur.precipitation, isDay: cur.is_day === 1,
                    sunrise: data.daily?.sunrise?.[0], sunset: data.daily?.sunset?.[0] } };
            this.status = '天气已更新';
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache));
            }
            catch { /* Session weather remains usable. */ }
        }
        catch {
            if (revision !== this.revision)
                return;
            if (this.cache)
                this.cache.info.stale = true;
            this.status = this.cache ? '连接暂不可用 · 显示上次天气' : '天气连接失败，请稍后重试';
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
