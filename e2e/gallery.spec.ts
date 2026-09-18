import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The collection page's live backdrop and its baked card stills.
 *
 * Both are decorative, and the point of most of this file is that they behave like it: they must
 * not cost contrast, must not be announced to a screen reader, and must leave the page exactly as
 * they found it when they cannot run at all. */

const BACKDROP = '.gallery-backdrop';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the collection renders with its backdrop and stays accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(2500);
    await expect(page.locator(`${BACKDROP} canvas`)).toHaveCount(1);
    // Contrast is the thing a backdrop breaks, and it breaks it in exactly one theme.
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the backdrop is hidden from assistive technology and takes no pointer events', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  const backdrop = page.locator(BACKDROP);
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  expect(await backdrop.evaluate(node => getComputedStyle(node).pointerEvents)).toBe('none');
  // Behind the content, not over it.
  expect(Number(await backdrop.evaluate(node => getComputedStyle(node).zIndex))).toBeLessThan(0);
  // A click where the backdrop lies must still reach the link underneath it.
  await page.getByRole('link', { name: /Meet the method/ }).click();
  await expect(page).toHaveURL(/\/method$/);
});

test('falls back to the plain page when WebGL2 is unavailable', async ({ page }) => {
  // The whole contract for a decorative canvas: without it, the page is what it was before.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HTMLCanvasElement.prototype.getContext = function patched(this: HTMLCanvasElement, id: string, ...rest: any[]) {
      if (id === 'webgl2') return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original as any).call(this, id, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForTimeout(1500);
  // No canvas, no error message, no gap: the backdrop removes itself entirely.
  await expect(page.locator(BACKDROP)).toHaveCount(0);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  // And the page it decorates is untouched.
  await expect(page.getByRole('heading', { name: /The collection/ })).toBeVisible();
  await expect(page.locator('.sim-grid > article')).toHaveCount(15);
  await expect(page.getByRole('link', { name: 'When light meets a black hole' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('every card carries a baked still, and every still actually loads', async ({ page }) => {
  const notFound: string[] = [];
  page.on('response', response => {
    if (response.status() >= 400) notFound.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/');
  const thumbnails = page.locator('.sim-thumbnail');
  await expect(thumbnails).toHaveCount(15);
  await page.waitForTimeout(2000);
  expect(notFound, 'a thumbnail 404 would silently blank a card').toEqual([]);

  // Decorative: the card's heading and description are what carries the meaning.
  for (const alt of await thumbnails.evaluateAll(nodes =>
    nodes.map(node => (node as HTMLImageElement).alt))) {
    expect(alt).toBe('');
  }
  // They are real images with real pixels, not broken ones the browser has laid out anyway.
  const widths = await thumbnails.evaluateAll(nodes =>
    nodes.map(node => (node as HTMLImageElement).naturalWidth));
  for (const width of widths) expect(width).toBeGreaterThan(100);
});

test('a still is a still: no extra WebGL context is opened per card', async ({ page }) => {
  // Fifteen live canvases is more than a browser hands out, and the sixteenth silently drops the
  // first. The cards are images for that reason, so there must be exactly one canvas on the page.
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.sim-grid canvas')).toHaveCount(0);
});
