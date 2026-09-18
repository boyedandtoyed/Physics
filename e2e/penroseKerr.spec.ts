import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The Kerr causal diagram. The radial structure is `core/kerr` and the block geometry
 * `description/kerrBlocks.ts`, both tested on their own; this drives the page and, above all,
 * checks that it says which half of the picture is computed and which is taken from Carter. */

const ROUTE = '/sims/penrose-kerr';

test.use({ viewport: { width: 1280, height: 1100 } });

const readout = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-readout="${name}"] dd`);

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the tower renders and is accessible`, async ({ page }) => {
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

test('shows the computed radial structure at a/M = 0.5', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  await expect(readout(page, 'horizons')).toContainText('1.8660');
  await expect(readout(page, 'horizons')).toContainText('0.1340');
  await expect(readout(page, 'gravity')).toContainText('0.2321');
  await expect(readout(page, 'gravity')).toContainText('-3.2321');
  await expect(readout(page, 'gravity')).toContainText('13.93');
  await expect(readout(page, 'gravity')).toContainText('mass-inflation');
});

test('says the ring is at finite r*, which is why it is timelike', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  await expect(readout(page, 'ring')).toContainText('0.2688');
  await expect(readout(page, 'ring')).toContainText('finite');
  await expect(readout(page, 'ring')).toContainText('unlike either horizon at r* = ∓∞');
  await expect(readout(page, 'ring')).toContainText('timelike line');
});

test('draws three repetitions of the five-block pattern', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  await expect(readout(page, 'pattern')).toContainText('15');
  await expect(readout(page, 'pattern')).toContainText('3 repetitions × 5 blocks');
  await expect(readout(page, 'pattern')).toContainText('no top and no bottom');
  // The bands are labelled, and the labels include the repeated ones.
  await expect(page.locator('.kerr-band-label').first()).toBeVisible();
  await expect(page.getByText('III — inside the Cauchy horizon (0 < r < r₋)')).toBeVisible();
});

test('says where r is a time and where it is a place', async ({ page }) => {
  // Δ < 0 only between the horizons, and that is the one band where falling inward is as
  // unavoidable as the clock advancing.
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  const box = (await page.locator('.stage-surface canvas').boundingBox())!;
  // The middle of the view is the inner block at the default scroll position.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(readout(page, 'block')).toContainText('r is a place here');
  await expect(readout(page, 'block')).toContainText('Δ > 0');

  // A band away is the between-horizons block.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.68);
  await expect(readout(page, 'block')).toContainText('r is a TIME here');
  await expect(readout(page, 'block')).toContainText('Δ < 0');
});

test('carries the mass-inflation warning permanently', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('a/M = 0.5, equatorial slice');
  await expect(label).toContainText('Cauchy horizon (inner boundary) is physically unstable');
  await expect(label).toContainText('mass inflation');
  await expect(label).toContainText('not expected to represent physical reality');
  await expect(label).toContainText('Penrose 1968; Poisson & Israel 1990');
  await expect(label).toBeVisible();
});

test('states which half of the picture is computed and which is Carter’s', async ({ page }) => {
  // The claim that matters most on this page: the radial structure is derived, the arrangement
  // of blocks is not, and Kerr admits no single conformal map to derive it from.
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('What is computed and what is not');
  await expect(label).toContainText('exact tortoise coordinate');
  await expect(label).toContainText('standard one from Carter 1966');
  await expect(label).toContainText('no single conformal map');
  await expect(page.getByText(/This diagram was derived the way the Schwarzschild one was/))
    .toBeVisible();
});

test('corrects the unavoidable-singularity story', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/A Kerr singularity is unavoidable, like a Schwarzschild one/))
    .toBeVisible();
  await expect(page.getByText(/timelike — a place, not a moment/)).toBeVisible();
  await expect(page.getByText(/precisely the one slice where the ring cannot be dodged/))
    .toBeVisible();
});

test('every slider reaches both ends with the console clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  await page.waitForTimeout(700);
  for (const name of ['Scroll the tower', 'Bands in view']) {
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

test('names the Cauchy horizon in a warning colour, in words', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/Red crossings are the Cauchy horizon at r₋/)).toBeVisible();
  await expect(page.getByText(/drawn as a warning because that is what it is/)).toBeVisible();
  await expect(page.getByText(/magenta line is the ring singularity, vertical because it is timelike/))
    .toBeVisible();
});
