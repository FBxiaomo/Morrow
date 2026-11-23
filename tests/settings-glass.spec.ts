import { test, expect } from '@playwright/test';

test('settings tabs keep their shell and navigation fixed on desktop and mobile', async ({ page }) => {
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.desktop);
  await page.evaluate(() => window.desktop.store.set('appearance.motion', 'off'));
  for (const viewport of [{width:1600,height:1000}, {width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const clock = await page.locator('.clock-time').boundingBox();
    const desktop = await page.locator('.desktop').boundingBox();
    await page.evaluate(() => window.desktop.customizer.open('themes'));
    await page.waitForTimeout(350);
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
