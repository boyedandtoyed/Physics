import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Geodesic deviation. The physics is `core/tidal.ts` and `description/deviationRun.ts`, both
 * tested on their own; this drives the page and the claims it makes while doing it. */

const ROUTE = '/sims/geodesic-deviation';

test.use({ viewport: { width: 1280, height: 1100 } });

const readout = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-readout="${name}"] dd`);

const numberIn = async (page: import('@playwright/test').Page, name: string) => {
  const text = await readout(page, name).innerText();
  const match = /(-?[\d.]+(?:e[-+]?\d+)?)/.exec(text.replace(/,/g, ''));
  return match ? Number(match[1]) : Number.NaN;
};

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the sim renders and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(1500);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.stage-surface canvas')).toBeVisible();
    await expect(page.locator('.stage-failure')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the radial eigenvalue is negative at every radius the fall reaches', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(2500);
  // Sampled repeatedly as the observer falls in, so this covers a range of r and not one frame.
  for (let i = 0; i < 6; i++) {
    expect(await numberIn(page, 'eigenvalues'), `sample ${i}`).toBeLessThan(0);
    await page.waitForTimeout(350);
  }
  await expect(readout(page, 'eigenvalues')).toContainText('negative radial means STRETCH');
});

test('the tidal tensor stays trace-free to machine precision', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(2000);
  expect(Math.abs(await numberIn(page, 'trace'))).toBeLessThan(1e-14);
  await expect(readout(page, 'trace')).toContainText('zero to machine precision');
});

test('the ring stretches along the fall and squeezes across it', async ({ page }) => {
  // Spaghettification, which is the sign of the Jacobi equation seen as a shape. The brief had
  // the two swapped; this is the assertion that says which way round it is.
  await page.goto(ROUTE);
  await expect.poll(async () => {
    const text = await readout(page, 'strain').innerText();
    return Number(/^([\d.]+)/.exec(text)?.[1] ?? 0);
  }, { timeout: 30_000 }).toBeGreaterThan(1.5);
  const text = await readout(page, 'strain').innerText();
  const across = Number(/·\s*([\d.]+)\s*across/.exec(text)?.[1] ?? NaN);
  expect(across).toBeLessThan(1);
  expect(across).toBeGreaterThan(0);
});

test('the Wronskian is conserved while the ellipse’s area is not', async ({ page }) => {
  // The brief asked for an "area conserved (Liouville)" check. The area is NOT conserved — it
  // grows about 40% over a fall from 8 r_s, because (ln A)″ starts at +M/r³ rather than zero.
  // What is exactly conserved is the Wronskian, a phase-space area, and that is what is checked.
  await page.goto(ROUTE);
  await expect.poll(() => numberIn(page, 'radius'), { timeout: 30_000 }).toBeLessThan(1);
  expect(Math.abs(await numberIn(page, 'conserved'))).toBeLessThan(1e-10);
  const text = await readout(page, 'conserved').innerText();
  const area = Number(/area is at (\d+)%/.exec(text)?.[1] ?? NaN);
  const volume = Number(/volume at (\d+)%/.exec(text)?.[1] ?? NaN);
  expect(area).toBeGreaterThan(110);
  // …and the enclosed volume focuses, which is what the trace-free condition actually buys.
  expect(volume).toBeLessThan(100);
});

test('the tearing radius is OUTSIDE the horizon for a small hole', async ({ page }) => {
  await page.goto(ROUTE);
  const mass = page.getByRole('slider', { name: 'Black hole mass' });
  await mass.focus();
  await mass.press('Home');
  await page.waitForTimeout(600);
  await expect(page.locator('.control', { hasText: 'Black hole mass' }).locator('output'))
    .toContainText('0.0100 M☉');
  expect(await numberIn(page, 'spaghetti')).toBeGreaterThan(0);
  await expect(readout(page, 'spaghetti')).toContainText('OUTSIDE the horizon');
  await expect(readout(page, 'spaghetti')).toContainText('tears you apart before you cross');
});

test('the tearing radius is INSIDE the horizon for a supermassive one', async ({ page }) => {
  await page.goto(ROUTE);
  const mass = page.getByRole('slider', { name: 'Black hole mass' });
  await mass.focus();
  await mass.press('End');
  await page.waitForTimeout(600);
  await expect(page.locator('.control', { hasText: 'Black hole mass' }).locator('output'))
    .toContainText('1.00e+9 M☉');
  await expect(readout(page, 'spaghetti')).toContainText('inside the horizon');
  await expect(readout(page, 'spaghetti')).toContainText('you cross intact');
});

test('a longer body tears further out, as L^{2/3}', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(500);
  const before = await numberIn(page, 'spaghetti');
  const length = page.getByRole('slider', { name: 'Body half-length' });
  await length.focus();
  await length.press('End');
  await page.waitForTimeout(600);
  const after = await numberIn(page, 'spaghetti');
  // 0.5 m to 10 m is a factor of 20 in L, so 20^{2/3} = 7.37 in radius.
  expect(after / before).toBeGreaterThan(1.5);
  await expect(readout(page, 'material')).toContainText('L²');
});

test('every slider reaches both ends with the console clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(ROUTE);
  await page.waitForTimeout(700);
  for (const name of ['Release radius', 'Playback speed', 'Black hole mass', 'Body half-length']) {
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

test('the heading cannot be covered by the drawer', async ({ page }) => {
  await page.goto(ROUTE);
  const label = page.locator('.stage-permanent-label');
  await expect(label).toContainText('Geodesic Deviation & Tidal Forces');
  await expect(label).toContainText('minus sign is what makes the negative eigenvalue a stretch');
  await expect(label).toContainText('ellipse’s area is not conserved');
  await expect(label).toBeVisible();
});

test('corrects the squeeze-radially and area-conserved stories', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/Tidal forces squeeze you radially and stretch you sideways/))
    .toBeVisible();
  await expect(page.getByText(/The ellipse keeps its area, because the tidal tensor is trace-free/))
    .toBeVisible();
  await expect(page.getByText(/You get spaghettified when you cross the horizon/)).toBeVisible();
  await expect(page.getByText(/317 M☉ for a 1 m steel rod/)).toBeVisible();
});
