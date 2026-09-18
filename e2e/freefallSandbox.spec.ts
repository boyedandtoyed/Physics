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
  for (const name of ['Speed', 'Camera height', 'Camera distance', 'Vertical exaggeration']) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    for (const key of ['Home', 'End'] as const) {
      await slider.press(key);
      await page.waitForTimeout(400);
      await expect(page.locator('.stage-failure'), `${name} ${key}`).toHaveCount(0);
    }
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
  // The rings that used to carry this are now the funnel itself.
  await expect(label).toContainText('exact Flamm paraboloid');
  await expect(label).toContainText('true vertical scale');
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

// ---------------------------------------------------------------------------------------------
// The 3D view: the funnel, the field arrows, the river overlay and the camera.
// ---------------------------------------------------------------------------------------------

test('the funnel is the same surface for every body, cut at a different place', async ({ page }) => {
  // The sim's whole thesis, as a number: the geometry depends on r/M alone, so what changes with
  // the central body is where the surface sits on one fixed funnel.
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Black hole' }).click();
  await page.waitForTimeout(600);
  // Frame is max(6 x 2, 12) = 12, so the drop from the throat is 2 sqrt(2 x 10) = 8.944 M.
  expect(await numberIn(page, 'funnel')).toBeCloseTo(8.94, 1);
  await expect(readout(page, 'funnel')).toContainText('at true scale');

  await page.getByRole('button', { name: 'Neutron star' }).click();
  await page.waitForTimeout(600);
  expect(await numberIn(page, 'funnel')).toBeCloseTo(10.7, 0);

  // The Earth's surface is 1.4 billion M out, where the same funnel is flat: the depth is a
  // vanishing fraction of the frame rather than a comparable one.
  await page.getByRole('button', { name: 'Earth' }).click();
  await page.waitForTimeout(600);
  const earth = await numberIn(page, 'funnel');
  expect(earth).toBeGreaterThan(0);
  expect(earth / (1.44e9 * 6)).toBeLessThan(1e-4);
});

test('the field arrows use the hover acceleration, not GM/r²', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Neutron star' }).click();
  await page.waitForTimeout(500);
  // At 5.8 M the lapse is sqrt(1 - 2/5.8) = 0.810, so the two differ by 23 per cent.
  const text = await readout(page, 'field').innerText();
  expect(text).toContain('3.67e-2');
  expect(text).toContain('2.97e-2');

  // At a horizon there is no static observer at all, and the readout says so rather than
  // printing the finite Newtonian number.
  await page.getByRole('button', { name: 'Black hole' }).click();
  await page.waitForTimeout(500);
  await expect(readout(page, 'field')).toContainText('∞');
  await expect(readout(page, 'field')).toContainText('stays finite at a horizon where this does not');
});

test('the arrows toggle on, off, and explain themselves either way', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  const arrows = page.locator('.react-aria-Switch', { hasText: 'Gravity field arrows' });
  await expect(arrows.locator('input')).not.toBeChecked();
  await expect(page.getByText(/rather than GM\/r²/)).toBeVisible();
  await arrows.click();
  await expect(page.getByText(/what a scale under your feet would read/)).toBeVisible();
  await expect(page.getByText(/Lengths are capped/)).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the river overlay reaches exactly c at a horizon and says it is a coordinate choice', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Black hole' }).click();
  await page.waitForTimeout(500);
  expect(await numberIn(page, 'flow')).toBeCloseTo(1, 3);
  await expect(readout(page, 'flow')).toContainText('exactly 1 at a horizon');

  // Further up the funnel it is slower, and it is the escape velocity.
  await page.getByRole('button', { name: 'Neutron star' }).click();
  await page.waitForTimeout(500);
  expect(await numberIn(page, 'flow')).toBeCloseTo(0.587, 2);

  const river = page.locator('.react-aria-Switch', { hasText: 'River model (GP)' });
  await expect(river.locator('input')).not.toBeChecked();
  await river.click();
  await expect(page.getByText(/A COORDINATE CHOICE, not a current/)).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
});

test('names Hamilton and Lisle for the river model, permanently', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('River model is a coordinate choice (GP)');
  await expect(label).toContainText('Hamilton & Lisle 2008');
  await expect(label).toBeVisible();
});

test('the camera orbits from the keyboard and reports where it is', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(700);
  await expect(readout(page, 'camera')).toContainText('30.0°');
  const azimuth = async () => {
    const text = await readout(page, 'camera').innerText();
    return Number(/azimuth\s+([\d.]+)°/.exec(text)?.[1] ?? NaN);
  };
  const before = await azimuth();
  const canvas = page.locator('.stage-surface canvas');
  await canvas.focus();
  for (let i = 0; i < 5; i++) await canvas.press('ArrowLeft');
  await page.waitForTimeout(300);
  expect(await azimuth()).not.toBeCloseTo(before, 1);
});

test('the vertical exaggeration defaults to the true surface', async ({ page }) => {
  // CLAUDE.md: physical is the default. An exaggerated funnel is a drawing, not a geometry.
  await page.goto(ROUTE);
  const slider = page.getByRole('slider', { name: 'Vertical exaggeration' });
  // A range input carries its value in `value`; react-aria does not set aria-valuenow on it.
  await expect(slider).toHaveValue('1');
  await expect(page.getByText(/1 is the true surface, and is the default/)).toBeVisible();
  // Exaggerating does not move the physics: the funnel readout is the true depth either way.
  const before = await numberIn(page, 'funnel');
  await slider.focus();
  await slider.press('End');
  await page.waitForTimeout(700);
  expect(await numberIn(page, 'funnel')).toBeCloseTo(before, 3);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
});
