import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: gallery, physics disclosure, keyboard and accessibility`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByLabel('Theme').selectOption(theme);
    await expect(page.getByRole('link', { name: 'When light meets a black hole' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('link', { name: 'Our method', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'The physics' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.katex')).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.reload();
    await expect(page.getByLabel('Theme')).toHaveValue(theme);
    expect(errors).toEqual([]);
  });
}

test('mobile layout, system theme, reduced motion and not-found route', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByLabel('Theme')).toHaveValue('system');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(16, 27, 36)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.goto('/not-a-simulation');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at these coordinates.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

/** Every sim route, at a narrow viewport, must not scroll horizontally.
 *
 * The previous mobile check covered only the gallery, and three sims shipped with the page 50 to
 * 200 pixels wider than the viewport: a KaTeX display and a min-width table were widening their
 * grid track (grid items default to min-width:auto, so their own overflow-x containers could not
 * shrink), and a slider thumb overhung the track end by half its width. This is a route-level
 * guard so the next sim cannot reintroduce any of it.
 */
const SIM_ROUTES = [
  '/sims/blackhole-lensing',
  '/sims/time-dilation',
  '/sims/deflection-decomposition',
  '/sims/interpretations',
  '/sims/spacetime-curvature',
  '/sims/gp-river',
  '/sims/effective-potential',
  '/sims/mercury-precession',
  '/sims/isco-explorer',
  '/sims/kerr-shadow',
  '/sims/frame-dragging',
  '/sims/penrose-process',
  '/sims/gravity-sandbox',
  '/sims/freefall-sandbox',
  '/sims/clock-comparison',
  '/sims/kruskal-diagram',
  '/sims/penrose-schwarzschild',
  '/sims/penrose-kerr',
];

for (const width of [360, 390]) {
  test(`no sim scrolls horizontally at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const route of SIM_ROUTES) {
      await page.goto(route);
      // Let the lazy chunk and KaTeX settle; both are what widened the page.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} overflows by ${overflow}px at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

/** Characters the shipped font does not have.
 *
 * U+208A SUBSCRIPT PLUS renders as a full stop in the body font here, so "r₊" — the outer
 * horizon, which four Kerr sims quote — silently became "r.". It looks like a typo rather than a
 * missing glyph, which is why it survived a screenshot. U+208B has the same gap.
 *
 * A route-level guard over the rendered text, so no sim can reintroduce either.
 */
const MISSING_GLYPHS = /[\u208a\u208b]/u;

test('no sim renders a glyph the body font does not have', async ({ page }) => {
  for (const route of SIM_ROUTES) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(300);
    // `textContent`, not `innerText`: innerText is an HTML concept and does not reach SVG
    // <text>, which is where the defect recurred in the Kerr sim's chart legend. textContent
    // also covers the visually-hidden live regions, which a screen reader does read.
    const text = await page.locator('body').textContent() ?? '';
    const found = MISSING_GLYPHS.exec(text);
    expect(
      found,
      `${route} renders U+${found?.[0].codePointAt(0)?.toString(16)}, which the font lacks: `
      + `"${text.slice(Math.max(0, (found?.index ?? 0) - 40), (found?.index ?? 0) + 20)}"`,
    ).toBeNull();
  }
});
