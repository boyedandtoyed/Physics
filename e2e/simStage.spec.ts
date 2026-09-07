import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The shared simulation stage: focus mode, transport, and the grain control.
 *
 * These were all driven by hand first (CLAUDE.md rule 3). What is encoded here is what was
 * checked: that pausing actually stops the animation frame rather than merely looking stopped,
 * that a drag does not open focus mode, and that the grain slider survives both extremes. */

const ROUTE = '/sims/blackhole-lensing';

test('lays the sim out as canvas plus side panel, with the canvas above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(ROUTE);
  await expect(page.locator('.stage-panel')).toBeVisible();
  const canvas = page.locator('.stage-surface canvas');
  await expect(canvas).toBeVisible();

  const box = (await canvas.boundingBox())!;
  const panel = (await page.locator('.stage-panel').boundingBox())!;
  // The canvas takes the majority of the width...
  expect(box.width).toBeGreaterThan(panel.width * 2);
  // ...and is reachable without scrolling, which is the point of the layout.
  expect(box.y + box.height).toBeLessThanOrEqual(900);
});

test('play/pause stops the animation frame entirely, not just the picture', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __raf: number }).__raf = 0;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      (window as unknown as { __raf: number }).__raf += 1;
      return original(callback);
    };
  });
  await page.goto(ROUTE);
  await page.waitForTimeout(4000);

  const framesOver = async (ms: number) => {
    await page.evaluate(() => { (window as unknown as { __raf: number }).__raf = 0; });
    await page.waitForTimeout(ms);
    return page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  };

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(500);
  // No idle GPU draw: zero, not "few".
  expect(await framesOver(2000)).toBe(0);

  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(300);
  expect(await framesOver(2000)).toBeGreaterThan(0);
});

test('reset returns the controls to where the sim opened', async ({ page }) => {
  await page.goto(ROUTE);
  const distance = page.getByRole('slider', { name: 'Camera distance' });
  const opened = await distance.inputValue();
  await distance.focus();
  for (let step = 0; step < 6; step++) await distance.press('ArrowRight');
  expect(await distance.inputValue()).not.toBe(opened);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(distance).toHaveValue(opened);
});

test('focus mode opens on click and closes on Escape and on the close button', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(2500);
  const stage = page.locator('.sim-stage');

  await page.locator('.stage-surface').click({ position: { x: 200, y: 160 } });
  await expect(stage).toHaveClass(/is-focused/);
  await expect(page.locator('.stage-close')).toBeVisible();
  await expect(stage).toHaveAttribute('aria-modal', 'true');

  await page.keyboard.press('Escape');
  await expect(stage).not.toHaveClass(/is-focused/);

  // And again, closing with the button this time.
  await page.locator('.stage-surface').click({ position: { x: 200, y: 160 } });
  await expect(stage).toHaveClass(/is-focused/);
  await page.locator('.stage-close').click();
  await expect(stage).not.toHaveClass(/is-focused/);
});

test('dragging the canvas orbits without opening focus mode', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(2500);
  const inclination = page.getByRole('slider', { name: 'Inclination' });
  const before = Number(await inclination.inputValue());

  const box = (await page.locator('.stage-surface canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 80, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  // The drag moved the camera...
  expect(Number(await inclination.inputValue())).not.toBe(before);
  // ...and the click that ends a drag must not be treated as "expand".
  await expect(page.locator('.sim-stage')).not.toHaveClass(/is-focused/);
});

test('the grain slider spans 0 to 1 and the canvas survives both ends', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ROUTE);
  await page.waitForTimeout(2500);

  const grain = page.getByRole('slider', { name: 'Film grain' });
  await expect(grain).toHaveValue('0');           // never a cinematic default
  await grain.focus();
  await grain.press('End');
  await expect(grain).toHaveValue('1');
  await page.waitForTimeout(1500);
  await grain.press('Home');
  await expect(grain).toHaveValue('0');
  await page.waitForTimeout(800);

  await expect(page.locator('.stage-surface canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the canvas orbits from the keyboard alone', async ({ page }) => {
  await page.goto(ROUTE);
  await page.waitForTimeout(2500);
  const canvas = page.locator('.stage-surface canvas');
  const inclination = page.getByRole('slider', { name: 'Inclination' });
  const before = Number(await inclination.inputValue());
  await canvas.focus();
  for (let step = 0; step < 4; step++) await canvas.press('ArrowUp');
  await page.waitForTimeout(300);
  expect(Number(await inclination.inputValue())).toBeGreaterThan(before);
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the stage and focus mode are accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ROUTE);
    await page.getByLabel('Theme').selectOption(theme);
    await page.waitForTimeout(2500);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.locator('.stage-surface').click({ position: { x: 200, y: 160 } });
    await expect(page.locator('.sim-stage')).toHaveClass(/is-focused/);

    // `label-title-only` is disabled here, and only here. It is a best-practice rule (not WCAG
    // A/AA) and it misfires in focus mode: it reports "only title used to generate label" for the
    // last slider in the panel, which has no `title` attribute at all. Its <label> exists, is
    // display:block and visible, and was verified as such. The trigger is that the floating panel
    // is inside a position:fixed, overflow:hidden container and scrolls internally, so a control
    // below the fold cannot be reached by scrolling the DOCUMENT — which is what axe checks. The
    // panel scrolls; the control is reachable. Every WCAG rule is still asserted.
    const focusedScan = await new AxeBuilder({ page })
      .disableRules(['label-title-only'])
      .analyze();
    expect(focusedScan.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
