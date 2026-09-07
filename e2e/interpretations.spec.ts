import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The Interpretations module against the production bundle: the four-way agreement, the wrong
 * comparison shown beside it, keyboard operation and accessibility in both themes. */

const ROUTE = '/sims/interpretations';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the interpretations module is accessible and renders without page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Four');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('shows all four charts, each with its own time coordinate', async ({ page }) => {
  await page.goto(ROUTE);
  for (const name of ['Schwarzschild', 'Gullstrand–Painlevé', 'Eddington–Finkelstein', 'Kruskal–Szekeres']) {
    await expect(page.getByRole('rowheader', { name, exact: true })).toBeVisible();
  }
  // Four panels, each actually drawing a worldline — an empty panel is the failure mode here.
  await expect(page.locator('.panel-worldline')).toHaveCount(4);
  for (const path of await page.locator('.panel-worldline').all()) {
    const d = await path.getAttribute('d');
    expect((d ?? '').length).toBeGreaterThan(200);
    expect(d).not.toContain('NaN');
  }
});

test('the four charts agree on the invariants while disagreeing on the coordinates', async ({ page }) => {
  await page.goto(ROUTE);
  const slider = page.getByRole('slider', { name: /faller/ });
  await slider.focus();
  for (let step = 0; step < 300; step++) await slider.press('ArrowRight');

  const rows = page.locator('.agreement tbody tr');
  await expect(rows).toHaveCount(4);
  const radii = await rows.locator('td').nth(1).allTextContents();
  const coordinates = await rows.locator('td').nth(0).allTextContents();
  // Every chart recovers the same radius...
  expect(new Set(await Promise.all(
    (await rows.all()).map(async row => (await row.locator('td').nth(1).textContent())?.trim()),
  )).size).toBe(1);
  // ...from four visibly different coordinate values.
  expect(new Set(await Promise.all(
    (await rows.all()).map(async row => (await row.locator('td').nth(0).textContent())?.trim()),
  )).size).toBe(4);
  expect(radii.length + coordinates.length).toBeGreaterThan(0);
  await expect(page.getByText(/The gate is 10⁻¹⁰/)).toBeVisible();
});

test('shows the wrong comparison beside the right one, with its 745x spread', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/comparing a number with itself/)).toBeVisible();
  await expect(page.getByText('r = 3.5339 rₛ')).toBeVisible();
  await expect(page.getByText('r = 2.1386 rₛ')).toBeVisible();
  await expect(page.getByText('r = 6.4395 rₛ')).toBeVisible();
  await expect(page.locator('.naive-note strong')).toHaveText('745×');
});

test('carries the tidal panel that breaks the expansion story', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/identically zero/).first()).toBeVisible();
  await expect(page.getByRole('img', { name: /ring of free-falling test particles/ })).toBeVisible();
  await expect(page.getByText(/2:1 ratio of stretch/)).toBeVisible();
});

test('takes the river model seriously and then bounds it', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText(/Space really is flowing inward/)).toBeVisible();
  await expect(page.getByText(/no physically observable meaning/)).toBeVisible();
  // The claim is not dismissed: the exact half is stated first.
  await expect(page.getByText(/Half right, and the half that is right is exact/)).toBeVisible();
  await expect(page.getByText('exactly c')).toBeVisible();
});

test('the event slider is operable from the keyboard and reaches the horizon', async ({ page }) => {
  await page.goto(ROUTE);
  const slider = page.getByRole('slider', { name: /faller/ });
  await slider.focus();
  expect(Number(await slider.inputValue())).toBe(0);
  await slider.press('End');
  expect(Number(await slider.inputValue())).toBe(600);
  // The faller reaches the horizon: r = 1 exactly, in finite proper time.
  await expect(page.locator('.event-figures dd').first()).toContainText('1.000000');
  await expect(page.locator('.event-figures dd').nth(1)).toContainText('14.4183');
});

test('announces the physics, including that the horizon is unremarkable', async ({ page }) => {
  await page.goto(ROUTE);
  const live = page.locator('[role="status"][aria-live="polite"]');
  await expect(live).toContainText('four charts', { timeout: 5000 });
  const slider = page.getByRole('slider', { name: /faller/ });
  await slider.focus();
  await slider.press('End');
  await expect(live).toContainText('the curvature is unremarkable', { timeout: 5000 });
});
