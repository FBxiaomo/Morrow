import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('https://**/*open-meteo.com/**', route => route.abort());
    await page.route('https://**/*uapis.cn/**', route => route.abort());
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

test('unresolvable cities are explained on chips and on the clock', async ({ page }) => {
    await page.evaluate(() => {
        window.desktop.store.set('content.cities', '东京,火星基地');
        window.desktop.store.set('content.world', true);
        window.desktop.customizer.open('content');
    });
    // Settings: the bad entry becomes an error chip with the reason on hover.
    const badChip = page.locator('.city-chip.invalid');
    await expect(badChip).toHaveCount(1);
    await expect(badChip).toContainText('火星基地');
    expect(await badChip.getAttribute('title')).toContain('城市未收录');
    await expect(page.locator('.city-picker-status')).toContainText('城市未收录');

    // The clock explains the failure instead of showing an empty "--:--".
    await page.evaluate(() => window.desktop.customizer.close());
    const invalid = page.locator('.world-clocks > div.invalid');
    await expect(invalid).toHaveCount(1);
    await expect(invalid).toContainText('城市未收录');
    expect(await invalid.getAttribute('title')).toContain('IANA');
});

test('city picker adds, blocks duplicates and removes joined cities', async ({ page }) => {
    await page.evaluate(() => {
        window.desktop.store.set('content.cities', '东京,伦敦,纽约');
        window.desktop.store.set('content.world', true);
        window.desktop.customizer.open('content');
    });
    const input = page.locator('.city-picker-form input');
    await expect(input).toBeVisible();

    // Chinese-name search hits and click-to-add.
    await input.fill('巴黎');
    const option = page.locator('.city-picker-results .city-result', { hasText: '巴黎' });
    await expect(option).toBeVisible();
    await option.click();
    await expect(page.locator('.city-chip', { hasText: '巴黎' })).toBeVisible();
    expect(await page.evaluate(() => window.desktop.store.get('content.cities'))).toBe('东京,伦敦,纽约,巴黎');

    // English aliases match too; an already-joined city is offered disabled.
    await input.fill('london');
    await expect(page.locator('.city-picker-results .city-result', { hasText: '伦敦' })).toBeDisabled();

    // Search results and remove buttons stay reachable (touch targets >= 40px, copy >= 11px).
    const sizes = await page.locator('.city-picker-results .city-result').first().evaluate(el => ({
        height: el.getBoundingClientRect().height, font: parseFloat(getComputedStyle(el).fontSize),
    }));
    expect(sizes.height).toBeGreaterThanOrEqual(40);
    expect(sizes.font).toBeGreaterThanOrEqual(11);

    // Removal updates the store and the desktop immediately.
    await page.locator('.city-chip', { hasText: '伦敦' }).locator('.chip-remove').click();
    expect(await page.evaluate(() => window.desktop.store.get('content.cities'))).toBe('东京,纽约,巴黎');
    await expect(page.locator('.world-clocks > div')).toHaveCount(3);
});

test('city picker enforces the five-city cap', async ({ page }) => {
    await page.evaluate(() => {
        window.desktop.store.set('content.cities', '东京,伦敦,纽约,巴黎,香港');
        window.desktop.customizer.open('content');
    });
    const input = page.locator('.city-picker-form input');
    await expect(input).toBeDisabled();
    await expect(input).toHaveAttribute('placeholder', /上限/);

    await page.locator('.city-chip', { hasText: '香港' }).locator('.chip-remove').click();
    await expect(input).toBeEnabled();
});

test('city picker falls back to IANA zones and explains unresolvable input', async ({ page }) => {
    await page.evaluate(() => {
        window.desktop.store.set('content.cities', '东京');
        window.desktop.customizer.open('content');
    });
    const input = page.locator('.city-picker-form input');
    const status = page.locator('.city-picker-status');

    // Typing an IANA zone offers the Enter fallback and lands as the canonical city name.
    await input.fill('Europe/Berlin');
    await input.press('Enter');
    await expect(page.locator('.city-chip', { hasText: '柏林' })).toBeVisible();
    expect(await page.evaluate(() => window.desktop.store.get('content.cities'))).toBe('东京,柏林');

    // Unresolvable input explains itself and leaves the list untouched.
    await input.fill('Mars/Olympus');
    await input.press('Enter');
    await expect(status).toContainText('时区名称不存在');
    expect(await page.evaluate(() => window.desktop.store.get('content.cities'))).toBe('东京,柏林');
});

test('main clock follows the selected time zone end to end', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-24T23:30:00+08:00'));
    await page.evaluate(() => window.desktop.store.set('content.clockZone', 'Asia/Tokyo'));
    // Shanghai 23:30 is Tokyo 00:30 on the next day.
    await expect(page.locator('.clock-time .hours')).toHaveText('00');
    await expect(page.locator('.clock-time .minutes')).toHaveText('30');
    await expect(page.locator('.clock-date')).toContainText('11月25日');
    await expect(page.locator('.clock-date')).toContainText('星期三');

    // The lunar line follows the Tokyo calendar day, not the local one.
    const expectedLunar = await page.evaluate(() => {
        const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
            year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo',
        }).formatToParts(new Date('2026-11-24T23:30:00+08:00'));
        const by = (type: string) => parts.find(p => p.type === type)?.value ?? '';
        const digits = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        const dayCn = (n: number) => n <= 10 ? `初${digits[n - 1]}` : n < 20 ? `十${digits[n - 11]}`
            : n === 20 ? '二十' : n < 30 ? `廿${digits[n - 21]}` : '三十';
        return `${by('yearName')}年${by('month')}${dayCn(parseInt(by('day'), 10))}`;
    });
    await expect(page.locator('.clock-lunar')).toContainText(expectedLunar);

    // Switching back to auto restores local time and the local date.
    await page.evaluate(() => window.desktop.store.set('content.clockZone', 'auto'));
    await expect(page.locator('.clock-time .hours')).toHaveText('23');
    await expect(page.locator('.clock-date')).toContainText('11月24日');
});

test('an invalid persisted clock zone falls back to local time', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-24T23:30:00+08:00'));
    await page.evaluate(() => localStorage.setItem('desktop.v2.settings', JSON.stringify({ 'content.clockZone': 'Mars/Olympus' })));
    await page.reload();
    await page.waitForFunction(() => !!window.desktop);
    expect(await page.evaluate(() => window.desktop.store.get('content.clockZone'))).toBe('auto');
    await expect(page.locator('.clock-time .hours')).toHaveText('23');
    await expect(page.locator('.clock-date')).toContainText('11月24日');
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
