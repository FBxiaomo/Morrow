import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-27T17:24:18+08:00'));
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.desktop);
});

test('browser head and installed identity carry the English product name', async ({ page }) => {
  await expect(page).toHaveTitle('Morrow · 天气氛围与专注时钟');
  const manifest = await page.evaluate(async () => (await (await fetch('/manifest.webmanifest')).json()) as { name: string; short_name: string });
  expect(manifest.name).toBe('Morrow · 天气氛围与专注时钟');
  expect(manifest.short_name).toBe('Morrow');
});

test('focus has a complete task flow and double space never ends it', async ({ page }) => {
  await page.locator('.toolbar-focus').click();
  await expect(page.locator('.focus-dialog')).toBeVisible();
  await page.getByLabel('专注任务').fill('完成发布演示初稿');
  await page.locator('[data-minutes="15"]').click();
  await page.locator('.focus-setup .focus-start').click();
  await expect(page.locator('.focus-running')).toBeVisible();
  await expect(page.locator('.focus-status')).toContainText('完成发布演示初稿');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.desktop.pomodoro.isActive())).toBe(true);
  await page.locator('.focus-status').click();
  await page.clock.setFixedTime(new Date('2026-10-27T17:25:18+08:00'));
  await page.locator('.focus-stop').click();
  await expect(page.locator('.focus-review')).toBeVisible();
  await expect(page.locator('.review-copy')).toContainText('完成发布演示初稿');
  await page.locator('.review-again').click();
  await expect(page.locator('.today-count')).toHaveText('1 段');
});

test('pure display keeps the clock and always has an exit', async ({ page }) => {
  await page.locator('[data-action="pure"]').click();
  await expect(page.locator('body')).toHaveClass(/pure-mode/);
  await expect(page.locator('.toolbar')).not.toBeVisible();
  await expect(page.locator('.clock-time')).toBeVisible();
  await expect(page.locator('.pure-exit')).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.locator('body')).not.toHaveClass(/pure-mode/);
  await expect(page.locator('.toolbar')).toBeVisible();
});

test('editorial compact landscape keeps all necessary regions separate', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    const { themes, store } = window.desktop;
    themes.switch('editorial');
    store.set('appearance.motion', 'off');
    store.set('appearance.font', 'display');
    store.set('appearance.size', 135);
    store.set('content.secondsStyle', 'both');
    store.set('content.format', '12');
    store.set('content.cities', '东京,伦敦,纽约,巴黎,香港');
  });
  const regions = await page.locator('.clock-time, .clock-date, .world-clocks, .desktop-footer, .topbar').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect();
    return { name: element.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }));
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i], b = regions[j];
      const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      expect(overlaps, `${a.name} should not overlap ${b.name}`).toBe(false);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('storage write failure is visible instead of claiming autosave', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Denied', 'QuotaExceededError'); };
  });
  await page.reload();
  await page.waitForFunction(() => !!window.desktop);
  await page.evaluate(() => window.desktop.customizer.open('general'));
  await expect(page.locator('.save-note')).toContainText('仅本次有效');
  await expect(page.locator('.storage-retry')).toBeVisible();
});
