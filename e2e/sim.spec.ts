import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The shipped simulation route: accessibility, keyboard operation, and the panels
 * CLAUDE.md and BUILD_PLAN §6 require. Runs against the production bundle. */

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the lensing sim is accessible and renders without page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/sims/blackhole-lensing');
    await page.getByLabel('Theme').selectOption(theme);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('When light meets a black hole.');
    // The canvas must carry a description, since a WebGL surface is otherwise opaque to
    // assistive technology.
    const canvas = page.getByRole('img', { name: /non-rotating black hole/ });
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('aria-label', /photon capture cross-section/);

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('states the shadow is not the horizon, with both numbers', async ({ page }) => {
  await page.goto('/sims/blackhole-lensing');
  await expect(page.getByText('The black disc you see is the event horizon.')).toBeVisible();
  // 2.598 r_s against 1 r_s -- the numbers the misconception turns on.
  await expect(page.getByText('2.598 rₛ', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Shadow ÷ horizon')).toBeVisible();
  await expect(page.getByText('2.598×')).toBeVisible();
});

test('labels cinematic mode as non-physical and defaults to physical', async ({ page }) => {
  await page.goto('/sims/blackhole-lensing');
  await expect(page.getByText('Physical mode. The one-sided crescent is the correct output.')).toBeVisible();
  // React Aria puts role="switch" on a visually hidden input; the label is the hit target.
  await page.locator('.react-aria-Switch', { hasText: 'Cinematic mode' }).click();
  await expect(page.getByText(/Not physical: Doppler beaming removed/)).toBeVisible();
});

test('the camera is operable from the keyboard alone', async ({ page }) => {
  await page.goto('/sims/blackhole-lensing');
  const canvas = page.getByRole('img', { name: /non-rotating black hole/ });
  await canvas.focus();
  await expect(canvas).toBeFocused();
  const before = await canvas.getAttribute('aria-label');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(canvas).not.toHaveAttribute('aria-label', String(before));
  await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('aria-label', String(before));
});

test('appears in the gallery now that it is finished', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'When light meets a black hole' })).toBeVisible();
  await expect(page.getByText('Not available yet')).toHaveCount(0);
});
