import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The clock comparison. The rates are closed forms tested in `description/clockRun.ts`; what
 * this file checks is that the page shows them, in both themes, at both ends of every control. */

const ROUTE = '/sims/clock-comparison';

test.use({ viewport: { width: 1280, height: 1100 } });

const readout = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-readout="${name}"] dd`);

const numberIn = async (page: import('@playwright/test').Page, name: string) => {
  const text = await readout(page, name).innerText();
  const match = /([+−-]?[\d.]+(?:e[-+]?\d+)?)/.exec(text.replace(/,/g, ''));
  return match ? Number(match[1]!.replace('−', '-')) : Number.NaN;
};

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: both faces render and the page is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(1500);
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.stage-failure')).toHaveCount(0);
    // The captions are HTML over the canvas, so they can be asserted where the faces cannot.
    await expect(page.getByText('A — held still')).toBeVisible();
    await expect(page.getByText('B — in orbit')).toBeVisible();
    await expect(page.getByText('one turn = 1 µs')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the dial caption stays inside the canvas, not under it', async ({ page }) => {
  // The "label below the fold" bug, at canvas scale: an HTML caption pushed past the bottom edge
  // is not clipped, it is simply gone.
  await page.goto(ROUTE);
  await page.waitForTimeout(800);
  const surface = (await page.locator('.stage-surface').boundingBox())!;
  const caption = (await page.locator('.clock-caption-dial').boundingBox())!;
  expect(caption.y + caption.height).toBeLessThanOrEqual(surface.y + surface.height);
  expect(caption.y).toBeGreaterThan(surface.y);
});

test('shows the GPS numbers, itemised, with a derivation that opens', async ({ page }) => {
  await page.goto(ROUTE);
  const gps = page.locator('[data-readout="gps"]');
  await expect(gps).toContainText('+45.719 µs/day');
  await expect(gps).toContainText('−7.109 µs/day');
  await expect(gps).toContainText('+38.610 µs/day');

  const derivation = gps.locator('.derivation');
  await expect(derivation).toBeHidden();
  await gps.getByText('Show the derivation').click();
  await expect(derivation).toBeVisible();
  // The three steps, and the one the canvas does not include.
  await expect(derivation).toContainText('The ground station is moving too');
  await expect(derivation).toContainText('+38.506 µs/day');
  await expect(derivation).toContainText('4.4647');
});

test('every preset lands on its published number', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'GPS' }).click();
  await expect(readout(page, 'drift')).toContainText('+38.506');
  await expect(readout(page, 'gravitational')).toContainText('+45.719');
  await expect(readout(page, 'kinematic')).toContainText('−7.213');

  await page.getByRole('button', { name: 'Space station' }).click();
  await expect(readout(page, 'drift')).toContainText('−24.743');

  await page.getByRole('button', { name: 'Break-even' }).click();
  await expect(readout(page, 'drift')).toContainText('the two terms cancel exactly');
  expect(Math.abs(await numberIn(page, 'drift'))).toBeLessThan(1e-3);

  // Clock B cannot orbit below low Earth orbit here, so "same radius" means both at 6 771 km.
  await page.getByRole('button', { name: 'Same radius' }).click();
  await expect(readout(page, 'drift')).toContainText('−28.296');
  await expect(readout(page, 'gravitational')).toContainText('+0.000');
});

test('the drift changes sign across 1.5 r_A, which is the whole point', async ({ page }) => {
  await page.goto(ROUTE);
  const orbit = page.getByRole('slider', { name: 'Clock B — orbit radius' });
  await expect(readout(page, 'breakeven')).toContainText('1.500');
  await orbit.focus();
  await orbit.press('Home');
  expect(await numberIn(page, 'drift')).toBeLessThan(0);
  await orbit.press('End');
  expect(await numberIn(page, 'drift')).toBeGreaterThan(0);
});

test('every control reaches both of its ends with the console clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  await page.waitForTimeout(600);
  for (const label of ['Clock A — static radius', 'Clock B — orbit radius', 'Speed']) {
    const slider = page.getByRole('slider', { name: label });
    await slider.focus();
    for (const key of ['Home', 'End'] as const) {
      await slider.press(key);
      await page.waitForTimeout(500);
      await expect(page.locator('.stage-failure'), `${label} ${key}`).toHaveCount(0);
    }
  }
  // Speed at its top end: 10 000×, and the accumulated difference must still be finite. The
  // slider's raw value is an exponent, so the readout is the only place the factor appears.
  await expect(page.locator('.control', { hasText: 'Speed' }).locator('output'))
    .toContainText('10,000×');
  expect(Number.isFinite(await numberIn(page, 'difference'))).toBe(true);
  expect(errors).toEqual([]);
});

test('raising clock A raises the break-even radius with it', async ({ page }) => {
  await page.goto(ROUTE);
  const tower = page.getByRole('slider', { name: 'Clock A — static radius' });
  await tower.focus();
  await tower.press('End');
  await expect(readout(page, 'breakeven')).toContainText('15.000');
  await expect(readout(page, 'breakeven')).toContainText('95565 km');
});

test('the difference accumulates, and resetting sends it back to zero', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'GPS' }).click();
  const speed = page.getByRole('slider', { name: 'Speed' });
  await speed.focus();
  await speed.press('End');
  await expect.poll(() => numberIn(page, 'difference'), { timeout: 20_000 }).toBeGreaterThan(0.5);
  // Pause first: at 10 000× the difference is back over a microsecond within a second of
  // wall time, which would make a "reset to zero" assertion a race rather than a check.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.waitForTimeout(300);
  expect(Math.abs(await numberIn(page, 'difference'))).toBeLessThan(1e-6);
});

test('says which clock is which, permanently and above the fold', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('never visibly disagree');
  await expect(label).toContainText('one turn of its needle is one microsecond');
  await expect(label).toContainText('static');
  await expect(label).toBeVisible();
});

test('corrects the same-radius and always-gains stories', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/Two clocks at the same radius must tick at the same rate/))
    .toBeVisible();
  await expect(page.getByText(/r_B = 1.5 r_A, and no mass appears in that/)).toBeVisible();
  await expect(page.getByText(/Clocks higher up always run fast/)).toBeVisible();
});

test('shows both rates to enough places to be different numbers', async ({ page }) => {
  await page.goto(ROUTE);
  await page.getByRole('button', { name: 'GPS' }).click();
  const rates = await readout(page, 'rates').innerText();
  expect(rates).toContain('0.999999999304');
  expect(rates).toContain('0.999999999750');
});
