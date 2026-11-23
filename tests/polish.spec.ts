import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('https://**/*open-meteo.com/**', route => route.abort());
    await page.goto('/');
    await page.waitForFunction(() => !!window.desktop);
});

/** Painted glyph boxes, not element boxes: a full-width block is not a collision. */
const paintedBox = (page: import('@playwright/test').Page, selector: string) =>
    page.locator(selector).evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });

const collides = (a: { right: number; bottom: number; left: number; top: number }, b: typeof a) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5;

for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'tablet', width: 1024, height: 768 },
    { name: 'landscape', width: 844, height: 390 },
]) {
    test(`editorial keeps the world clock clear of the numerals at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.evaluate(() => {
            const { themes, store } = window.desktop;
            themes.switch('editorial');
            store.set('content.world', true);
            store.set('content.moon', true);
            store.set('content.secondsStyle', 'both');
            store.set('appearance.motion', 'off');
        });
        await page.waitForTimeout(300);

        const worldBoxes = await page.locator('.world-clocks > div').evaluateAll(rows =>
            rows.map(el => {
                const r = el.getBoundingClientRect();
                return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
            }));
        expect(worldBoxes.length).toBeGreaterThan(0);

        for (const selector of ['.clock-time', '.clock-meta', '.seconds-display']) {
            const box = await paintedBox(page, selector);
            for (const row of worldBoxes) expect(collides(box, row)).toBe(false);
        }
    });
}

test('settings panel is opaque enough that the clock cannot bleed through', async ({ page }) => {
    await page.evaluate(() => window.desktop.customizer.open('themes'));
    await expect(page.locator('.customizer')).toBeVisible();
    const alpha = await page.locator('.customizer').evaluate(el => {
        const style = getComputedStyle(el);
        const solid = style.backgroundColor;
        // Either a solid colour or a near-opaque background layer counts as opaque.
        const solidMatch = solid.match(/rgba?\(([^)]+)\)/);
        const parts = solidMatch ? solidMatch[1].split(',').map(Number) : null;
        const solidAlpha = parts && parts.length > 3 ? parts[3] : 1;
        return { solid, solidAlpha, hasGradient: style.backgroundImage !== 'none' };
    });
    // The panel must not be a translucent glass sheet over a high-contrast clock.
    expect(alpha.solidAlpha).toBeGreaterThanOrEqual(0.9);
});

test('unresolvable cities are explained in settings and on the clock', async ({ page }) => {
    await page.evaluate(() => window.desktop.customizer.open('content'));
    const input = page.locator('[data-setting="content.cities"]');

    await input.fill('东京,火星基地');
    const warning = page.locator('.city-validation');
    await expect(warning).toHaveClass(/error/);
    await expect(warning).toContainText('火星基地');
    await expect(warning).toContainText('城市未收录');

    await input.fill('东京,伦敦');
    await expect(warning).toHaveClass(/ok/);
    await expect(warning).not.toContainText('未收录');

    await input.fill('Europe/Berlin');
    await expect(warning).toHaveClass(/ok/);

    await input.fill('Mars/Olympus');
    await expect(warning).toContainText('时区名称不存在');

    // The clock explains the failure instead of showing an empty "--:--".
    await page.evaluate(() => {
        window.desktop.store.set('content.cities', '东京,火星基地');
        window.desktop.store.set('content.world', true);
        window.desktop.customizer.close();
    });
    const invalid = page.locator('.world-clocks > div.invalid');
    await expect(invalid).toHaveCount(1);
    await expect(invalid).toContainText('城市未收录');
    expect(await invalid.getAttribute('title')).toContain('IANA');
});

test('interface copy is not set below 11px', async ({ page }) => {
    await page.evaluate(() => window.desktop.customizer.open('appearance'));
    await page.waitForTimeout(200);
    const tooSmall = await page.evaluate(() => {
        const out: string[] = [];
        for (const root of [document.querySelector('.customizer')]) {
            if (!root) continue;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
                const text = node.textContent?.trim();
                if (!text) continue;
                const el = node.parentElement;
                if (!el) continue;
                const size = parseFloat(getComputedStyle(el).fontSize);
                if (size < 11) out.push(`${el.className || el.tagName}:${size}:${text.slice(0, 24)}`);
            }
        }
        return out;
    });
    expect(tooSmall).toEqual([]);
});
