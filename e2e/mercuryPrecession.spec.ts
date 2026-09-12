import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Mercury's precession. The transport, reset and focus-mode tests the brief asks for, plus the
 * claims this page makes that a screenshot would not catch — chiefly that the exaggerated mass
 * is labelled in every state and is never conflated with the 42.98″ benchmark. */

const ROUTE = '/sims/mercury-precession';
const REQUIRED_LABEL = 'Mass exaggerated for visual clarity.';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the orbit renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      // GL driver performance notes ("GPU stall due to ReadPixels") are emitted by the driver
      // when axe-core screenshots the page, not by anything this sim does. Everything else the
      // page says at error or warning level is a defect.
      const text = message.text();
      const driverNoise = text.includes('GL Driver Message');
      if ((message.type() === 'error' || message.type() === 'warning') && !driverNoise) {
        errors.push(`console: ${text}`);
      }
    });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(2000);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.exaggeration-label')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the exaggeration label is visible in every state, including expanded', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  const label = page.locator('.exaggeration-label');
  await expect(label).toContainText(REQUIRED_LABEL);
  await expect(label).toContainText('42.98″/century');
  await expect(label).toBeInViewport();

  // Expanded, where a caption placed under the page rather than in the stage would disappear.
  await page.locator('.stage-surface').click({ position: { x: 200, y: 160 } });
  await expect(page.locator('.sim-stage')).toHaveClass(/is-focused/);
  await expect(label).toBeVisible();
  await expect(label).toBeInViewport();
  await page.keyboard.press('Escape');

  // And with the relativistic term off, where there is no precession to exaggerate.
  await page.locator('.react-aria-Switch', { hasText: 'Relativistic term' }).click();
  await expect(label).toBeVisible();
});

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

test('reset returns the controls and restarts the measurement', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(2500);
  const mass = page.getByRole('slider', { name: 'Mass' });
  await expect(mass).toHaveValue('0.05');
  const measured = page.locator('.figures dd').first();
  await expect(measured).not.toContainText('—');

  await mass.focus();
  for (let step = 0; step < 10; step++) await mass.press('ArrowRight');
  expect(await mass.inputValue()).not.toBe('0.05');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(mass).toHaveValue('0.05');
  // A fresh run has no completed orbits, so the advance is not yet measurable.
  await expect(page.locator('.figures dd').first()).toContainText('over 0 orbits');
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

test('no combination of sliders replaces the sim with the error boundary', async ({ page }) => {
  // GM/ac² = 0.2 with e = 0.6 asks for a turning point at r = 2M, the horizon. No orbit has one
  // there, and constructing a run for it threw straight into the error boundary.
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  const mass = page.getByRole('slider', { name: 'Mass' });
  const eccentricity = page.getByRole('slider', { name: 'Eccentricity' });
  await mass.focus();
  await mass.press('End');
  await eccentricity.focus();
  await eccentricity.press('End');
  await page.waitForTimeout(800);
  await expect(page.getByRole('heading', { name: 'This simulation could not load.' }))
    .toHaveCount(0);
  await expect(page.locator('.stage-surface canvas')).toBeVisible();
  await expect(page.locator('.domain-warning')).toContainText('No orbit at all');
});

test('every slider spans its full range without breaking the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  for (const [name, low, high] of [
    ['Mass', '0.001', '0.2'],
    ['Eccentricity', '0.01', '0.6'],
    ['Speed', '1', '100'],
  ] as const) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    await slider.press('Home');
    await expect(slider).toHaveValue(low);
    await page.waitForTimeout(400);
    await slider.press('End');
    await expect(slider).toHaveValue(high);
    await page.waitForTimeout(600);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('says there is no bound orbit at the top of the mass slider', async ({ page }) => {
  // Mercury's eccentricity at GM/ac² = 0.2 puts the periapsis inside the potential barrier.
  // The slider reaches that deliberately; the page must say so rather than showing a mystery.
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  const mass = page.getByRole('slider', { name: 'Mass' });
  await mass.focus();
  await mass.press('End');
  await expect(page.locator('.domain-warning')).toContainText('No bound orbit');
  await expect(page.locator('.domain-warning')).toContainText('plunges instead of precessing');
  await mass.press('Home');
  await expect(page.locator('.domain-warning')).toHaveCount(0);
});

test('keeps the animation’s drift and the published benchmark apart', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(3000);
  // Three separate figures, each labelled for what it is.
  await expect(page.locator('.figures')).toContainText('Measured advance');
  await expect(page.locator('.figures')).toContainText('Formula at this mass');
  await expect(page.locator('.figure-benchmark')).toContainText('Mercury, real parameters');
  await expect(page.locator('.figure-benchmark')).toContainText('42.98″');
  await expect(page.locator('.figure-benchmark')).toContainText('2.55e-8');
  // And the comparison stated as a shortfall of the formula, not as agreement.
  await expect(page.locator('.figures')).toContainText(/measured is \d+% higher/);
  await expect(page.getByText(/It does not, and it cannot/)).toBeVisible();
});

test('the Newtonian orbit closes: switching the term off removes the drift', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  await expect(page.locator('.mode-warning')).toContainText('Full V_eff');
  await page.locator('.react-aria-Switch', { hasText: 'Relativistic term' }).click();
  await expect(page.locator('.mode-warning')).toContainText('the orbit closes exactly');
  await expect(page.locator('.mode-warning')).toHaveClass(/active/);
  await page.waitForTimeout(3000);
  // The measured advance readout must be a flat zero to the places shown.
  await expect(page.locator('.figures dd').first()).toContainText(/^(0\.000°|—)/);
});
