import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The gravity sandbox. The physics is `core/nbody.ts` and `description/sandboxRun.ts`, both
 * tested on their own; this drives the interaction — placing, dragging, removing — and the
 * claims the panel makes while doing it. */

const ROUTE = '/sims/gravity-sandbox';

// Tall enough that the whole canvas is inside the window. The default 1280x720 puts the canvas
// bottom at y ≈ 946, and a click below the viewport is simply discarded — six of fifteen
// placements vanished that way, which reads as the sim dropping bodies.
test.use({ viewport: { width: 1280, height: 1100 } });

/** Rows carry a `data-readout` hook: matching on the visible label picked up "of 60 allowed"
 *  when asked whether the body count was zero. */
const readout = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-readout="${name}"] dd`);

const numberIn = async (page: import('@playwright/test').Page, name: string) => {
  const text = await readout(page, name).innerText();
  const match = /(-?[\d.]+(?:e[-+]?\d+)?)/.exec(text.replace(/,/g, ''));
  return match ? Number(match[1]) : Number.NaN;
};

async function place(
  page: import('@playwright/test').Page, x: number, y: number, dx = 0, dy = 0,
) {
  const canvas = page.locator('.stage-surface canvas');
  const box = (await canvas.boundingBox())!;
  const viewport = page.viewportSize()!;
  // A click outside the window is discarded silently, so assert rather than discover it later
  // as "the sim lost a body". The view is a perspective one now, so a click ABOVE the horizon
  // line misses the equatorial plane and is discarded too — targets belong in the lower half.
  expect(box.y + y + dy, 'click target is below the viewport').toBeLessThan(viewport.height);
  expect(box.x + x + dx, 'click target is right of the viewport').toBeLessThan(viewport.width);
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  if (dx !== 0 || dy !== 0) await page.mouse.move(box.x + x + dx, box.y + y + dy, { steps: 4 });
  await page.mouse.up();
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the sandbox renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.getByRole('button', { name: 'Earth and Moon' }).click();
    await page.waitForTimeout(2200);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.stage-failure')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('places a mass where the canvas is clicked, and removes it on right-click', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  expect(await numberIn(page, 'bodies')).toBe(0);

  await place(page, 200, 200);
  await page.waitForTimeout(400);
  expect(await numberIn(page, 'bodies')).toBe(1);

  const canvas = page.locator('.stage-surface canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 200, { button: 'right' });
  await page.waitForTimeout(400);
  expect(await numberIn(page, 'bodies')).toBe(0);
});

test('places 15 masses and runs 30 s of sim time without crashing', async ({ page }) => {
  // The brief's stress test, driven through the UI. Placed while PAUSED: fifteen planets dropped
  // at rest on a ring genuinely collapse and merge within a second at high speed, so placing them
  // against a running clock tests the absorber rather than the placement.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Pause' }).click();

  for (let index = 0; index < 15; index++) {
    const angle = (index / 15) * Math.PI * 2;
    await place(page, 300 + Math.cos(angle) * 160, 260 + Math.sin(angle) * 160, 0, 0);
  }
  expect(await numberIn(page, 'bodies')).toBe(15);

  await page.getByRole('slider', { name: 'Speed' }).focus();
  await page.getByRole('slider', { name: 'Speed' }).press('End');
  await page.getByRole('button', { name: 'Play' }).click();
  // Speed is at its maximum, so a few seconds of wall time is well past 30 sim units.
  await expect.poll(() => numberIn(page, 'time'), { timeout: 60_000 }).toBeGreaterThan(30);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
  await expect(page.locator('.stage-surface canvas')).toBeVisible();
  // Some will have merged — fifteen point masses at rest collapse — but the run must survive it.
  expect(await numberIn(page, 'bodies')).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('every slider and every preset survives, with the console clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  await page.waitForTimeout(800);
  for (const name of ['Speed', 'Camera distance', 'Camera height', 'Sheet depth']) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    for (const key of ['Home', 'End'] as const) {
      await slider.press(key);
      await page.waitForTimeout(400);
      await expect(page.locator('.stage-failure'), `${name} at ${key}`).toHaveCount(0);
    }
  }
  for (const preset of ['Earth and Moon', 'Sun, Earth, Jupiter', 'Binary black holes']) {
    await page.getByRole('button', { name: preset }).click();
    await page.waitForTimeout(900);
    await expect(page.locator('.stage-failure'), preset).toHaveCount(0);
    expect(await numberIn(page, 'bodies'), preset).toBeGreaterThan(1);
  }
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.waitForTimeout(300);
  expect(await numberIn(page, 'bodies')).toBe(0);
  expect(errors).toEqual([]);
});

test('every preset is resolved by the fixed step, and says how well', async ({ page }) => {
  // The defect this guards: Sun–Earth–Jupiter built on the Earth as the mass unit gets 1.6 steps
  // per orbit and renders a polygon. The readout is what makes that visible rather than pretty.
  await page.goto(ROUTE);
  for (const preset of ['Earth and Moon', 'Sun, Earth, Jupiter', 'Binary black holes']) {
    await page.getByRole('button', { name: preset }).click();
    await page.waitForTimeout(700);
    expect(await numberIn(page, 'resolution'), preset).toBeGreaterThan(40);
    await expect(page.locator('[data-readout="resolution"]'), preset)
      .not.toHaveClass(/under-resolved/);
  }
});

test('the energy drift stays tiny with the correction off and worsens with it on', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Binary black holes' }).click();
  await page.getByRole('slider', { name: 'Speed' }).focus();
  await page.getByRole('slider', { name: 'Speed' }).press('End');
  await page.waitForTimeout(3000);
  const drift = async () => Math.abs(await numberIn(page, 'drift'));
  const newtonian = await drift();
  expect(newtonian).toBeLessThan(1e-6);

  await page.locator('.react-aria-Switch', { hasText: 'Post-Newtonian correction' }).click();
  // Three switches now, each with its own notice; this one is the first.
  await expect(page.locator('.mode-warning').first())
    .toContainText('NOT the 1PN N-body equations');
  await page.getByRole('button', { name: 'Binary black holes' }).click();
  await page.waitForTimeout(3000);
  const corrected = await drift();
  expect(Number.isFinite(corrected), 'the correction must not blow the energy up to NaN').toBe(true);
  expect(corrected).toBeGreaterThan(newtonian);
  // ...and the panel must say how big the correction has got, since at 10% it is near the edge
  // of what an expansion in GM/rc² can claim.
  expect(await numberIn(page, 'correction')).toBeGreaterThan(1);
});

test('a click places a mass and does NOT expand the sim', async ({ page }) => {
  // The defect this guards: click-to-expand fired on every placement, the canvas grew from
  // 540 px to 912 px tall, and every later click mapped to different sim coordinates — a
  // right-click aimed at the body just placed missed it by 67 px.
  await page.goto(ROUTE);
  await page.waitForTimeout(700);
  const before = (await page.locator('.stage-surface canvas').boundingBox())!;
  await place(page, 250, 220);
  await page.waitForTimeout(400);
  await expect(page.locator('.sim-stage')).not.toHaveClass(/is-focused/);
  const after = (await page.locator('.stage-surface canvas').boundingBox())!;
  expect(after.height).toBeCloseTo(before.height, 0);
  expect(await numberIn(page, 'bodies')).toBe(1);

  // Expand is still reachable, from the panel.
  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(page.locator('.sim-stage')).toHaveClass(/is-focused/);
  await page.keyboard.press('Escape');
});

test('states that it is not a full GR simulation, permanently', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('Not a full GR simulation');
  await expect(label).toContainText('no horizon here');
  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(page.locator('.sim-stage')).toHaveClass(/is-focused/);
  await expect(label).toBeVisible();
  await page.keyboard.press('Escape');
});

test('corrects the validity domain of the correction, in the misconceptions', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/Exactly backwards/)).toBeVisible();
  await expect(page.getByText(/10% of the Newtonian term/)).toBeVisible();
  await expect(page.getByText(/Einstein–Infeld–Hoffmann/).first()).toBeVisible();
});

// ---------------------------------------------------------------------------------------------
// The 3D view: the camera, the deforming sheet, and the two switches that are new with it.
// ---------------------------------------------------------------------------------------------

test('the camera orbits from the keyboard, and the readout says where it is', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(800);
  await expect(readout(page, 'camera')).toContainText('30.0°');
  await expect(readout(page, 'camera')).toContainText('above the plane');

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

  // Up and down change the height, and the pole is clamped rather than reached.
  for (let i = 0; i < 60; i++) await canvas.press('ArrowUp');
  await page.waitForTimeout(300);
  const height = Number(/^([\d.]+)°/.exec(await readout(page, 'camera').innerText())?.[1] ?? NaN);
  expect(height).toBeGreaterThan(60);
  expect(height, 'the camera basis degenerates at the pole, so it must stop short').toBeLessThan(90);
});

test('the camera sliders reach both ends and the scene survives edge-on', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Binary black holes' }).click();
  const height = page.getByRole('slider', { name: 'Camera height' });
  await height.focus();
  // Edge-on: the plane is a line, and the pixel-to-plane map has no solution for most of the
  // frame. It must not throw, and the sim must not stop drawing.
  await height.press('Home');
  await page.waitForTimeout(700);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
  await height.press('End');
  await page.waitForTimeout(700);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the sheet deepens when a heavier mass goes on it', async ({ page }) => {
  // The sheet is the Newtonian potential (§2.9), so this is a claim about the field and not
  // about pixels: -3M/2R at the centre of a uniform sphere.
  await page.goto(ROUTE);
  await page.waitForTimeout(600);
  expect(await numberIn(page, 'well')).toBe(0);

  await place(page, 300, 330);
  await page.waitForTimeout(400);
  const planet = await numberIn(page, 'well');
  expect(planet).toBeCloseTo(-7.5, 1);

  // The palette entry, not the "Binary black holes" preset that also matches the words.
  await page.getByRole('button', { name: 'Black hole M =' }).click();
  await place(page, 480, 360);
  await page.waitForTimeout(400);
  const hole = await numberIn(page, 'well');
  // Ten times the mass in half the volume: far deeper, and deeper than a mere factor of ten.
  expect(hole).toBeLessThan(planet * 5);
});

test('the sheet’s depth slider changes the drawing and not the field', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Binary black holes' }).click();
  await page.waitForTimeout(600);
  const before = await numberIn(page, 'well');
  const depth = page.getByRole('slider', { name: 'Sheet depth' });
  await depth.focus();
  await depth.press('Home');
  await page.waitForTimeout(600);
  // Flat sheet, identical physics: the readout is the potential, which the slider never touches.
  expect(await numberIn(page, 'well')).toBeCloseTo(before, 1);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
});

test('a click near the middle of the canvas places a mass near the origin', async ({ page }) => {
  // The real test of the perspective pixel-to-plane map, in a browser: the sheet's deepest point
  // is at the body, so placing one mass makes the readout its own central potential exactly.
  await page.goto(ROUTE);
  await page.waitForTimeout(600);
  const box = (await page.locator('.stage-surface canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.62);
  await page.waitForTimeout(400);
  expect(await numberIn(page, 'bodies')).toBe(1);
  expect(await numberIn(page, 'well')).toBeCloseTo(-7.5, 1);
});

test('radiation is what makes the inspiral inspiral, and it is off by default', async ({ page }) => {
  await page.goto(ROUTE);
  const radiation = page.locator('.react-aria-Switch', { hasText: 'Gravitational radiation' });
  await expect(radiation.locator('input')).not.toBeChecked();
  await expect(page.getByText(/Nothing here inspirals until this is on/)).toBeVisible();

  await page.getByRole('button', { name: 'Inspiral', exact: true }).click();
  await page.getByRole('slider', { name: 'Speed' }).focus();
  await page.getByRole('slider', { name: 'Speed' }).press('End');
  await page.waitForTimeout(4000);
  // Conservative: the pair is still a pair, and the orbit has not shrunk into the absorb radius.
  expect(await numberIn(page, 'bodies')).toBe(2);

  await radiation.click();
  await expect(page.getByText(/Peters gives 659 sim units to merger/)).toBeVisible();
  await page.getByRole('button', { name: 'Inspiral', exact: true }).click();
  // Peters gives 659 sim units from this separation, which at 100x is about seven seconds.
  await expect.poll(() => numberIn(page, 'bodies'), { timeout: 60_000 }).toBe(1);
});

test('the schematic distortion is off by default and is labelled as not lensing', async ({ page }) => {
  // CLAUDE.md: physical is the default, and a non-physical view is labelled as one. A radial
  // pull on finished pixels is about as non-physical as this repo gets.
  await page.goto(ROUTE);
  const distortion = page.locator('.react-aria-Switch', { hasText: 'Schematic distortion' });
  await expect(distortion.locator('input')).not.toBeChecked();
  await expect(page.getByText(/physical is the default here/)).toBeVisible();

  await page.getByRole('button', { name: 'Binary black holes' }).click();
  await distortion.click();
  await expect(page.getByText(/NOT PHYSICAL/)).toBeVisible();
  await expect(page.getByText(/It is not lensing: no ray is traced/)).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
});

test('says the grid is the Newtonian potential and not an embedding diagram', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('Newtonian potential, not a solution of Einstein');
  await expect(label).toContainText('not');
  await expect(label).toContainText('Flamm paraboloid');
  await expect(label).toBeVisible();
  await expect(page.getByText(/There is no embedding diagram of two stars/)).toBeVisible();
});

test('the three new presets load and are what they say they are', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Inner planets' }).click();
  await page.waitForTimeout(500);
  expect(await numberIn(page, 'bodies')).toBe(5);

  await page.getByRole('button', { name: 'Figure eight' }).click();
  await page.waitForTimeout(500);
  expect(await numberIn(page, 'bodies')).toBe(3);
  // The choreography is a genuine solution, so it must still be a three-body system a while in.
  await page.waitForTimeout(4000);
  expect(await numberIn(page, 'bodies')).toBe(3);
  expect(Math.abs(await numberIn(page, 'drift'))).toBeLessThan(1e-4);

  await page.getByRole('button', { name: 'Inspiral', exact: true }).click();
  await page.waitForTimeout(500);
  expect(await numberIn(page, 'bodies')).toBe(2);
});
