import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The effective-potential explorer. The transport and focus-mode tests the brief asks for, plus
 * the two claims the page makes that a screenshot would not catch. */

const ROUTE = '/sims/effective-potential';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the explorer renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(2000);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('play/pause stops the integrator loop outright', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __raf: number }).__raf = 0;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      (window as unknown as { __raf: number }).__raf += 1;
      return original(callback);
    };
  });
  await page.goto(ROUTE);
  await page.waitForTimeout(2500);
  const framesOver = async (ms: number) => {
    await page.evaluate(() => { (window as unknown as { __raf: number }).__raf = 0; });
    await page.waitForTimeout(ms);
    return page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  };
  expect(await framesOver(1500)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(400);
  expect(await framesOver(1500)).toBe(0);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(300);
  expect(await framesOver(1500)).toBeGreaterThan(0);
});

test('reset returns every control to where the explorer opened', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  const mass = page.getByRole('slider', { name: 'Mass' });
  const opened = await mass.inputValue();
  await mass.focus();
  for (let step = 0; step < 8; step++) await mass.press('ArrowRight');
  expect(await mass.inputValue()).not.toBe(opened);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(mass).toHaveValue(opened);
});

test('focus mode opens and closes', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(2000);
  const stage = page.locator('.sim-stage');
  await page.locator('.stage-surface').click({ position: { x: 200, y: 160 } });
  await expect(stage).toHaveClass(/is-focused/);
  await page.keyboard.press('Escape');
  await expect(stage).not.toHaveClass(/is-focused/);
});

test('every slider spans its range, including the degenerate L = 0', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  for (const [name, low, high] of [
    ['Mass', '0.1', '10'],
    ['Angular momentum', '0', '5'],
    ['Energy', '0', '1.4'],
  ] as const) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    await slider.press('Home');
    await expect(slider).toHaveValue(low);
    await slider.press('End');
    await expect(slider).toHaveValue(high);
    await page.waitForTimeout(300);
    await slider.press('Home');
  }
  // L = 0 is a radial plunge, not a circular orbit at r = 0. Sending the quadratic's degenerate
  // double root to the integrator threw and unmounted the whole panel.
  const angular = page.getByRole('slider', { name: 'Angular momentum' });
  await angular.focus();
  await angular.press('Home');
  await page.waitForTimeout(600);
  await expect(page.locator('.stage-surface canvas')).toBeVisible();
  await expect(page.locator('.figures dd').first()).toContainText('none');
  expect(errors).toEqual([]);
});

test('the relativistic term is what produces the ISCO and the precession', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  await expect(page.locator('.mode-warning')).toContainText('Full V_eff');
  await page.locator('.react-aria-Switch', { hasText: 'Relativistic term' }).click();
  await expect(page.locator('.mode-warning')).toContainText('No ISCO, no precession');
  await expect(page.locator('.mode-warning')).toHaveClass(/active/);
});

test('states the ISCO minimum as -1/18 and the efficiency it implies', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  // The corrected value: -1/18, not -1/12.
  await expect(page.locator('.figures')).toContainText('-0.055556');
  await expect(page.getByText('= −1/18 exactly')).toBeVisible();
  await expect(page.getByText(/only approaches 3M as L grows without bound/)).toBeVisible();
  await expect(page.getByText('5.7191%')).toBeVisible();
});
