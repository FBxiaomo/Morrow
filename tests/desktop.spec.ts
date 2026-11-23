import { test, expect } from '@playwright/test';
import type { SettingsStore } from '../src/data/settings';
import type { ThemeManager } from '../src/data/themes';
import type { WeatherService } from '../src/data/weather';
import type { Landscape } from '../src/atmosphere/landscape';
import type { Customizer } from '../src/ui/customizer';
import type { PomodoroService } from '../src/data/pomodoro';
declare global {
    interface Window {
        desktop: {
            store: SettingsStore;
            themes: ThemeManager;
            weather: WeatherService;
            landscape: Landscape;
            customizer: Customizer;
            pomodoro: PomodoroService;
        };
    }
}
const forecast = (temp = 18, code = 61) => ({ current: { time: 1793091600, temperature_2m: temp, apparent_temperature: temp - 1, relative_humidity_2m: 72, wind_speed_10m: 8, weather_code: code, is_day: 1, cloud_cover: 90, precipitation: 2 }, daily: { sunrise: [1793052000], sunset: [1793091600] } });
test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-27T17:24:18+08:00'));
    await page.route('https://**/*open-meteo.com/**', route => route.abort());
    await page.goto('/');
    await page.waitForFunction(() => !!window.desktop);
});
test('four themes have independent persistent personal settings and reset', async ({ page }) => {
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'sky');
    await page.evaluate(() => {
        const { store, themes } = window.desktop;
        store.set('appearance.font', 'mono');
        store.set('appearance.size', 120);
        store.set('content.secondsStyle', 'both');
        themes.switch('studio');
    });
    expect(await page.evaluate(() => window.desktop.store.get('appearance.font'))).toBe('sans');
    await page.evaluate(() => { window.desktop.store.set('appearance.position', 'right'); window.desktop.themes.switch('sky'); });
    expect(await page.evaluate(() => window.desktop.store.get('appearance.font'))).toBe('mono');
    await expect(page.locator('.seconds')).toHaveText('18');
    await page.reload();
    expect(await page.evaluate(() => window.desktop.store.get('appearance.size'))).toBe(120);
    await page.evaluate(() => window.desktop.themes.switch('studio'));
    await expect(page.locator('body')).toHaveAttribute('data-position', 'right');
    await page.evaluate(() => window.desktop.themes.reset());
    await expect(page.locator('body')).toHaveAttribute('data-position', 'auto');
    for (const id of ['window', 'editorial', 'sky']) {
        await page.evaluate(id => window.desktop.themes.switch(id), id);
        await expect(page.locator('body')).toHaveAttribute('data-theme', id);
    }
});
test('visual settings controls stay synchronized after reset and modal supports Escape', async ({ page }) => {
    await page.getByRole('button', { name: '个性化' }).click();
    await page.getByLabel('字体', { exact: true }).selectOption('mono');
    await expect(page.locator('.clock-time')).toHaveCSS('font-family', /Cascadia|JetBrains/);
    await page.getByRole('button', { name: '恢复当前主题的默认搭配' }).click();
    await expect(page.getByLabel('字体', { exact: true })).toHaveValue('light');
    await page.keyboard.press('Escape');
    await expect(page.locator('.customizer')).not.toBeVisible();
    await page.keyboard.press('2');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'studio');
});
test('city search resolves ambiguity and connects actual weather', async ({ page }) => {
    await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [{ name: 'London', latitude: 51.5, longitude: -.1, country: '英国' }, { name: 'London', latitude: 43, longitude: -81, country: '加拿大' }] } }));
    await page.route('https://api.open-meteo.com/**', route => {
        expect(new URL(route.request().url()).searchParams.get('longitude')).toBe('-81');
        return route.fulfill({ json: forecast() });
    });
    await page.getByRole('button', { name: '选择天气城市' }).click();
    await page.getByLabel('搜索天气城市').fill('London');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByRole('button', { name: 'London · 加拿大' }).click();
    await expect(page.locator('.weather-status')).toContainText('天气已更新');
    await expect(page.locator('.location-button')).toContainText('London');
    await expect(page.locator('.location-button')).toContainText('18°');
    await expect(page.locator('body')).toHaveAttribute('data-weather', 'rain');
    await page.reload();
    await expect(page.locator('.location-button')).toContainText('London');
    await expect(page.locator('.location-button')).toContainText('18°');
});
test('locate resolves the Chinese place name before connecting actual weather', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 30.2741, longitude: 120.1551 });
    await page.route('https://api.bigdatacloud.net/**', route => route.fulfill({ json: { city: '杭州市', locality: '拱墅区', principalSubdivision: '浙江省' } }));
    await page.route('https://api.open-meteo.com/**', route => {
        expect(new URL(route.request().url()).searchParams.get('latitude')).toBe('30.2741');
        return route.fulfill({ json: forecast() });
    });
    await page.getByRole('button', { name: '选择天气城市' }).click();
    await page.getByRole('button', { name: '使用当前位置' }).click();
    await expect(page.locator('.weather-status')).toContainText('杭州市 · 天气已更新');
    await expect(page.locator('.location-button')).toContainText('杭州市');
    await expect(page.locator('.location-button')).toContainText('18°');
    await page.reload();
    await expect(page.locator('.location-button')).toContainText('杭州市');
});
test('locate falls back to the honest placeholder when the name lookup fails', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 51.5074, longitude: -0.1278 });
    await page.route('https://api.bigdatacloud.net/**', route => route.abort());
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast() }));
    await page.getByRole('button', { name: '选择天气城市' }).click();
    await page.getByRole('button', { name: '使用当前位置' }).click();
    await expect(page.locator('.location-button')).toContainText('当前位置');
    await expect(page.locator('.location-button')).toContainText('18°');
    await expect(page.locator('.weather-status')).toContainText('当前位置 · 天气已更新');
});
test('a late locate result never overwrites a newer city choice', async ({ page }) => {
    let lookups = 0;
    await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [{ name: '伦敦', latitude: 51.5, longitude: -0.1 }] } }));
    await page.route('https://api.bigdatacloud.net/**', route => { lookups++; return route.fulfill({ json: { city: '杭州市' } }); });
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast() }));
    await page.getByRole('button', { name: '选择天气城市' }).click();
    await page.evaluate(() => {
        navigator.geolocation.getCurrentPosition = (ok: (position: GeolocationPosition) => void) => {
            (window as Window & { __releaseLocate?: () => void }).__releaseLocate = () => ok({ coords: { latitude: 30.2741, longitude: 120.1551 } } as GeolocationPosition);
        };
    });
    await page.getByRole('button', { name: '使用当前位置' }).click();
    await page.getByLabel('搜索天气城市').fill('伦敦');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByRole('button', { name: '伦敦' }).click();
    await expect(page.locator('.location-button')).toContainText('伦敦');
    await page.evaluate(() => (window as Window & { __releaseLocate?: () => void }).__releaseLocate?.());
    await expect.poll(() => lookups).toBe(1);
    await expect(page.locator('.location-button')).toContainText('伦敦');
    expect(await page.evaluate(() => window.desktop.weather.current()?.city)).toBe('伦敦');
});
test('manual weather is labeled, all categories render and weather can be disabled', async ({ page }) => {
    await page.evaluate(() => { window.desktop.store.set('weather.mode', 'manual'); window.desktop.store.set('appearance.motion', 'off'); });
    for (const id of ['clear', 'cloudy', 'overcast', 'fog', 'rain', 'snow', 'thunder']) {
        await page.evaluate(id => window.desktop.store.set('weather.manual', id), id);
        await expect(page.locator('body')).toHaveAttribute('data-weather', id);
        await expect(page.locator('.location-button')).toContainText('自选氛围');
        expect(await page.locator('.location-button').textContent()).not.toContain('°');
    }
    await page.evaluate(() => window.desktop.store.set('weather.visual', false));
    await expect(page.locator('body')).toHaveAttribute('data-weather', 'clear');
    await page.evaluate(() => window.desktop.store.set('weather.show', false));
    await expect(page.locator('.location-button')).not.toBeVisible();
    await expect(page.locator('.weather-stats')).toBeEmpty();
});
test('weather request races cannot overwrite a newer city and failures do not reuse another city', async ({ page }) => {
    let release: () => void = () => { };
    const gate = new Promise<void>(resolve => release = resolve);
    let started = false;
    await page.route('https://api.open-meteo.com/**', async (route) => {
        const lat = new URL(route.request().url()).searchParams.get('latitude');
        if (lat === '10') {
            started = true;
            await gate;
            await route.fulfill({ json: forecast(10) });
        }
        else if (lat === '30')
            await route.abort();
        else
            await route.fulfill({ json: forecast(22, 0) });
    });
    await page.evaluate(() => { void window.desktop.weather.selectLocation({ name: '旧城市', latitude: 10, longitude: 10 }); });
    await expect.poll(() => started).toBe(true);
    await page.evaluate(() => window.desktop.weather.selectLocation({ name: '新城市', latitude: 20, longitude: 20 }));
    release();
    await expect(page.locator('.location-button')).toContainText('新城市');
    await expect(page.locator('.location-button')).toContainText('22°');
    await page.evaluate(() => window.desktop.weather.selectLocation({ name: '离线城市', latitude: 30, longitude: 30 }));
    expect(await page.evaluate(() => window.desktop.weather.current())).toBeNull();
    await expect(page.locator('.location-button')).not.toContainText('22°');
});
test('offline refresh keeps old weather with explicit status', async ({ page }) => {
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast() }));
    await page.evaluate(() => window.desktop.weather.selectLocation({ name: '杭州', latitude: 30, longitude: 120 }));
    await page.route('https://api.open-meteo.com/**', route => route.abort());
    await page.evaluate(() => window.desktop.weather.refresh(true));
    await expect(page.locator('.location-button')).toContainText('上次天气');
    expect(await page.evaluate(() => window.desktop.weather.current()?.stale)).toBe(true);
});
test('background upload persists per theme and survives reload', async ({ page }) => {
    await page.evaluate(() => window.desktop.customizer.open('appearance'));
    const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#496b83'; ctx.fillRect(0, 0, 80, 40); return canvas.toDataURL('image/png').split(',')[1]; });
    await page.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.getByLabel('背景', { exact: true })).toHaveValue('image');
    expect(await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('horloge-images', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
        const size = await new Promise<number>(resolve => { const req = db.transaction('images').objectStore('images').get('sky'); req.onsuccess = () => resolve(req.result?.size || 0); });
        db.close();
        return size;
    })).toBeGreaterThan(0);
    await page.evaluate(() => window.desktop.themes.switch('studio'));
    expect(await page.evaluate(() => window.desktop.store.get('background.type'))).toBe('scene');
    await page.evaluate(() => window.desktop.themes.switch('sky'));
    await page.reload();
    expect(await page.evaluate(() => window.desktop.store.get('background.type'))).toBe('image');
});
test('clock widgets and format switches update immediately', async ({ page }) => {
    await page.evaluate(() => { const { store } = window.desktop; store.set('content.format', '12'); store.set('content.world', true); store.set('content.moon', true); store.set('content.secondsStyle', 'both'); });
    await expect(page.locator('.hours')).toHaveText('05');
    await expect(page.locator('.period')).toHaveText('PM');
    await expect(page.locator('.world-clocks>div')).toHaveCount(3);
    await expect(page.locator('.moon-widget')).toBeVisible();
    await page.evaluate(() => { window.desktop.store.set('content.date', false); window.desktop.store.set('content.lunar', false); });
    await expect(page.locator('.clock-date')).toBeEmpty();
    await expect(page.locator('.clock-lunar')).toBeEmpty();
});
test('focus countdown advances stages and pause survives reload', async ({ page }) => {
    await page.evaluate(() => { window.desktop.store.set('focus.work', 5); window.desktop.pomodoro.toggle(); });
    await page.clock.setFixedTime(new Date('2026-10-27T17:29:19+08:00'));
    await page.reload();
    await expect(page.locator('.focus-status')).toContainText('短休');
    expect(await page.evaluate(() => window.desktop.pomodoro.snapshot().phase)).toBe('short');
    await page.evaluate(() => window.desktop.pomodoro.toggle());
    const remaining = await page.evaluate(() => window.desktop.pomodoro.remainingMs());
    await page.clock.setFixedTime(new Date('2026-10-27T17:31:19+08:00'));
    expect(await page.evaluate(() => window.desktop.pomodoro.remainingMs())).toBe(remaining);
    await page.reload();
    expect(await page.evaluate(() => window.desktop.pomodoro.isPaused())).toBe(true);
    await expect(page.locator('.focus-status')).toContainText('已暂停');
});
test('static and reduced motion freeze canvas while time remains usable', async ({ page }) => {
    const fingerprint = () => page.evaluate(async () => {
        const pixels = (document.querySelector('#stage') as HTMLCanvasElement).toDataURL();
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pixels));
        return Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, '0')).join('');
    });
    await page.evaluate(() => { window.desktop.store.set('appearance.motion', 'off'); window.desktop.store.set('weather.mode', 'manual'); window.desktop.store.set('weather.manual', 'rain'); });
    await page.waitForFunction(() => window.desktop.landscape.diagnostics.sceneReady);
    await page.waitForTimeout(100);
    const before = await fingerprint();
    await page.waitForTimeout(220);
    expect(await fingerprint()).toBe(before);
    await page.evaluate(() => window.desktop.store.set('appearance.motion', 'full'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    const reduced = await fingerprint();
    await page.waitForTimeout(220);
    expect(await fingerprint()).toBe(reduced);
});
test('desktop and narrow layouts fit and runtime stays error free', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const viewport of [{ width: 1600, height: 900 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const theme of ['sky', 'studio', 'window', 'editorial']) {
            await page.evaluate(id => { const { themes, store } = window.desktop; themes.switch(id); store.set('appearance.motion', 'off'); store.set('appearance.font', 'display'); store.set('appearance.size', 135); store.set('content.secondsStyle', 'both'); store.set('content.format', '12'); }, theme);
            const bounds = await page.locator('.clock-time').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const r = range.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
            expect(bounds.left).toBeGreaterThanOrEqual(0);
            expect(bounds.right).toBeLessThanOrEqual(viewport.width);
            expect(bounds.top).toBeGreaterThan(50);
            expect(bounds.bottom).toBeLessThan(viewport.height - 100);
        }
    }
    await page.evaluate(() => window.desktop.customizer.open('themes'));
    await expect(page.locator('.theme-card')).toHaveCount(4);
    expect(errors).toEqual([]);
});
test('damaged settings safely fall back to defaults', async ({ page }) => {
    await page.evaluate(() => { localStorage.setItem('desktop.v2.settings', JSON.stringify({ 'weather.manual': 'unknown', 'weather.mode': [], 'appearance.size': 'huge', 'content.cities': 42 })); localStorage.setItem('horloge.theme-profiles.v1', '{"sky":{"appearance.size":"bad","appearance.font":"missing"}}'); });
    await page.reload();
    expect(await page.evaluate(() => window.desktop.store.get('appearance.size'))).toBe(100);
    expect(await page.evaluate(() => window.desktop.store.get('content.cities'))).toBe('东京,伦敦,纽约');
    await expect(page.locator('.clock-time')).toBeVisible();
});
