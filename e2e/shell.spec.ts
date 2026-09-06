import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: gallery, physics disclosure, keyboard and accessibility`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByLabel('Theme').selectOption(theme);
    await expect(page.getByRole('link', { name: 'When light meets a black hole' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('link', { name: 'Our method', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'The physics' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.katex')).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.reload();
    await expect(page.getByLabel('Theme')).toHaveValue(theme);
    expect(errors).toEqual([]);
  });
}

test('mobile layout, system theme, reduced motion and not-found route', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByLabel('Theme')).toHaveValue('system');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(16, 27, 36)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.goto('/not-a-simulation');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at these coordinates.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
