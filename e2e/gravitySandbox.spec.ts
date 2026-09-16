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
  // as "the sim lost a body".
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
  for (const name of ['Speed', 'Zoom']) {
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
  await expect(page.locator('.mode-warning')).toContainText('NOT the 1PN N-body equations');
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
