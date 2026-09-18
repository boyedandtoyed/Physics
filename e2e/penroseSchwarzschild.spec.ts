import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The Penrose conformal diagram. The map is `core/kruskal` and the shape
 * `description/conformal.ts`, both tested on their own; this drives the page. */

const ROUTE = '/sims/penrose-schwarzschild';

test.use({ viewport: { width: 1280, height: 1100 } });

const readout = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-readout="${name}"] dd`);

async function clickAt(
  page: import('@playwright/test').Page, acrossFraction: number, upFraction: number,
) {
  const box = (await page.locator('.stage-surface canvas').boundingBox())!;
  const viewport = page.viewportSize()!;
  const y = box.y + box.height * (1 - upFraction);
  expect(y, 'click target is below the viewport').toBeLessThan(viewport.height);
  await page.mouse.click(box.x + box.width * acrossFraction, y);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the diagram renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(1500);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.stage-failure')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('labels every boundary and every corner on the diagram', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  for (const label of [
    'r = 0, future', 'r = 0, past', 'ℐ⁺ (right)', 'ℐ⁻ (right)', 'ℐ⁺ (left)', 'ℐ⁻ (left)',
    'Future horizon', 'Past horizon',
  ]) {
    await expect(page.locator('.penrose-edge-label', { hasText: label }).first()).toBeVisible();
  }
  for (const corner of ['i⁰', 'i⁺', 'i⁻']) {
    await expect(page.locator('.penrose-corner-label', { hasText: corner }).first()).toBeVisible();
  }
  for (const region of ['I — our exterior', 'II — inside the horizon', 'III — the white hole',
    'IV — the parallel exterior']) {
    await expect(page.locator('.penrose-region-label', { hasText: region })).toBeVisible();
  }
  await expect(readout(page, 'boundaries')).toContainText('10');
  await expect(readout(page, 'boundaries')).toContainText('6');
});

test('an event in region I can reach two regions; one inside the horizon can reach one', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  await clickAt(page, 0.62, 0.5);
  await expect(readout(page, 'event')).toContainText('exterior');
  await expect(readout(page, 'reach')).toContainText('2 of 4');
  await expect(readout(page, 'reach')).toContainText('exterior, black-hole');

  // Inside the horizon: trapped, and the diagram says so by opening the cone into one region.
  await clickAt(page, 0.5, 0.58);
  await expect(readout(page, 'event')).toContainText('black-hole');
  await expect(readout(page, 'reach')).toContainText('1 of 4');

  // The white hole reaches everywhere, which is the asymmetry worth seeing.
  await clickAt(page, 0.5, 0.42);
  await expect(readout(page, 'event')).toContainText('white-hole');
  await expect(readout(page, 'reach')).toContainText('4 of 4');
});

test('refuses a click outside the diamond', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  // Top-left corner of the canvas is well outside the diagram.
  await clickAt(page, 0.04, 0.96);
  await expect(readout(page, 'event')).toContainText('outside the diagram');
});

test('both worldline buttons toggle, and the fall is marked trapped after the horizon', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  const observer = page.getByRole('button', { name: 'Observer in region I' });
  const faller = page.getByRole('button', { name: 'Infalling observer' });
  await expect(observer).toHaveAttribute('aria-pressed', 'false');
  await observer.click();
  await expect(observer).toHaveAttribute('aria-pressed', 'true');
  await faller.click();
  await expect(faller).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/no signal the faller sends reaches ℐ⁺ ever again/)).toBeVisible();
  // The brief said the infalling worldline crosses ℐ⁺. It does not, and the page says so.
  await expect(page.getByText(/It does NOT cross ℐ⁺/)).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
});

test('every slider reaches both ends with the console clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'Observer in region I' }).click();
  await page.getByRole('button', { name: 'Infalling observer' }).click();
  for (const name of ['Static observer radius', 'Release radius']) {
    const slider = page.getByRole('slider', { name });
    await slider.focus();
    for (const key of ['Home', 'End'] as const) {
      await slider.press(key);
      await page.waitForTimeout(500);
      await expect(page.locator('.stage-failure'), `${name} ${key}`).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
});

test('the boundary key explains each edge', async ({ page }) => {
  await page.goto(ROUTE);
  const key = page.locator('.boundary-key');
  await expect(key.locator('dl')).toBeHidden();
  await key.getByText('What every boundary is').click();
  await expect(key.locator('dl')).toBeVisible();
  await expect(key).toContainText('Spacelike: a moment, not a place');
  await expect(key).toContainText('where light that escapes ends up');
  await expect(key).toContainText('where an observer who never falls in ends up');
});

test('states what the diagram does and does not preserve, permanently', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('all of spacetime fits on screen');
  await expect(label).toContainText('Light always travels at 45°');
  await expect(label).toContainText('not distances or time intervals');
  await expect(label).toContainText('corner of region I where ℐ⁺ meets the horizon');
  await expect(label).toContainText('not the top of the picture');
  await expect(label).toBeVisible();
});

test('corrects the i⁺-at-the-top and crosses-ℐ⁺ stories', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/The top of the diagram is i⁺, future timelike infinity/))
    .toBeVisible();
  await expect(page.getByText(/The top is the singularity/)).toBeVisible();
  await expect(page.getByText(/The infalling observer crosses ℐ⁺/)).toBeVisible();
  await expect(page.getByText(/Two points close together on the diagram/)).toBeVisible();
});
