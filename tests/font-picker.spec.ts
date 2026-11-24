import { test, expect } from '@playwright/test';

test('built-in font cards apply instantly and keep the selection after reload', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  await page.getByRole('button',{name:'字体风格 得意黑 · Smiley Sans'}).click();
  await expect(page.locator('.clock-time')).toHaveCSS('font-family', /Smiley Sans/);
  expect(await page.evaluate(async () => (await document.fonts.load('400 32px "Smiley Sans"', '12:34')).length)).toBeGreaterThan(0);
  await page.reload();
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  await expect(page.getByRole('button',{name:'字体风格 得意黑 · Smiley Sans'})).toHaveAttribute('aria-pressed','true');
});

test('Playfair ships as a bundled latin subset and survives reload', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  await page.getByRole('button',{name:'字体风格 优雅衬线 · Playfair'}).click();
  await expect(page.locator('.clock-time')).toHaveCSS('font-family', /Playfair Display/);
  expect(await page.evaluate(async () => (await document.fonts.load('400 32px "Playfair Display"', '12:34')).length)).toBeGreaterThan(0);
  await page.reload();
  await page.evaluate(() => window.desktop.customizer.open('appearance'));
  await expect(page.getByRole('button',{name:'字体风格 优雅衬线 · Playfair'})).toHaveAttribute('aria-pressed','true');
});

test('local fonts load only on click, stay searchable and yield to a built-in card', async ({page}) => {
  await page.route('**/__local-fonts',route=>route.fulfill({status:404,body:''}));
  await page.addInitScript(() => {
    Object.defineProperty(window,'queryLocalFonts',{value: async () => Array.from({length:450},(_,i)=>({family:`Test Font ${String(i).padStart(3,'0')}`,fullName:`测试字体 ${i}`}))});
  });
  await page.goto('/');
  await page.evaluate(()=>window.desktop.customizer.open('appearance'));
  await expect(page.locator('.font-option')).toHaveCount(0);
  await expect(page.getByLabel('手动输入字体名称')).toHaveCount(0);
  await page.getByRole('button',{name:'读取系统字体',exact:true}).click();
  await expect(page.locator('.font-read-status')).toContainText('450 个字体家族');
  await page.getByRole('searchbox',{name:'搜索系统字体'}).fill('测试字体 449');
  await page.getByRole('button',{name:'选择字体 Test Font 449',exact:true}).click();
  expect(await page.evaluate(()=>window.desktop.store.get('appearance.fontCustom'))).toBe('Test Font 449');
  await page.getByRole('button',{name:'字体风格 等宽'}).click();
  expect(await page.evaluate(()=>window.desktop.store.get('appearance.fontCustom'))).toBe('');
  expect(await page.evaluate(()=>window.desktop.store.get('appearance.font'))).toBe('mono');
});

test('font permission errors explain how to retry', async ({page}) => {
  await page.route('**/__local-fonts',route=>route.fulfill({status:404,body:''}));
  await page.addInitScript(()=>Object.defineProperty(window,'queryLocalFonts',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
  await page.goto('/');
  await page.evaluate(()=>window.desktop.customizer.open('appearance'));
  await page.getByRole('button',{name:'读取系统字体',exact:true}).click();
  await expect(page.locator('.font-read-status')).toContainText('未获得本机字体访问权限');
  await expect(page.getByRole('button',{name:'重新读取系统字体'})).toBeEnabled();
});

test('Edge can enumerate actual installed system fonts in an isolated authorized test session', async ({page,context}) => {
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  await session.send('Browser.setPermission',{permission:{name:'local-fonts'},setting:'granted',origin:'http://127.0.0.1:5192'});
  await page.goto('/');
  await page.evaluate(()=>window.desktop.customizer.open('appearance'));
  await page.getByRole('button',{name:'读取系统字体',exact:true}).click();
  await expect(page.locator('.font-read-status')).toContainText(/已读取 [1-9]\d* 个字体家族/);
  await expect(page.locator('.font-option').first()).toBeVisible();
  await page.locator('.font-option').first().click();
  const {root} = await session.send('DOM.getDocument');
  const hours = await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.clock-time .hours'});
  const sample = await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.font-option:first-child strong'});
  const rendered = await session.send('CSS.getPlatformFontsForNode',{nodeId:hours.nodeId});
  const preview = await session.send('CSS.getPlatformFontsForNode',{nodeId:sample.nodeId});
  expect(rendered.fonts.length).toBeGreaterThan(0);
  for(const face of rendered.fonts) expect(preview.fonts.map(f=>f.postScriptName)).toContain(face.postScriptName);
  await expect(page.locator('.clock-time')).toHaveCSS('font-weight','400');
  await expect(page.locator('.clock-time')).toHaveCSS('font-variant-numeric','normal');
  const font = await page.evaluate(()=>window.desktop.store.get<string>('appearance.fontCustom'));
  await expect(page.locator('.clock-time')).toHaveCSS('font-family',new RegExp(font.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await page.screenshot({path:'artifacts/system-font-picker.png'});
});

test('selecting installed faces changes the actual platform font, even after a bold preset',async({page,context})=>{
  await page.goto('/');
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const faces: string[] = [];
  for(const name of ['Arial','Georgia','Courier New']) {
    await page.evaluate(name=>{window.desktop.store.set('appearance.font','display'); window.desktop.store.set('appearance.fontCustom',name);},name);
    await page.evaluate(()=>document.fonts.ready);
    const {root}=await session.send('DOM.getDocument');
    const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.clock-time .hours'});
    const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});
    expect(fonts[0].familyName).toBe(name);
    faces.push(fonts[0].postScriptName);
    await expect(page.locator('.clock-time')).toHaveCSS('font-weight','400');
    await expect(page.locator('.clock-time')).toHaveCSS('letter-spacing','normal');
  }
  expect(new Set(faces).size).toBe(3);
});
