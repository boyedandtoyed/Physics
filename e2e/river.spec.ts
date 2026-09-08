import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The Gullstrand-Painlevé river view. The disclaimer is as much the deliverable as the
 * animation, so it is asserted in every state rather than once on load. */

const ROUTE = '/sims/gp-river';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the river renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(1800);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('shows the disclaimer in every state, never behind a toggle', async ({ page }) => {
  await page.goto(ROUTE);
  const disclaimer = page.locator('.river-disclaimer');
  const requiredLabel = page.locator('.river-required-label');

  await expect(disclaimer).toBeVisible();
  await expect(disclaimer).toContainText('coordinate choice (Gullstrand–Painlevé), not a physical current');
  await expect(disclaimer).toContainText('Hamilton & Lisle 2008');
  await expect(disclaimer).toContainText('76');
  // PHYSICS_SPEC §5.4's own required label, which is separately mandatory.
  await expect(requiredLabel).toContainText('not a measurable current');

  // Still there after driving every control, and after pausing.
  for (const name of ['Mass', 'Outer edge', 'Flow rate']) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    await slider.press('End');
    await expect(disclaimer).toBeVisible();
  }
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(disclaimer).toBeVisible();
  await expect(requiredLabel).toBeVisible();
});

test('states that the form is exact at every radius, not just near the horizon', async ({ page }) => {
  await page.goto(ROUTE);
  // The correction to the brief's wording: the GP form does not degrade with distance.
  await expect(page.getByText(/exact at every radius/)).toBeVisible();
  await expect(page.getByText('The water analogy is a rough picture that breaks down far from the hole.')).toBeVisible();
  await expect(page.getByText(/becomes trivial, not wrong/)).toBeVisible();
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
  const framesOver = async (ms: number) => {
    await page.evaluate(() => { (window as unknown as { __raf: number }).__raf = 0; });
    await page.waitForTimeout(ms);
    return page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  };
  // The river animates continuously, so playing must be busy and paused must be silent.
  expect(await framesOver(1500)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(400);
  expect(await framesOver(1500)).toBe(0);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(300);
  expect(await framesOver(1500)).toBeGreaterThan(0);
});

test('every control spans its full range without crashing the canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(1200);
  for (const [name, low, high] of [
    ['Mass', '1', '100'],
    ['Outer edge', '3', '24'],
    ['Flow rate', '0.1', '1.5'],
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

test('the mass slider rescales the field without changing the picture', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1200);
  const horizon = page.locator('.figures dd').first();
  await expect(horizon).toContainText('29.5');       // 10 solar masses
  const mass = page.getByRole('slider', { name: 'Mass' });
  await mass.focus();
  await mass.press('End');
  await page.waitForTimeout(300);
  // 100 solar masses: ten times the horizon radius, same flow field.
  await expect(horizon).toContainText('295');
  // The geometry is scale-free, so the speed at the outer edge is unchanged.
  await expect(page.locator('.figures dd').nth(2)).toContainText('0.289');
});
