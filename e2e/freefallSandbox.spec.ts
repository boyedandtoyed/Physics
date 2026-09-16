import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The freefall sandbox. The trajectory maths is `description/freefallRun.ts`, tested on its own
 * against the closed-form cycloid; this drives the page. */

const ROUTE = '/sims/freefall-sandbox';

// Tall enough that the whole canvas is inside the window: a click below the viewport is
// discarded silently, which reads as the sim ignoring the drop.
test.use({ viewport: { width: 1280, height: 1100 } });

const readout = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-readout="${name}"] dd`);

const numberIn = async (page: import('@playwright/test').Page, name: string) => {
  const text = await readout(page, name).innerText();
  const match = /(-?[\d.]+(?:e[-+]?\d+)?)/.exec(text.replace(/,/g, ''));
  return match ? Number(match[1]) : Number.NaN;
};

async function dropAt(
  page: import('@playwright/test').Page, x: number, y: number, dx = 0, dy = 0,
) {
  const box = (await page.locator('.stage-surface canvas').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + y + dy, 'drop target is below the viewport').toBeLessThan(viewport.height);
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  if (dx !== 0 || dy !== 0) await page.mouse.move(box.x + x + dx, box.y + y + dy, { steps: 4 });
  await page.mouse.up();
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the well renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.getByRole('button', { name: 'Neutron star' }).click();
    await page.waitForTimeout(1500);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.stage-failure')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('every central body and object selects, with the console clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  await page.waitForTimeout(700);
  for (const body of ['Earth', 'Jupiter', 'Neutron star', 'Black hole']) {
    await page.getByRole('button', { name: body }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('.stage-failure'), body).toHaveCount(0);
  }
  for (const object of ['Apple', 'Satellite', 'Space station', 'Moon']) {
    await page.getByRole('button', { name: object }).click();
    await expect(page.locator('.stage-failure'), object).toHaveCount(0);
  }
  const slider = page.getByRole('slider', { name: 'Speed' });
  await slider.focus();
  for (const key of ['Home', 'End'] as const) {
    await slider.press(key);
    await page.waitForTimeout(400);
    await expect(page.locator('.stage-failure')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('the compactness of each body is on screen, spanning nine decades', async ({ page }) => {
  // The claim the page leads with: the well is the same well, and what changes is where the
  // surface sits in it.
  await page.goto(ROUTE);
  const label = (name: string) => page.getByRole('button', { name }).locator('span');
  await expect(label('Earth')).toContainText('1.44e+9 M');
  await expect(label('Jupiter')).toContainText('5.07e+7 M');
  await expect(label('Neutron star')).toContainText('5.80 M');
  await expect(label('Black hole')).toContainText('2.00 M');
});

test('a drop falls, and stops at the surface rather than passing through it', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Black hole' }).click();
  await page.waitForTimeout(600);
  // Slowest first: at the top of the speed range the whole 44 M fall is over inside one poll.
  const speed = page.getByRole('slider', { name: 'Speed' });
  await speed.focus();
  await speed.press('Home');
  await dropAt(page, 220, 200);
  await page.waitForTimeout(600);

  const first = await numberIn(page, 'radius');
  expect(first, 'the drop point is well outside the horizon').toBeGreaterThan(5);
  // It falls, and the faller's own clock counts up while it does.
  await expect.poll(() => numberIn(page, 'radius'), { timeout: 30_000 }).toBeLessThan(first);
  expect(await numberIn(page, 'propertime')).toBeGreaterThan(0);

  await speed.press('End');
  await expect.poll(() => numberIn(page, 'radius'), { timeout: 30_000 }).toBeLessThan(2.01);
  // Schwarzschild r is not continued inside the horizon here: the track stops on it.
  expect(await numberIn(page, 'radius')).toBeGreaterThanOrEqual(2);
  await expect(readout(page, 'propertime')).toContainText('arrived');
});

test('a radial drop puts the Newtonian and corrected tracks exactly on top of each other', async ({ page }) => {
  // §2.7: h = 0 kills the correction identically, and the Newtonian answer is not an
  // approximation for a radial fall — it is the same cycloid.
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Black hole' }).click();
  await page.waitForTimeout(600);
  const box = (await page.locator('.stage-surface canvas').boundingBox())!;
  // Straight down the x axis from the centre: no angular momentum.
  await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await expect(readout(page, 'drift')).toContainText('identical: h = 0');
  expect(await numberIn(page, 'drift')).toBeLessThan(1e-9);
});

test('the Earth’s surface clock rate is indistinguishable from one, and the star’s is not', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Neutron star' }).click();
  await page.waitForTimeout(500);
  await expect(readout(page, 'clock')).toContainText('0.8096');
  // Nine decimal places is not enough to see the Earth's surface depart from unity.
  await page.getByRole('button', { name: 'Earth' }).click();
  await page.waitForTimeout(500);
  await expect(readout(page, 'clock')).toContainText('0.999999999');
  await page.getByRole('button', { name: 'Black hole' }).click();
  await page.waitForTimeout(500);
  expect(await numberIn(page, 'clock')).toBe(0);
});

test('states which clock is counting, permanently', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('the faller’s own proper time');
  await expect(label).toContainText('equal proper radial separation');
  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(page.locator('.sim-stage')).toHaveClass(/is-focused/);
  await expect(label).toBeVisible();
  await page.keyboard.press('Escape');
});

test('a click drops rather than expanding the sim', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(600);
  await dropAt(page, 220, 200);
  await page.waitForTimeout(300);
  await expect(page.locator('.sim-stage')).not.toHaveClass(/is-focused/);
  expect(await numberIn(page, 'propertime')).toBeGreaterThanOrEqual(0);
});

test('corrects the deeper-well and slower-clock stories', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/Every Schwarzschild well is the same well/)).toBeVisible();
  await expect(page.getByText(/Three different clocks; only one of them is the faller’s/))
    .toBeVisible();
  await expect(page.getByText(/An apple and a space station released together stay together/))
    .toBeVisible();
});
