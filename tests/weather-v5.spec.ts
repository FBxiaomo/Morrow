import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T12:08:36+08:00'));
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.desktop?.landscape.diagnostics.sceneReady);
});

test('seconds have four presentations and remain independent of focus progress', async ({ page }) => {
  for (const mode of ['off', 'digits', 'bar', 'both']) {
    await page.evaluate(mode => window.desktop.store.set('content.secondsStyle', mode), mode);
    await expect(page.locator('.seconds')).toHaveText(mode === 'digits' || mode === 'both' ? '36' : '');
    if (mode === 'bar' || mode === 'both') await expect(page.getByRole('progressbar', { name: '秒进度' })).toBeVisible();
    else await expect(page.locator('.seconds-display')).toBeHidden();
  }
  await page.evaluate(() => window.desktop.pomodoro.toggle());
  await expect(page.locator('.focus-progress')).toBeVisible();
  await expect(page.locator('.clock-progress')).toHaveAttribute('aria-valuenow', '36');
  expect(await page.locator('.clock-progress i').evaluate(el => (el as HTMLElement).style.transform)).toBe('scaleX(0.6)');
  await page.clock.setFixedTime(new Date('2026-10-28T12:09:00+08:00'));
  await expect(page.locator('.seconds')).toHaveText('00');
  await expect(page.locator('.clock-progress')).toHaveAttribute('aria-valuenow', '0');
  expect(await page.locator('.clock-progress i').evaluate(el => (el as HTMLElement).style.transform)).toBe('scaleX(0)');
  await page.evaluate(() => window.desktop.store.set('content.secondsStyle', 'off'));
  await expect(page.locator('.focus-progress')).toBeVisible();
  await expect(page.locator('.seconds-display')).toBeHidden();
});

test('legacy per-theme seconds preferences migrate without losing personalization', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('horloge.theme-profiles.v1', JSON.stringify({
    sky: { 'content.seconds': true, 'appearance.font': 'mono' },
    studio: { 'content.seconds': false },
  })));
  await page.reload();
  await expect(page.locator('.seconds')).toHaveText('36');
  expect(await page.evaluate(() => window.desktop.store.get('appearance.font'))).toBe('mono');
  expect(await page.evaluate(() => window.desktop.store.get('content.secondsStyle'))).toBe('both');
  await page.evaluate(() => window.desktop.themes.switch('studio'));
  expect(await page.evaluate(() => window.desktop.store.get('content.secondsStyle'))).toBe('bar');
  await page.evaluate(() => window.desktop.store.set('content.secondsStyle', 'digits'));
  await page.reload();
  await expect(page.locator('.seconds')).toHaveText('36');
  await expect(page.locator('.seconds-display')).toBeHidden();
});

test('real rain hits glyphs, sheds drops and stops its expensive renderer in light mode', async ({ page }) => {
  await page.evaluate(() => {
    const { store } = window.desktop;
    store.set('weather.mode', 'manual'); store.set('weather.manual', 'rain');
    store.set('weather.intensity', 100); store.set('weather.quality', 'realistic');
    store.set('content.secondsStyle', 'both');
  });
  await expect(page.locator('.weather-fx')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.collisions ?? 0)).toBeGreaterThan(10);
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.drips ?? 0)).toBeGreaterThan(0);
  const active = await page.evaluate(() => window.desktop.landscape.diagnostics.effects!);
  expect(active.emittedSplashes).toBeGreaterThan(20);
  expect(active.surfacePoints).toBeGreaterThan(30);
  expect(active.particles).toBeLessThanOrEqual(700);
  expect(active.beads).toBeLessThanOrEqual(100);
  expect(active.glass).toBe(0);
  await page.evaluate(() => { window.desktop.store.set('weather.wetClock', false); window.desktop.store.set('weather.glass', false); });
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.beads)).toBe(0);
  const stopped = await page.evaluate(() => window.desktop.landscape.diagnostics.effects!);
  await page.waitForTimeout(250);
  const noInteraction = await page.evaluate(() => window.desktop.landscape.diagnostics.effects!);
  expect(noInteraction.collisions).toBe(stopped.collisions);
  expect(noInteraction.glass).toBe(0);
  expect(noInteraction.particles).toBeGreaterThan(0);
  await page.evaluate(() => window.desktop.store.set('weather.visual', false));
  await expect(page.locator('.weather-fx')).toHaveCount(0);
  await page.evaluate(() => window.desktop.store.set('weather.visual', true));
  await expect(page.locator('.weather-fx')).toHaveCount(1);
  await page.evaluate(() => window.desktop.store.set('weather.quality', 'light'));
  await expect(page.locator('.weather-fx')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktop.landscape.diagnostics.effects)).toBeNull();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-weather-quality', 'light');
  await expect(page.locator('.weather-fx')).toHaveCount(0);
});

test('studio rain shares the particle renderer and wet interaction with the other themes', async ({ page }) => {
  await page.evaluate(() => {
    const { store, themes } = window.desktop;
    themes.switch('studio');
    store.set('weather.mode', 'manual'); store.set('weather.manual', 'rain');
    store.set('weather.quality', 'realistic'); store.set('weather.intensity', 100);
    store.set('appearance.motion', 'full'); store.set('content.secondsStyle', 'both');
  });
  await page.waitForFunction(() => window.desktop.landscape.diagnostics.sceneReady);
  // The indoor theme gets the very same realistic particle layer, never a bespoke substitute.
  await expect(page.locator('.weather-fx')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.particles ?? 0)).toBeGreaterThan(0);
  // Digits get wet and shed drops exactly like the outdoor themes.
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.collisions ?? 0)).toBeGreaterThan(10);
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.drips ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.surfacePoints ?? 0)).toBeGreaterThan(10);
  // The wet-clock switch stays a real, enabled control for studio.
  await page.evaluate(() => window.desktop.customizer.open('weather'));
  await expect(page.getByLabel('雨雪与数字互动', { exact: true })).toBeEnabled();
  await page.evaluate(() => { window.desktop.store.set('weather.wetClock', false); window.desktop.store.set('weather.visual', false); });
  await expect(page.locator('.weather-fx')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktop.landscape.diagnostics.effects)).toBeNull();
  await page.evaluate(() => { window.desktop.store.set('weather.visual', true); window.desktop.store.set('weather.wetClock', true); });
  await expect(page.locator('.weather-fx')).toHaveCount(1);
});

test('wet digits survive a clock update, while static and reduced motion freeze all weather pixels', async ({ page }) => {
  const fingerprint = () => page.evaluate(async () => {
    const pixels = Array.from(document.querySelectorAll<HTMLCanvasElement>('#stage, .weather-fx')).map(c => c.toDataURL()).join('|');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pixels));
    return Array.from(new Uint8Array(hash)).join(',');
  });
  await page.evaluate(() => {
    const { store } = window.desktop;
    store.set('weather.mode', 'manual'); store.set('weather.manual', 'rain');
    store.set('weather.quality', 'realistic'); store.set('appearance.motion', 'off');
    store.set('content.secondsStyle', 'both');
  });
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.beads ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  const before = await fingerprint();
  await page.waitForTimeout(450);
  expect(await fingerprint()).toBe(before);
  const revision = await page.evaluate(() => window.desktop.landscape.diagnostics.effects!.surfaceRevision);
  await page.clock.setFixedTime(new Date('2026-10-28T12:08:37+08:00'));
  await expect(page.locator('.seconds')).toHaveText('37');
  await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects!.surfaceRevision)).toBeGreaterThan(revision);
  expect(await page.evaluate(() => window.desktop.landscape.diagnostics.effects!.beads)).toBeGreaterThan(0);
  const updated = await fingerprint();
  await page.waitForTimeout(250);
  expect(await fingerprint()).toBe(updated);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.desktop.store.set('appearance.motion', 'full'));
  await page.waitForTimeout(100);
  const reduced = await fingerprint();
  await page.waitForTimeout(350);
  expect(await fingerprint()).toBe(reduced);
});

test('realistic rain and snow follow font, theme and viewport changes without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    const { store } = window.desktop;
    store.set('weather.quality', 'realistic'); store.set('weather.mode', 'manual');
    store.set('weather.manual', 'snow'); store.set('appearance.motion', 'off');
  });
  for (const viewport of [{ width: 1600, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ['sky', 'studio', 'window', 'editorial']) {
      const before = await page.evaluate(() => window.desktop.landscape.diagnostics.effects?.surfaceRevision ?? 0);
      await page.evaluate(id => {
        const { themes, store } = window.desktop;
        themes.switch(id); store.set('appearance.motion', 'off');
        store.set('appearance.font', 'display'); store.set('content.secondsStyle', 'both');
        window.dispatchEvent(new Event('clock-layoutchange'));
      }, theme);
      if (theme !== 'window') await expect.poll(() => page.evaluate(() => window.desktop.landscape.diagnostics.effects?.surfaceRevision ?? 0)).toBeGreaterThan(before);
      await page.waitForFunction(() => window.desktop.landscape.diagnostics.sceneReady);
      const state = await page.evaluate(() => window.desktop.landscape.diagnostics.effects!);
      if (theme === 'window') expect(state.surfacePoints).toBe(0);
      else expect(state.surfacePoints).toBeGreaterThan(10);
      expect(state.particles).toBeGreaterThan(0);
      expect(await page.locator('.weather-fx').evaluate(el => (el as HTMLCanvasElement).width)).toBe(viewport.width);
    }
  }
  await page.evaluate(() => window.desktop.customizer.open('weather'));
  await page.getByLabel('天气画质', { exact: true }).selectOption('light');
  await expect(page.locator('.weather-fx')).toHaveCount(0);
  await expect(page.getByLabel('雨雪与数字互动', { exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('hot theme switches keep the glyph surface aligned with the settled digits', async ({ page }) => {
  await page.evaluate(() => {
    const { store, themes } = window.desktop;
    themes.switch('sky');
    store.set('weather.mode', 'manual'); store.set('weather.manual', 'rain');
    store.set('weather.quality', 'realistic'); store.set('weather.intensity', 100);
    store.set('appearance.motion', 'full'); store.set('content.secondsStyle', 'off');
  });
  await page.waitForFunction(() => window.desktop.landscape.diagnostics.sceneReady);
  await page.waitForTimeout(2000);
  // Collision surface bounds versus the digit box they must represent (5px padding).
  const drift = () => page.evaluate(() => {
    const effects = (window.desktop.landscape as unknown as { effects: null | { surface: { bounds: { x: number; y: number } } } }).effects;
    const spans = Array.from(document.querySelectorAll<HTMLElement>('.clock-time > span')).filter(el => el.textContent && el.offsetWidth);
    const rects = spans.map(el => el.getBoundingClientRect());
    const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
    const bounds = effects?.surface.bounds;
    return bounds ? Math.max(Math.abs(bounds.x - (left - 5)), Math.abs(bounds.y - (top - 5))) : 99;
  });
  expect(await drift()).toBeLessThanOrEqual(2);
  // The entrance animation moves the digits: alignment must return once it settles.
  await page.evaluate(() => window.desktop.themes.switch('studio'));
  await expect.poll(drift, { timeout: 5000 }).toBeLessThanOrEqual(2);
  // Static mode freezes the render loop, so the settle must still trigger exactly one re-read.
  await page.evaluate(() => { window.desktop.store.set('appearance.motion', 'off'); window.desktop.themes.switch('editorial'); });
  await expect.poll(drift, { timeout: 5000 }).toBeLessThanOrEqual(2);
});
