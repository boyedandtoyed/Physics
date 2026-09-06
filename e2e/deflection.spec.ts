import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The deflection decomposition exhibit against the production bundle: the numbers the exhibit
 * turns on, the domain warning, keyboard operation and accessibility in both themes. */

const ROUTE = '/sims/deflection-decomposition';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the deflection exhibit is accessible and renders without page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('cause');
    await expect(page.getByRole('img', { name: /space-curvature contribution is a horizontal line/ }))
      .toBeVisible();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('opens on light, showing the two halves and the measured total', async ({ page }) => {
  await page.goto(ROUTE);
  // 0.8756" twice and 1.7512" once: the whole exhibit in three numbers.
  await expect(page.getByText('1.751″').first()).toBeVisible();
  await expect(page.getByText('0.8756″').first()).toBeVisible();
  await expect(page.getByText('constant at every speed')).toBeVisible();
  // In the valid band, so no warning.
  await expect(page.getByText('Outside the formula’s domain.')).toBeHidden();
});

test('holds the space contribution fixed while the time contribution explodes', async ({ page }) => {
  await page.goto(ROUTE);
  const spaceValue = page.locator('.split-figures div').filter({ hasText: 'Space curvature' }).locator('dd');
  const timeValue = page.locator('.split-figures div').filter({ hasText: 'Time curvature' }).locator('dd');
  await expect(spaceValue).toContainText('0.8756″');
  await expect(timeValue).toContainText('0.8756″');

  await page.getByRole('button', { name: /Mercury/ }).click();
  // The claim the exhibit exists to make: this one does not move.
  await expect(spaceValue).toContainText('0.8756″');
  await expect(timeValue).toContainText('e+7');
});

test('refuses to present the slow end as a deflection', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: /Falling apple/ }).click();
  const warning = page.getByText('Outside the formula’s domain.');
  await expect(warning).toBeVisible();
  await expect(page.getByText(/full turns — not a deflection at all/)).toBeVisible();
  await expect(page.getByText(/The approximation holds above/)).toBeVisible();
});

test('γ = 0 reproduces Einstein 1911 and γ = 1 restores the measurement', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  const total = page.locator('.split-figures div').filter({ hasText: 'Total' }).locator('dd');
  await expect(total).toContainText('1.751″');
  await page.getByRole('button', { name: /Einstein 1911/ }).click();
  await expect(total).toContainText('0.8756″');
  await page.getByRole('button', { name: /General relativity/ }).click();
  await expect(total).toContainText('1.751″');
  expect(errors).toEqual([]);
});

test('γ = 0 does not hang the page: the space line is dropped, not plotted at log(0)', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: /Einstein 1911/ }).click();
  // If the tick loop still counted from -Infinity this would never resolve.
  await expect(page.getByText('not drawable on a log axis')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.chart-space')).toHaveCount(0);
  await expect(page.locator('.chart-total')).toBeVisible();
  await page.getByRole('button', { name: /General relativity/ }).click();
  await expect(page.locator('.chart-space')).toHaveCount(1);
});

test('the speed slider is operable from the keyboard alone', async ({ page }) => {
  await page.goto(ROUTE);
  const slider = page.getByRole('slider', { name: 'Particle speed' });
  await slider.focus();
  // React Aria renders a native range input; its value is in `value`, not aria-valuenow.
  const before = Number(await slider.inputValue());
  // Opens at light: the top of the range must be exactly reachable.
  expect(before).toBe(750);
  await slider.press('ArrowLeft');
  await slider.press('ArrowLeft');
  const after = Number(await slider.inputValue());
  expect(after).toBeLessThan(before);
  await slider.press('Home');
  // Home must reach the apple exactly, which is what the step alignment buys.
  // Index units: Home is the apple, End is light exactly. The readout carries the speed.
  expect(Number(await slider.inputValue())).toBe(0);
  await expect(page.getByText('Outside the formula’s domain.')).toBeVisible();
  await slider.press('End');
  await expect(page.getByText('Outside the formula’s domain.')).toBeHidden();
});

test('announces the physics to a screen reader, including the domain failure', async ({ page }) => {
  await page.goto(ROUTE);
  const live = page.locator('[role="status"][aria-live="polite"]');
  await expect(live).toContainText('unchanged at every speed', { timeout: 5000 });
  await page.getByRole('button', { name: /Falling apple/ }).click();
  await expect(live).toContainText('not a deflection at all', { timeout: 5000 });
});
