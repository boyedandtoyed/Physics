import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The time-dilation calculator against the production bundle.
 *
 * Everything here was first found by driving the page by hand, per CLAUDE.md rule 3. The slider
 * endpoints, the boundary states (nearest the horizon, lowest orbit, the poles) and the tick
 * counts are here so they stay found. */

const ROUTE = '/sims/time-dilation';

const gpsFigure = (page: import('@playwright/test').Page, index: number) =>
  page.locator('.figures').nth(1).locator('dd').nth(index);

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the calculator is accessible and renders without page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every clock');
    await expect(page.getByRole('img', { name: /Clock rate against distance/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('reproduces the published GPS figures (§8 rows 5-7) and derives the range error', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(gpsFigure(page, 0)).toContainText('+45.7');
  await expect(gpsFigure(page, 1)).toContainText('-7.10');
  await expect(gpsFigure(page, 2)).toContainText('+38.6');
  // c times the net offset, which is the number everyone remembers about GPS.
  await expect(gpsFigure(page, 3)).toContainText('11.6');
});

test('flips the net sign at low orbit, where speed beats height', async ({ page }) => {
  await page.goto(ROUTE);
  const orbit = page.getByRole('slider', { name: 'Orbit radius' });
  await orbit.focus();
  await orbit.press('Home');
  // At latitude 0, where the ground station moves fastest and so loses least to the satellite.
  await expect(gpsFigure(page, 2)).toContainText('-26.84');
  // And the drift follows the sign, since it is c times the net.
  await expect(gpsFigure(page, 3)).toContainText('-8.0');
  await orbit.press('End');
  await expect(gpsFigure(page, 2)).toContainText('+');
});

test('costs the satellite more against a polar station than an equatorial one', async ({ page }) => {
  await page.goto(ROUTE);
  const latitude = page.getByRole('slider', { name: 'Ground station latitude' });
  await latitude.focus();
  await latitude.press('Home');
  await expect(gpsFigure(page, 1)).toContainText('-7.106');
  await latitude.press('End');
  // The ground clock moves slower near the pole, so the satellite loses more against it.
  await expect(gpsFigure(page, 1)).toContainText('-7.207');
  // Height is unaffected by latitude in this model.
  await expect(gpsFigure(page, 0)).toContainText('+45.7');
});

test('the radius slider reaches both endpoints and never offers a clock at the horizon', async ({ page }) => {
  await page.goto(ROUTE);
  const height = page.getByRole('slider', { name: 'Height above the horizon' });
  await height.focus();
  await height.press('Home');
  expect(Number(await height.inputValue())).toBe(0);
  // 1000x slow, and still strictly outside: the rate is never zero.
  await expect(page.locator('.figures').first().locator('dd').nth(1)).toContainText('1000');
  await expect(page.locator('.figures').first().locator('dd').first()).toContainText('1.000e-3');
  await height.press('End');
  expect(Number(await height.inputValue())).toBe(1200);
  await expect(page.locator('.figures').first().locator('dd').first()).toContainText('0.999999');
});

test('the tick strip draws exactly as many marks as its label claims', async ({ page }) => {
  await page.goto(ROUTE);
  const height = page.getByRole('slider', { name: 'Height above the horizon' });
  const deepLabel = page.locator('.tick-strip text').nth(1);

  await expect(page.locator('.tick-far line')).toHaveCount(40);
  for (const [key, marks] of [['Home', 1], ['End', 40]] as const) {
    await height.focus();
    await height.press(key);
    await expect(page.locator('.tick-deep line')).toHaveCount(marks);
    await expect(deepLabel).toContainText(`${marks} tick`);
  }
});

test('lands both Hafele–Keating legs inside the published bands', async ({ page }) => {
  await page.goto(ROUTE);
  const rows = page.locator('.clocks tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('-44.5');
  await expect(rows.nth(0)).toContainText('-40 ± 23 ns');
  await expect(rows.nth(1)).toContainText('+255.6');
  await expect(rows.nth(1)).toContainText('275 ± 21 ns');
  await expect(page.locator('.inside')).toHaveCount(2);
  await expect(page.locator('.outside')).toHaveCount(0);
});

test('colours a contribution by its sign, not by its column', async ({ page }) => {
  await page.goto(ROUTE);
  const rows = page.locator('.clocks tbody tr');
  // Westward, the Sagnac contribution is a GAIN. Painting it as a loss would contradict the
  // sign printed in the same cell.
  const westSagnac = rows.nth(1).locator('td').nth(1);
  await expect(westSagnac).toContainText('+154');
  await expect(westSagnac).toHaveClass(/gain/);
  const eastSagnac = rows.nth(0).locator('td').nth(1);
  await expect(eastSagnac).toContainText('-130');
  await expect(eastSagnac).toHaveClass(/loss/);
});

test('the presets jump to the named radii', async ({ page }) => {
  await page.goto(ROUTE);
  const rate = page.locator('.figures').first().locator('dd').first();
  // Exactly the named radius, not the nearest slider step: routing a preset through the integer
  // index put "Photon sphere" at 1.50119 r_s and read 0.5778 instead of 0.5774.
  await page.getByRole('button', { name: /Photon sphere/ }).click();
  await expect(page.locator('.figures').first().locator('dd').nth(0)).toContainText('0.5774');
  await page.getByRole('button', { name: /ISCO/ }).click();
  await expect(rate).toContainText('0.8165');
  await page.getByRole('button', { name: /Just outside/ }).click();
  await expect(rate).toContainText('1.000e-3');
});

test('announces the physics, and switches which section it announces', async ({ page }) => {
  await page.goto(ROUTE);
  const live = page.locator('[role="status"][aria-live="polite"]');
  await expect(live).toContainText('times slow', { timeout: 5000 });
  await page.getByRole('slider', { name: 'Orbit radius' }).focus();
  await page.getByRole('slider', { name: 'Orbit radius' }).press('ArrowRight');
  await expect(live).toContainText('kilometres of position error per day', { timeout: 5000 });
});
