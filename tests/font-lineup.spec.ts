import { test, expect } from '@playwright/test';

test('rebuilt stacks carry distinct bundled faces and the serif twin is gone', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  const cases = [
    { card: '字体风格 轻盈 · Light', family: /Josefin Sans/ },
    { card: '字体风格 无衬线', family: /Barlow Condensed/ },
    { card: '字体风格 圆润', family: /Quicksand/ },
    { card: '字体风格 粗体 · Display', family: /Bebas Neue/ },
  ];
  for (const c of cases) {
    await page.getByRole('button', { name: c.card, exact: true }).click();
    await expect(page.locator('.clock-time')).toHaveCSS('font-family', c.family);
  }
  await page.getByRole('button', { name: '字体风格 等宽', exact: true }).click();
  await expect(page.locator('.clock-time')).toHaveCSS('font-weight', '400');
  await page.getByRole('button', { name: '字体风格 衬线', exact: true }).click();
  const serif = await page.locator('.clock-time').evaluate(el => getComputedStyle(el).fontFamily);
  expect(serif).not.toContain('Playfair');
  expect(serif).toContain('Georgia');
});

test('pixel and kuaile cards ship full Chinese coverage', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  await page.getByRole('button', { name: '字体风格 点阵 · 像素', exact: true }).click();
  await expect(page.locator('.clock-time')).toHaveCSS('font-family', /Fusion Pixel/);
  expect(await page.evaluate(async () => (await document.fonts.load('400 32px "Fusion Pixel 12px Proportional zh_hans"', '此刻 12:34')).length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '字体风格 快乐体 · 站酷', exact: true }).click();
  await expect(page.locator('.clock-time')).toHaveCSS('font-family', /ZCOOL KuaiLe/);
  expect(await page.evaluate(async () => (await document.fonts.load('400 32px "ZCOOL KuaiLe"', '此刻 12:34')).length)).toBeGreaterThan(0);
  await page.reload();
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  await expect(page.getByRole('button', { name: '字体风格 快乐体 · 站酷', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
