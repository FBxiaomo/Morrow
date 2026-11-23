import { test, expect, type Page } from '@playwright/test';

async function rainyWindow(page: Page, still = false) {
  await page.evaluate(still => {
    const { store, themes } = window.desktop;
    themes.switch('window'); store.set('weather.mode', 'manual'); store.set('weather.manual', 'rain');
    store.set('weather.quality', 'realistic'); store.set('weather.intensity', 90);
    store.set('weather.daytime', 'day'); store.set('content.secondsStyle', 'both');
    if (still) store.set('appearance.motion', 'off');
  }, still);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T12:08:36+08:00'));
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.desktop?.landscape.diagnostics.sceneReady);
});

test('window rain refracts the outdoors while the frame and indoor clock stay in front', async ({ page }) => {
  await rainyWindow(page);
  await expect(page.locator('body')).toHaveAttribute('data-window-glass', 'webgl');
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.windowGlass?.draws ?? 0)).toBeGreaterThan(4);
  const state = await page.evaluate(() => window.desktop.landscape.diagnostics);
  expect(state.effects?.collisions).toBe(0);
  expect(state.effects?.wetness).toBe(0);
  expect(state.effects?.particles).toBeGreaterThan(0);
  const layers = await page.evaluate(() => {
    const z = (selector: string) => +getComputedStyle(document.querySelector(selector)!).zIndex;
    return { glass: z('.window-glass'), frame: z('.window-frame'), clock: z('.desktop'), parent: document.querySelector('.window-frame')!.parentElement!.tagName };
  });
  expect(layers.frame).toBeGreaterThan(layers.glass);
  expect(layers.clock).toBeGreaterThan(layers.frame);
  expect(layers.parent).toBe('BODY');
  const frame = await page.locator('.window-frame').boundingBox();
  const rail = await page.locator('.window-mullion').boundingBox();
  const railClip = { x: Math.round(rail!.x + 8), y: 120, width: 8, height: 170 };
  const before = await page.screenshot({ clip: railClip });
  await page.waitForTimeout(200);
  expect((await page.screenshot({ clip: railClip })).equals(before)).toBe(true);
  await page.evaluate(() => window.desktop.customizer.open('weather'));
  expect(await page.locator('.window-frame').boundingBox()).toEqual(frame);
  await expect(page.getByLabel('雨雪与数字互动', { exact: true })).toBeDisabled();
  await expect(page.locator('.quality-note')).toContainText('室内时钟保持清晰');
});

test('glass responds to rain, freezes for static/reduced motion, and bounds its framebuffer', async ({ page }) => {
  await rainyWindow(page, true);
  await expect(page.locator('.window-glass')).toHaveCount(1);
  const hashGlass = () => page.evaluate(async () => {
    const data = (document.querySelector('.window-glass') as HTMLCanvasElement).toDataURL();
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)))).join(',');
  });
  await page.waitForTimeout(100);
  const frozen = await hashGlass();
  await page.waitForTimeout(250);
  expect(await hashGlass()).toBe(frozen);
  await page.evaluate(() => window.desktop.store.set('appearance.motion', 'full'));
  await expect.poll(hashGlass).not.toBe(frozen);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const reduced = await hashGlass();
  await page.waitForTimeout(250);
  expect(await hashGlass()).toBe(reduced);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.windowGlass?.width ?? 0)).toBeGreaterThan(1600);
  const large = await page.evaluate(() => window.desktop.landscape.diagnostics.windowGlass!);
  expect(large.width * large.height).toBeLessThanOrEqual(1_802_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.window-mullion')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.windowGlass?.width ?? 0)).toBe(390);
  await expect(page.locator('.clock-time')).toBeVisible();
});

test('switches release the glass renderer and keep other themes wet', async ({ page }) => {
  await rainyWindow(page, true);
  await expect(page.locator('.window-glass')).toHaveCount(1);
  for (const key of ['weather.glass', 'weather.visual']) {
    await page.evaluate(key => window.desktop.store.set(key, false), key);
    await expect(page.locator('.window-glass')).toHaveCount(0);
    expect(await page.evaluate(() => window.desktop.landscape.diagnostics.windowGlass)).toBeNull();
    await page.evaluate(key => window.desktop.store.set(key, true), key);
    await expect(page.locator('.window-glass')).toHaveCount(1);
  }
  await page.evaluate(() => window.desktop.store.set('weather.manual', 'clear'));
  await expect(page.locator('.window-glass')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-window-glass', 'off');
  await page.evaluate(() => window.desktop.store.set('weather.manual', 'rain'));
  await expect(page.locator('.window-glass')).toHaveCount(1);
  await page.evaluate(() => window.desktop.store.set('weather.quality', 'light'));
  await expect(page.locator('.window-glass')).toHaveCount(0);
  await expect(page.locator('.weather-fx')).toHaveCount(0);
  await expect(page.locator('.window-frame')).toBeVisible();
  await page.evaluate(() => { window.desktop.store.set('weather.quality', 'realistic'); window.desktop.themes.switch('sky'); window.desktop.store.set('appearance.motion', 'off'); });
  await expect(page.locator('.window-glass')).toHaveCount(0);
  await expect(page.locator('.window-frame')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.beads ?? 0)).toBeGreaterThan(0);
});

test('a lost graphics context falls back even when the clock is static', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await rainyWindow(page, true);
  await expect(page.locator('.window-glass')).toHaveCount(1);
  const lost = await page.locator('.window-glass').evaluate(c => {
    const extension = (c as HTMLCanvasElement).getContext('webgl')!.getExtension('WEBGL_lose_context');
    extension?.loseContext(); return !!extension;
  });
  expect(lost).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-window-glass', 'canvas');
  await expect(page.locator('.window-glass')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.glass ?? 0)).toBeGreaterThan(0);
  await expect(page.locator('.clock-time')).toBeVisible();
  expect(errors).toEqual([]);
});

test('screen droplets belong only to window, including after switching away from rain glass', async ({ page }) => {
  await rainyWindow(page, true);
  await expect(page.locator('.window-glass')).toHaveCount(1);
  for (const theme of ['sky', 'studio', 'editorial']) {
    await page.evaluate(id => { window.desktop.themes.switch(id); window.desktop.store.set('appearance.motion', 'off'); }, theme);
    await expect(page.locator('.window-glass')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.glass ?? 0)).toBe(0);
    await page.evaluate(() => window.desktop.customizer.open('weather'));
    await expect(page.getByLabel('前景玻璃水滴', { exact: true })).toBeHidden();
    await page.evaluate(() => window.desktop.customizer.close());
  }
  await page.evaluate(() => { window.desktop.themes.switch('window'); window.desktop.store.set('appearance.motion', 'off'); window.desktop.customizer.open('weather'); });
  await expect(page.getByLabel('前景玻璃水滴', { exact: true })).toBeVisible();
  await expect(page.locator('.window-glass')).toHaveCount(1);
});

test('a browser without WebGL still provides the lightweight glass fallback', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: unknown) {
      if (kind === 'webgl' || kind === 'webgl2') return null;
      return nativeGetContext.call(this, kind as '2d', options as CanvasRenderingContext2DSettings);
    } as typeof nativeGetContext;
  });
  await page.reload();
  await page.waitForFunction(() => window.desktop?.landscape.diagnostics.sceneReady);
  await rainyWindow(page, true);
  await expect(page.locator('body')).toHaveAttribute('data-window-glass', 'canvas');
  await expect(page.locator('.window-glass')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.glass ?? 0)).toBeGreaterThan(0);
  await expect(page.locator('.clock-time')).toBeVisible();
});
