import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The Kerr shadow page. The *physics* gates are in `kerr.spec.ts`, measured off GPU frames in
 * the acceptance harness; this is the page: that it renders, that every control survives both
 * endpoints, and that the claims it makes are on screen. */

const ROUTE = '/sims/kerr-shadow';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the shadow renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(3000);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.stage-failure')).toHaveCount(0);
    await expect(page.locator('.stage-permanent-label')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('every slider spans its full range without breaking the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(1500);
  for (const name of ['Spin', 'Camera distance', 'Inclination', 'Quality', 'Film grain']) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    for (const key of ['Home', 'End'] as const) {
      await slider.press(key);
      await page.waitForTimeout(600);
      await expect(page.locator('.stage-failure'), `${name} at ${key}`).toHaveCount(0);
      await expect(page.locator('.stage-surface canvas')).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test('the spin slider reaches 0 and 0.998, and not 1', async ({ page }) => {
  await page.goto(ROUTE);
  const spin = page.getByRole('slider', { name: 'Spin' });
  await spin.focus();
  await spin.press('Home');
  expect(Number(await spin.inputValue())).toBe(0);
  await spin.press('End');
  // a = M is extremal and singular; the slider must stop short of it and say so.
  expect(Number(await spin.inputValue())).toBeCloseTo(0.998, 6);
  // The slider's own hint has to carry the reason, not just the assumptions list below.
  await expect(page.locator('#spin-hint')).toContainText('a = M is extremal');
});

test('the readout says the height does not change with spin, and the numbers agree', async ({ page }) => {
  // The claim the sim exists to make: PHYSICS_SPEC §8 row 44. It has to survive the slider.
  await page.goto(ROUTE);
  await page.waitForTimeout(1200);
  const shadowRow = page.locator('.figure-benchmark');
  const spin = page.getByRole('slider', { name: 'Spin' });

  await spin.focus();
  await spin.press('Home');
  await page.waitForTimeout(400);
  const atZero = (await shadowRow.innerText()).replace(/\s+/g, ' ');
  await spin.press('End');
  await page.waitForTimeout(400);
  const atMax = (await shadowRow.innerText()).replace(/\s+/g, ' ');

  // The height is the same string at both ends of the slider...
  expect(atZero).toContain('±5.196 M');
  expect(atMax).toContain('±5.196 M');
  // ...and the extent is not.
  expect(atZero).toContain('-5.196 M to 5.196 M');
  expect(atMax).toContain('-2.111 M to 6.997 M');
  expect(atZero).toContain('displaced 0.000 M');
  expect(atMax).toContain('displaced 2.443 M');
});

test('the ergosphere readout stays at 2M while the horizon moves', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(1200);
  const readout = page.locator('.readout');
  const spin = page.getByRole('slider', { name: 'Spin' });
  await spin.focus();
  await spin.press('Home');
  await page.waitForTimeout(400);
  await expect(readout).toContainText('2.000 M');
  const atZero = await readout.innerText();
  await spin.press('End');
  await page.waitForTimeout(400);
  const atMax = await readout.innerText();
  // Equatorial ergosphere unchanged; outer horizon has moved from 2M to 1.063M.
  expect(atMax).toContain('2.000 M');
  expect(atZero).toContain('2.000 M');
  expect(atMax).toContain('1.063 M');
  expect(atZero).not.toContain('1.063 M');
});

test('states that the ring’s brightness profile is not physical, permanently', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('brightness profile is not physical');
  // Still there in the expanded view, which hides the prose below the stage.
  await page.locator('.stage-surface').click({ position: { x: 200, y: 160 } });
  await expect(page.locator('.sim-stage')).toHaveClass(/is-focused/);
  await expect(label).toBeVisible();
  await page.keyboard.press('Escape');
});

test('cinematic mode is off by default and is labelled non-physical when on', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(800);
  const warning = page.locator('.mode-warning');
  await expect(warning).toContainText('Physical mode');
  await page.locator('.react-aria-Switch', { hasText: 'Cinematic mode' }).click();
  await expect(warning).toContainText('Not physical');
});

test('names the handedness check a reader can apply to any Kerr render', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/bright limb and the flattened edge of the shadow are the same side/))
    .toBeVisible();
});

test('draws the ISCO-vs-spin curve, and the marker follows the slider', async ({ page }) => {
  // BUILD_PLAN §4 asks for this curve by name, with Teo's photon orbits as the accuracy probe.
  await page.goto(ROUTE);
  const chart = page.locator('.radii-chart');
  await expect(chart).toBeVisible();
  // Six series plus the spin marker.
  await expect(chart.locator('path')).toHaveCount(6);
  await expect(chart).toContainText('ISCO, prograde');
  await expect(chart).toContainText('Photon, retrograde');

  const markerX = async () =>
    Number(await chart.locator('.radii-marker').getAttribute('x1'));
  const spin = page.getByRole('slider', { name: 'Spin' });
  await spin.focus();
  await spin.press('Home');
  await page.waitForTimeout(300);
  const atZero = await markerX();
  await spin.press('End');
  await page.waitForTimeout(300);
  expect(await markerX()).toBeGreaterThan(atZero);
});
