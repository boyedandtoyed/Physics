import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The Penrose process sim. The physics is `core/kerr.ts` and `description/penroseRun.ts`, both
 * with their own tests; what is asserted here is that the page states it correctly and that the
 * controls cannot make it state something false. */

const ROUTE = '/sims/penrose-process';

const gain = async (page: import('@playwright/test').Page) => {
  const text = await page.locator('.figure-benchmark').innerText();
  return Number(/(-?[\d.]+)%/.exec(text)?.[1]);
};

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the split renders and is accessible`, async ({ page }) => {
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
  for (const name of ['Spin', 'Split depth', 'Speed']) {
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

test('no combination of the two sliders shows a gain above 20.71%', async ({ page }) => {
  // The brief's hard requirement, driven through the UI rather than asserted in a unit test:
  // the page must never display an efficiency the theory forbids.
  await page.goto(ROUTE);
  await page.waitForTimeout(1000);
  const spin = page.getByRole('slider', { name: 'Spin' });
  const depth = page.getByRole('slider', { name: 'Split depth' });
  for (const spinKey of ['Home', 'End'] as const) {
    await spin.focus();
    await spin.press(spinKey);
    for (const depthKey of ['Home', 'End'] as const) {
      await depth.focus();
      await depth.press(depthKey);
      await page.waitForTimeout(350);
      const value = await gain(page);
      expect(value, `spin ${spinKey}, depth ${depthKey}`).toBeLessThan(20.711);
    }
  }
});

test('the gain is exactly zero on the static limit and largest at the horizon', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1000);
  const depth = page.getByRole('slider', { name: 'Split depth' });

  await depth.focus();
  await depth.press('End');
  await page.waitForTimeout(350);
  expect(await gain(page)).toBeCloseTo(0, 2);
  await expect(page.locator('.phase-note')).toContainText('exactly zero — not small, zero');

  await depth.press('Home');
  await page.waitForTimeout(350);
  const atHorizon = await gain(page);
  // 9.01% is the ceiling at the default a/M = 0.9; the slider's innermost radius reaches it.
  expect(atHorizon).toBeGreaterThan(8);
  const text = await page.locator('.figure-benchmark').innerText();
  const ceiling = Number(/ceiling at this spin ([\d.]+)%/.exec(text)?.[1]);
  expect(atHorizon).toBeLessThanOrEqual(ceiling + 0.01);
  expect(atHorizon / ceiling).toBeGreaterThan(0.99);

  // Spin it up and the ceiling — and the gain with it — roughly doubles.
  const spin = page.getByRole('slider', { name: 'Spin' });
  await spin.focus();
  await spin.press('End');
  await page.waitForTimeout(400);
  const atMaxSpin = await gain(page);
  expect(atMaxSpin).toBeGreaterThan(18);
  expect(atMaxSpin).toBeLessThan(20.711);
});

test('a non-spinning hole gains nothing, and the page says why', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1000);
  const spin = page.getByRole('slider', { name: 'Spin' });
  await spin.focus();
  await spin.press('Home');
  await page.waitForTimeout(400);
  expect(await gain(page)).toBeLessThanOrEqual(0);
  await expect(page.locator('.phase-note')).toContainText('no ergosphere at all');
  await expect(page.locator('.figure-benchmark')).toContainText('Energy LOST');
});

test('E₁ + E₂ equals what came in, on screen', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1000);
  const readout = await page.locator('.readout').innerText();
  const numbers = [...readout.matchAll(/(-?\d\.\d{4})/g)].map(match => Number(match[1]));
  expect(numbers.length).toBeGreaterThanOrEqual(3);
  const [incoming, plunging, escaping] = numbers;
  expect(plunging! + escaping!).toBeCloseTo(incoming!, 3);
  expect(plunging!).toBeLessThan(0);
  expect(escaping!).toBeGreaterThan(1);
});

test('corrects 1 − 1/√2, by name and with both numbers', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/1 − 1\/√2 is 29\.29%/)).toBeVisible();
  await expect(page.getByText(/0\.207107 — the maximum gain per split/)).toBeVisible();
  await expect(page.getByText(/0\.292893 — not this/)).toBeVisible();
});

test('says the gain is computed rather than capped, permanently', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('computed, never capped');
  await page.locator('.stage-surface').click({ position: { x: 200, y: 160 } });
  await expect(page.locator('.sim-stage')).toHaveClass(/is-focused/);
  await expect(label).toBeVisible();
  await page.keyboard.press('Escape');
});
