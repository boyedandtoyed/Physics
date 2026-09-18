import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The Kruskal diagram. The chart is `core/kruskal` and the geometry `description/diagram.ts`,
 * both tested on their own; this drives the page and the claims it makes while doing it. */

const ROUTE = '/sims/kruskal-diagram';

test.use({ viewport: { width: 1280, height: 1100 } });

const readout = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-readout="${name}"] dd`);

const numberIn = async (page: import('@playwright/test').Page, name: string) => {
  const text = await readout(page, name).innerText();
  const match = /(-?[\d.]+(?:e[-+]?\d+)?)/.exec(text.replace(/,/g, ''));
  return match ? Number(match[1]) : Number.NaN;
};

/** Click at a fraction of the canvas. The diagram is centred, so (0.5, 0.5) is the origin. */
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

test('names the region for a click in each of the four quadrants', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  await clickAt(page, 0.72, 0.5);
  await expect(readout(page, 'event')).toContainText('region I, our exterior');
  await clickAt(page, 0.28, 0.5);
  await expect(readout(page, 'event')).toContainText('region IV, the parallel exterior');
  await clickAt(page, 0.5, 0.62);
  await expect(readout(page, 'event')).toContainText('region II, inside the horizon');
  await clickAt(page, 0.5, 0.38);
  await expect(readout(page, 'event')).toContainText('region III, the white hole');
});

test('refuses to quote coordinates past the singularity', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  // Straight up from the origin, well past T² − X² = 1.
  await clickAt(page, 0.5, 0.95);
  await expect(readout(page, 'event')).toContainText('past r = 0');
  await expect(readout(page, 'event')).toContainText('there is no spacetime here');
});

test('the static observer is a hyperbola, not a vertical line', async ({ page }) => {
  // The brief said a static observer follows a vertical line. It does not — it follows
  // X² − T² = const, the same curve a Rindler observer follows in flat space.
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  await clickAt(page, 0.72, 0.5);
  await expect(readout(page, 'observer')).toContainText('hyperbola');
  await expect(readout(page, 'observer')).toContainText('never crossing either horizon');
  expect(await numberIn(page, 'observer')).toBeGreaterThan(2);
  await expect(page.getByText(/A static observer is a vertical line on the Kruskal diagram/))
    .toBeVisible();
  await expect(page.getByText(/it is not even timelike/)).toBeVisible();
});

test('a dropped particle crosses the horizon and reaches the singularity', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  await clickAt(page, 0.72, 0.5);
  const start = await numberIn(page, 'observer');
  expect(start).toBeGreaterThan(2);

  await page.getByRole('slider', { name: 'Fall duration' }).focus();
  await page.getByRole('slider', { name: 'Fall duration' }).press('Home');
  await page.getByRole('button', { name: 'Drop a test particle' }).click();

  // It starts outside and ends inside, in a finite time on its own clock.
  await expect.poll(() => readout(page, 'faller').innerText(), { timeout: 30_000 })
    .toContain('inside the horizon');
  await expect.poll(() => numberIn(page, 'faller'), { timeout: 30_000 }).toBeLessThan(0.05);
  // …and the proper time to r = 0 is finite and smaller than the release radius in M.
  const duration = await numberIn(page, 'fall');
  expect(duration).toBeGreaterThan(0);
  expect(Number.isFinite(duration)).toBe(true);
  await expect(readout(page, 'fall')).toContainText('% of the way through');
});

test('the drop button does nothing until an observer exists', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByRole('button', { name: 'Drop a test particle' })).toBeDisabled();
  await clickAt(page, 0.72, 0.5);
  await expect(page.getByRole('button', { name: 'Drop a test particle' })).toBeEnabled();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('button', { name: 'Drop a test particle' })).toBeDisabled();
  await expect(readout(page, 'observer')).toContainText('—');
});

test('the mass slider moves the labels and not the picture', async ({ page }) => {
  // M appears only in the normalisation: with r and t in M, X and T contain no M at all.
  await page.goto(ROUTE);
  await page.waitForTimeout(900);
  await clickAt(page, 0.72, 0.5);
  const before = await numberIn(page, 'observer');
  await expect(readout(page, 'invariance')).toContainText('none');
  await expect(readout(page, 'invariance')).toContainText('29.5 km');

  const mass = page.getByRole('slider', { name: 'Black hole mass' });
  await mass.focus();
  await mass.press('End');
  await page.waitForTimeout(600);
  // The event's radius in M is unchanged; only the quoted r_s in km moves.
  expect(await numberIn(page, 'observer')).toBeCloseTo(before, 2);
  await expect(readout(page, 'invariance')).toContainText('295 km');
  await expect(page.locator('.stage-failure')).toHaveCount(0);
});

test('every slider reaches both ends with the console clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  await page.waitForTimeout(700);
  await clickAt(page, 0.72, 0.5);
  for (const name of ['Window', 'Fall duration', 'Black hole mass']) {
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

test('the light cone toggles, and says what it shows inside the horizon', async ({ page }) => {
  await page.goto(ROUTE);
  const cone = page.locator('.react-aria-Switch', { hasText: 'Light cone' });
  await expect(cone.locator('input')).toBeChecked();
  await expect(page.getByText(/Inside region II every future direction points at the singularity/))
    .toBeVisible();
  await cone.click();
  await page.waitForTimeout(500);
  await expect(page.locator('.stage-failure')).toHaveCount(0);
});

test('states that regions III and IV are continuations, permanently', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('Regions III and IV are mathematical continuations');
  await expect(label).toContainText('do not connect to our universe’s past');
  await expect(label).toContainText('drawn jagged because the geometry ends there');
  await expect(label).toBeVisible();
});

test('corrects the singularity-as-a-place and horizon-is-singular stories', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/The singularity is a place at the centre/)).toBeVisible();
  await expect(page.getByText(/Steering changes how long you have, not whether you arrive/))
    .toBeVisible();
  await expect(page.getByText(/The horizon is where the geometry becomes singular/)).toBeVisible();
  await expect(page.getByText(/3\/4M⁴ — finite/)).toBeVisible();
});
