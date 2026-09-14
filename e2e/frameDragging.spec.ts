import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The frame-dragging sim. What is asserted here is what the page CLAIMS, driven through the
 * controls: the numbers in the readout are computed by `core/kerr.ts`, which has its own tests
 * and its own benchmark rows. */

const ROUTE = '/sims/frame-dragging';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the field renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(2500);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.stage-failure')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('every slider spans its full range without breaking the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(1200);
  for (const name of ['Spin', 'Outer edge', 'Release radius', 'Speed']) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    for (const key of ['Home', 'End'] as const) {
      await slider.press(key);
      await page.waitForTimeout(500);
      await expect(page.locator('.stage-failure'), `${name} at ${key}`).toHaveCount(0);
      await expect(page.locator('.stage-surface canvas')).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test('the prohibition appears exactly when the hole spins, and not before', async ({ page }) => {
  // The claim the sim exists to make. At a = 0 standing still is allowed everywhere; at any
  // spin it is forbidden inside 2M. The readout has to change sign, on screen.
  await page.goto(ROUTE);
  await page.waitForTimeout(1000);
  const row = page.locator('.figure-benchmark');
  const spin = page.getByRole('slider', { name: 'Spin' });

  await spin.focus();
  await spin.press('Home');
  await page.waitForTimeout(400);
  await expect(row).toContainText('standing still is allowed');
  await expect(row).toHaveClass(/^((?!forbidden).)*$/);

  await spin.press('End');
  await page.waitForTimeout(400);
  await expect(row).toContainText('standing still is impossible');
  await expect(row).toHaveClass(/forbidden/);
});

test('ω at the horizon is Ω_H, and ω far out is very much smaller', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1000);
  const readout = page.locator('.readout');
  await expect(readout).toContainText('Ω_H = a/(2Mr₊)');

  const value = async (label: string) => {
    const text = await readout.locator('div', { hasText: label }).first().innerText();
    return Number(/(-?[\d.]+) \/M/.exec(text)?.[1]);
  };
  const horizon = await value('Ω at the horizon');
  const edge = await value('ω at the outer edge');
  expect(horizon).toBeCloseTo(0.313, 3);
  // ω goes as r^-3, so the edge of a 6 M frame is nearly two orders of magnitude slower.
  expect(horizon / edge).toBeGreaterThan(30);
});

test('the faller sweeps an angle with zero angular momentum, and does not when a = 0', async ({ page }) => {
  await page.goto(ROUTE);
  const sweptAfter = async (ms: number) => {
    await page.waitForTimeout(ms);
    const text = await page.locator('.readout').innerText();
    return Number(/([\d.]+) rad/.exec(text)?.[1]);
  };

  await expect.poll(() => sweptAfter(900), { timeout: 20_000 }).toBeGreaterThan(0.2);

  // Reset to a = 0 and the same faller stays radial: the wind-up is the spin, not the fall.
  const spin = page.getByRole('slider', { name: 'Spin' });
  await spin.focus();
  await spin.press('Home');
  await page.waitForTimeout(2500);
  const text = await page.locator('.readout').innerText();
  expect(Number(/([\d.]+) rad/.exec(text)?.[1])).toBe(0);
});

test('says the ergosphere is a circle from above and an ellipse only in the axial cut', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('circle');
  await expect(label).toContainText('the only view it is an ellipse in');
  await expect(page.getByText(/its boundary is a circle of radius exactly 2M, at every spin/))
    .toBeVisible();
});

test('the coordinate-time label survives the expanded view', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('Boyer–Lindquist coordinate time');
  await page.locator('.stage-surface').click({ position: { x: 200, y: 160 } });
  await expect(page.locator('.sim-stage')).toHaveClass(/is-focused/);
  await expect(label).toBeVisible();
  await page.keyboard.press('Escape');
});

test('pausing stops the animation frame entirely', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __raf: number }).__raf = 0;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      (window as unknown as { __raf: number }).__raf += 1;
      return original(callback);
    };
  });
  await page.goto(ROUTE);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(600);
  await page.evaluate(() => { (window as unknown as { __raf: number }).__raf = 0; });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __raf: number }).__raf)).toBe(0);
});
