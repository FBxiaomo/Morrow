import { test, expect } from '@playwright/test';

test('settings dock on the right keeps the page visible, interactive and focused', async ({ page }) => {
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.route('https://**/*uapis.cn/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.desktop);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.desktop.store.set('appearance.motion', 'off'));
  await page.waitForTimeout(100);
  // The panel takes focus while open, remembering the opener for the restore.
  await page.evaluate(() => {
    const btn = document.querySelector('.toolbar button') as HTMLElement;
    btn.dataset.opener = 'yes';
    btn.focus();
    window.desktop.customizer.open('themes');
  });
  await expect(page.locator('.customizer')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.classList.contains('customizer'))).toBe(true);
  // Headless Chromium starts CSS animations late; geometry assertions need the dock fully slid in.
  await page.waitForFunction(() => {
    const el = document.querySelector('.customizer') as HTMLElement | null;
    return !!el && el.getAnimations().every(a => a.playState === 'finished');
  });
  const shell = await page.locator('.customizer').boundingBox();
  expect(shell!.y).toBeCloseTo(0, 0);
  expect(shell!.x + shell!.width).toBeCloseTo(1440, 0);
  expect(shell!.height).toBeCloseTo(900, 0);
  // The dock keeps the centered clock in view; at most a sliver of the glyph edge may hide.
  const painted = await page.locator('.clock-time').evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });
  expect(Math.max(0, painted.right - shell!.x)).toBeLessThan((painted.right - painted.left) * 0.05);
  // The page stays interactive: the theme shortcut works while the panel holds focus.
  await page.keyboard.press('2');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'studio');
  // Clicking the page outside the dock must not close it.
  await page.mouse.click(300, 500);
  await expect(page.locator('.customizer')).toBeVisible();
  // Closing over the buttons returns focus to the opener.
  await page.locator('.customizer .done').click();
  await expect(page.locator('.customizer')).not.toBeVisible();
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.opener)).toBe('yes');
});

test('settings become a full-screen sheet on narrow viewports', async ({ page }) => {
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.route('https://**/*uapis.cn/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.desktop);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.desktop.customizer.open('themes'));
  await page.waitForFunction(() => {
    const el = document.querySelector('.customizer') as HTMLElement | null;
    return !!el && el.getAnimations().every(a => a.playState === 'finished');
  });
  const shell = await page.locator('.customizer').boundingBox();
  expect(shell!.x).toBeCloseTo(0, 0);
  expect(shell!.y).toBeCloseTo(0, 0);
  expect(shell!.x + shell!.width).toBeCloseTo(390, 0);
  expect(shell!.y + shell!.height).toBeCloseTo(844, 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.customizer')).not.toBeVisible();
});

test('settings tabs keep their shell and navigation fixed on desktop and mobile', async ({ page }) => {
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.route('https://**/*uapis.cn/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.desktop);
  await page.evaluate(() => window.desktop.store.set('appearance.motion', 'off'));
  for (const viewport of [{width:1600,height:1000}, {width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const clock = await page.locator('.clock-time').boundingBox();
    const desktop = await page.locator('.desktop').boundingBox();
    await page.evaluate(() => window.desktop.customizer.open('themes'));
    // Wait for the slide-in animation to finish: headless Chromium may start it hundreds of ms late.
    await page.waitForFunction(() => {
      const el = document.querySelector('.customizer') as HTMLElement | null;
      return !!el && el.getAnimations().every(a => a.playState === 'finished');
    });
    expect(await page.locator('.clock-time').boundingBox()).toEqual(clock);
    expect(await page.locator('.desktop').boundingBox()).toEqual(desktop);
    const shell = await page.locator('.customizer').boundingBox();
    const nav = await page.locator('.customizer-tabs').boundingBox();
    const footer = await page.locator('.customizer-footer').boundingBox();
    for (const section of ['appearance', 'weather', 'content', 'themes']) {
      await page.locator(`[data-tab="${section}"]`).click();
      expect(await page.locator('.customizer').boundingBox()).toEqual(shell);
      expect(await page.locator('.customizer-tabs').boundingBox()).toEqual(nav);
      expect(await page.locator('.customizer-footer').boundingBox()).toEqual(footer);
      await expect(page.locator(`[data-tab="${section}"]`)).toHaveAttribute('aria-current', 'page');
      const keys = await page.locator('.customizer-content [data-setting]').evaluateAll(elements=>elements.map(el=>(el as HTMLElement).dataset.setting));
      expect(new Set(keys).size).toBe(keys.length);
      if(section === 'appearance') {
        await expect(page.locator('.customizer-content > .settings-group > h2')).toHaveText(['字体与字形','排版与配色','背景画面','画面氛围','动态与安静']);
        await expect(page.getByLabel('秒的显示',{exact:true})).toHaveCount(0);
      }
      if(section === 'content') await expect(page.getByLabel('秒的显示',{exact:true})).toBeVisible();
    }
    expect(shell!.x).toBeGreaterThanOrEqual(0);
    expect(shell!.y).toBeGreaterThanOrEqual(0);
    expect(shell!.x + shell!.width).toBeLessThanOrEqual(viewport.width);
    if (viewport.width === 1600) {
      await page.screenshot({path:'artifacts/settings-glass-themes.png'});
      await page.locator('[data-tab="weather"]').click();
      await page.screenshot({path:'artifacts/settings-glass-weather.png'});
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.customizer')).not.toBeVisible();
  }
});

test('two-option settings switch via segmented buttons instead of dropdowns', async ({ page }) => {
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.route('https://**/*uapis.cn/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.desktop);
  await page.evaluate(() => window.desktop.customizer.open('content'));
  await page.waitForFunction(() => {
    const el = document.querySelector('.customizer') as HTMLElement | null;
    return !!el && el.getAnimations().every(a => a.playState === 'finished');
  });
  const format = page.locator('.segment[data-setting="content.format"]');
  await expect(format).toBeVisible();
  await expect(format.getByRole('button', { name: '24 小时' })).toHaveAttribute('aria-pressed', 'true');
  await format.getByRole('button', { name: '12 小时' }).click();
  expect(await page.evaluate(() => window.desktop.store.get('content.format'))).toBe('12');
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('desktop.v2.settings')!) as Record<string, string>)['content.format'])).toBe('12');
  await expect(format.getByRole('button', { name: '12 小时' })).toHaveAttribute('aria-pressed', 'true');
  await expect(format.getByRole('button', { name: '24 小时' })).toHaveAttribute('aria-pressed', 'false');
  const heights = await format.locator('button').evaluateAll(buttons => buttons.map(btn => btn.getBoundingClientRect().height));
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(40);
  await page.locator('[data-tab="weather"]').click();
  await expect(page.locator('.segment[data-setting="weather.quality"]')).toBeVisible();
  await expect(page.locator('.segment[data-setting="weather.mode"]')).toBeVisible();
  await expect(page.locator('select[data-setting="content.format"]')).toHaveCount(0);
  await expect(page.locator('select[data-setting="weather.quality"]')).toHaveCount(0);
  await expect(page.locator('select[data-setting="weather.mode"]')).toHaveCount(0);
  await page.locator('.segment[data-setting="weather.mode"]').getByRole('button', { name: '自选天气' }).click();
  expect(await page.evaluate(() => window.desktop.store.get('weather.mode'))).toBe('manual');
  await page.screenshot({path:'artifacts/settings-glass-segment.png'});
});
