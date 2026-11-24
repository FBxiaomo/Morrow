import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*open-meteo.com/**', route => route.abort());
  await page.route('https://**/*uapis.cn/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.desktop);
  await page.evaluate(() => window.desktop.store.set('appearance.motion', 'off'));
});

test('settings render their own dropdown menu instead of a native select', async ({ page }) => {
  await page.evaluate(() => window.desktop.customizer.open('content'));
  const trigger = page.locator('[data-setting="content.secondsStyle"]');
  await expect(trigger).toBeVisible();
  expect(await page.locator('.customizer select').count()).toBe(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toContainText('秒进度条');

  await trigger.click();
  const menu = page.locator('.select-menu:not([hidden])');
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('option')).toHaveCount(4);
  await expect(menu.getByRole('option', { name: '秒进度条' })).toHaveAttribute('aria-selected', 'true');

  await menu.getByRole('option', { name: '数字秒数' }).click();
  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktop.store.get('content.secondsStyle'))).toBe('digits');
  await expect(trigger).toContainText('数字秒数');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('select-trigger'))).toBe(true);
});

test('keyboard opens, moves and confirms without a native popup', async ({ page }) => {
  await page.evaluate(() => window.desktop.customizer.open('content'));
  const trigger = page.locator('[data-setting="content.secondsStyle"]');
  await trigger.focus();

  await page.keyboard.press('ArrowDown');
  const menu = page.locator('.select-menu:not([hidden])');
  await expect(menu).toBeVisible();
  const firstActive = await trigger.getAttribute('aria-activedescendant');
  expect(firstActive).toBeTruthy();

  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('option', { name: '数字 + 进度条' })).toHaveClass(/active/);
  expect(await trigger.getAttribute('aria-activedescendant')).not.toBe(firstActive);

  await page.keyboard.press('Enter');
  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktop.store.get('content.secondsStyle'))).toBe('both');
  await expect(trigger).toContainText('数字 + 进度条');
});

test('Escape closes the menu without writing and keeps the panel open', async ({ page }) => {
  await page.evaluate(() => window.desktop.customizer.open('content'));
  const trigger = page.locator('[data-setting="content.secondsStyle"]');
  const before = await page.evaluate(() => window.desktop.store.get('content.secondsStyle'));

  await trigger.click();
  await expect(page.locator('.select-menu:not([hidden])')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');

  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(0);
  await expect(page.locator('.customizer')).toBeVisible();
  expect(await page.evaluate(() => window.desktop.store.get('content.secondsStyle'))).toBe(before);
});

test('the menu dismisses on outside click and on scroll without writing', async ({ page }) => {
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  const trigger = page.locator('[data-setting="background.type"]');
  const before = await page.evaluate(() => window.desktop.store.get('background.type'));

  await trigger.click();
  await expect(page.locator('.select-menu:not([hidden])')).toBeVisible();
  await page.mouse.click(400, 400);
  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktop.store.get('background.type'))).toBe(before);

  await trigger.click();
  await expect(page.locator('.select-menu:not([hidden])')).toBeVisible();
  await page.evaluate(() => { document.querySelector('.customizer-content')!.dispatchEvent(new Event('scroll')); });
  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktop.store.get('background.type'))).toBe(before);
});

test('opening one menu closes the other and switching tabs disposes them', async ({ page }) => {
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  await page.locator('[data-setting="appearance.position"]').click();
  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(1);

  await page.locator('[data-setting="background.type"]').click();
  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(1);
  await expect(page.locator('.select-menu:not([hidden])').getByRole('option', { name: '渐变' })).toBeVisible();

  await page.locator('.customizer-tabs [data-tab="content"]').click();
  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(0);
  // 旧标签的浮层已全部回收，DOM 中只剩当前标签各下拉自己的隐藏浮层
  const triggers = await page.locator('.customizer .select-trigger').count();
  await expect(page.locator('.select-menu')).toHaveCount(triggers);
});

test('a disabled select cannot open its menu', async ({ page }) => {
  await page.evaluate(() => { window.desktop.store.set('weather.mode', 'live'); window.desktop.customizer.open('weather'); });
  const trigger = page.locator('[data-setting="weather.manual"]');
  await expect(trigger).toBeDisabled();
  await trigger.evaluate(el => (el as HTMLElement).click());
  await expect(page.locator('.select-menu:not([hidden])')).toHaveCount(0);

  await page.locator('.segment[data-setting="weather.mode"] [data-value="manual"]').click();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(page.locator('.select-menu:not([hidden])')).toBeVisible();
});

test('trigger and menu keep the panel button language', async ({ page }) => {
  await page.evaluate(() => window.desktop.customizer.open('content'));
  const trigger = page.locator('[data-setting="content.secondsStyle"]');
  const box = await trigger.boundingBox();
  expect(Math.round(box!.height)).toBe(42);
  const triggerStyle = await trigger.evaluate(el => {
    const s = getComputedStyle(el);
    return { radius: s.borderRadius, fontSize: parseFloat(s.fontSize), cursor: s.cursor };
  });
  expect(triggerStyle.radius).toBe('6px');
  expect(triggerStyle.fontSize).toBeGreaterThanOrEqual(11);
  expect(triggerStyle.cursor).toBe('pointer');

  await trigger.click();
  const menu = page.locator('.select-menu:not([hidden])');
  await expect(menu).toBeVisible();
  const optionStyle = await menu.getByRole('option').first().evaluate(el => {
    const s = getComputedStyle(el);
    return { minHeight: parseFloat(s.minHeight), fontSize: parseFloat(s.fontSize) };
  });
  expect(optionStyle.minHeight).toBeGreaterThanOrEqual(40);
  expect(optionStyle.fontSize).toBeGreaterThanOrEqual(11);
  await expect(menu.getByRole('option', { name: '秒进度条' }).locator('.select-check')).toHaveCSS('opacity', '1');
  expect(await page.locator('select').count()).toBe(0);
});
