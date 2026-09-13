import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The ISCO explorer. The transport, reset and focus-mode tests the brief asks for, plus the
 * claims this page makes that a screenshot would not catch — chiefly that the plunge stops
 * outside the horizon and says why, permanently, in the words the brief specifies. */

const ROUTE = '/sims/isco-explorer';
const REQUIRED_LABEL =
  'Coordinate time diverges at the horizon — interior not shown in Schwarzschild coordinates.';

/** Drives the launch radius to a value below the ISCO so the next nudge plunges. */
async function setRadius(page: import('@playwright/test').Page, presses: number) {
  const slider = page.getByRole('slider', { name: 'Launch radius' });
  await slider.focus();
  await slider.press('Home');
  for (let i = 0; i < presses; i++) await slider.press('ArrowRight');
  return slider;
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the explorer renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      const text = message.text();
      // GL driver performance notes are emitted when axe screenshots the page, not by the sim.
      if ((message.type() === 'error' || message.type() === 'warning')
        && !text.includes('GL Driver Message')) errors.push(`console: ${text}`);
    });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(2500);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.clock-label')).toBeVisible();
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

test('reset returns the controls and restarts the run', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(2000);
  const radius = page.getByRole('slider', { name: 'Launch radius' });
  await expect(radius).toHaveValue('9');
  await page.waitForTimeout(1500);
  const clocks = page.locator('.figures dd').nth(1);
  await expect(clocks).not.toContainText('τ = 0.00 M');

  await radius.focus();
  for (let i = 0; i < 12; i++) await radius.press('ArrowRight');
  expect(await radius.inputValue()).not.toBe('9');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(radius).toHaveValue('9');
  await expect(page.getByRole('slider', { name: 'Radial nudge' })).toHaveValue('-0.06');
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

test('every slider spans its full range without breaking the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  for (const [name, low, high] of [
    ['Launch radius', '3.2', '24'],
    ['Radial nudge', '-0.3', '0.3'],
    ['Speed', '1', '20'],
  ] as const) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    await slider.press('Home');
    await expect(slider).toHaveValue(low);
    await page.waitForTimeout(700);
    await slider.press('End');
    await expect(slider).toHaveValue(high);
    await page.waitForTimeout(700);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
  }
  // The most hostile corner: the innermost radius with the hardest inward kick.
  await setRadius(page, 0);
  const nudge = page.getByRole('slider', { name: 'Radial nudge' });
  await nudge.focus();
  await nudge.press('Home');
  await page.waitForTimeout(2500);
  await expect(page.getByRole('heading', { name: 'This simulation could not load.' }))
    .toHaveCount(0);
  await expect(page.locator('.stage-surface canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the stability verdict changes sign at exactly 6M', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  const verdict = page.locator('.stability');
  await expect(verdict).toContainText('Stable');
  await expect(verdict).toHaveClass(/stability-stable/);

  // 3.2 + 28 steps of 0.1 = 6.0 exactly. The slider must be able to land on the ISCO.
  const radius = await setRadius(page, 28);
  await expect(radius).toHaveValue('6');
  await expect(verdict).toContainText('This is the ISCO');
  await expect(verdict).toHaveClass(/stability-marginal/);

  await radius.press('ArrowLeft');
  await expect(radius).toHaveValue('5.9');
  await expect(verdict).toContainText('Unstable');
  await expect(verdict).toHaveClass(/stability-unstable/);

  await radius.press('ArrowRight');
  await radius.press('ArrowRight');
  await expect(verdict).toContainText('Stable');
});

test('a plunge stops outside the horizon and says why, permanently', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1000);
  // 5M with a firm inward kick: below the ISCO, so it goes straight in.
  const radius = await setRadius(page, 18);
  await expect(radius).toHaveValue('5');
  const nudge = page.getByRole('slider', { name: 'Radial nudge' });
  await nudge.focus();
  for (let i = 0; i < 10; i++) await nudge.press('ArrowLeft');

  const label = page.locator('.horizon-label');
  await expect(label).toContainText(REQUIRED_LABEL, { timeout: 30_000 });
  await expect(label).toContainText('Stopped at r = 2.001 M');
  await expect(label).toBeVisible();

  // Permanent, not transient: still there a good while later, and after pausing.
  await page.waitForTimeout(4000);
  await expect(label).toContainText(REQUIRED_LABEL);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(label).toContainText(REQUIRED_LABEL);

  // And it is on screen without hovering anything.
  await expect(label).toBeInViewport();

  // The radius readout must never show the particle inside the horizon.
  const shown = await page.locator('.figures dd').nth(2).innerText();
  const value = Number.parseFloat(shown);
  expect(value).toBeGreaterThan(2);
  expect(value).toBeLessThanOrEqual(2.001);
});

test('the two clocks diverge, which is the reason the run stops', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1000);
  await setRadius(page, 18);
  const nudge = page.getByRole('slider', { name: 'Radial nudge' });
  await nudge.focus();
  for (let i = 0; i < 10; i++) await nudge.press('ArrowLeft');
  await expect(page.locator('.horizon-label')).toBeVisible({ timeout: 30_000 });

  const clocks = await page.locator('.figures dd').nth(1).innerText();
  const [proper, coordinate] = [...clocks.matchAll(/([\d.]+) M/g)].map(m => Number(m[1]));
  expect(proper).toBeGreaterThan(0);
  expect(coordinate).toBeGreaterThan(proper! * 2);
  // The chart never changes underneath the reader.
  await expect(page.locator('.clock-label')).toContainText('Schwarzschild coordinate time');
  await expect(page.locator('.clock-label')).toContainText('nothing switches coordinates');
});

test('states the ISCO constants and does not claim orbits end at 6M', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  const benchmark = page.locator('.figure-benchmark');
  await expect(benchmark).toContainText('3.464102');
  await expect(benchmark).toContainText('0.942809042');
  await expect(benchmark).toContainText('5.7191%');
  await expect(page.getByText(/Circular orbits exist at every radius above 3M/)).toBeVisible();
  await expect(page.getByText(/A spacecraft with thrust could sit at 4M indefinitely/))
    .toBeVisible();
});
