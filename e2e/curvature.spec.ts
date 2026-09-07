import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The embedding-diagram view. What matters here is as much the copy as the picture: §2.1a
 * requires this page to say what the funnel does not show. */

const ROUTE = '/sims/spacetime-curvature';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the curvature view renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(1500);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('states what the funnel does not show, with the number', async ({ page }) => {
  await page.goto(ROUTE);
  // The label PHYSICS_SPEC §2.1a requires, verbatim in substance.
  await expect(page.getByText(/spatial slice at constant Schwarzschild time/)).toBeVisible();
  await expect(page.getByText(/exactly flat when sliced by a free-faller/)).toBeVisible();
  // And the three misconceptions, including the one that matters most.
  await expect(page.getByText('Things fall because they roll down the funnel.')).toBeVisible();
  await expect(page.getByText('1.11×10⁻¹⁵')).toBeVisible();
  await expect(page.getByText(/curvature of TIME, which this surface does not show/)).toBeVisible();
});

test('offers three camera presets that actually move the camera', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1200);
  const summary = () => page.locator('.stage-surface canvas').getAttribute('aria-label');

  await page.getByRole('button', { name: 'Side' }).click();
  await page.waitForTimeout(300);
  const side = await summary();
  await page.getByRole('button', { name: "Bird's eye" }).click();
  await page.waitForTimeout(300);
  const birdsEye = await summary();

  expect(side).toContain('1 degrees above the plane');
  expect(birdsEye).toContain('87 degrees above the plane');
  expect(side).not.toBe(birdsEye);
});

test('every control spans its full range without crashing the canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(1200);

  for (const [name, low, high] of [
    ['Outer edge', '4', '40'],
    ['Depth exaggeration', '0.25', '3'],
    ['Distance', '6', '90'],
  ] as const) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    await slider.press('Home');
    await expect(slider).toHaveValue(low);
    await slider.press('End');
    await expect(slider).toHaveValue(high);
    await page.waitForTimeout(250);
  }
  await expect(page.locator('.stage-surface canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the view orbits from the keyboard and resets', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1200);
  const canvas = page.locator('.stage-surface canvas');
  const before = await canvas.getAttribute('aria-label');
  await canvas.focus();
  for (let step = 0; step < 6; step++) await canvas.press('ArrowUp');
  await page.waitForTimeout(300);
  expect(await canvas.getAttribute('aria-label')).not.toBe(before);
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.waitForTimeout(400);
  expect(await canvas.getAttribute('aria-label')).toBe(before);
});
