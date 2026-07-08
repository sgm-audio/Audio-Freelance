import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads and shows sidebar navigation', async ({ page }) => {
    await page.goto('/');

    const sidebar = page.locator('nav');
    await expect(sidebar).toBeVisible();

    await expect(sidebar.locator('a', { hasText: 'Leads' })).toBeVisible();
  });

  test('sidebar links navigate correctly', async ({ page }) => {
    await page.goto('/');

    await page.locator('nav').locator('a', { hasText: 'Leads' }).first().click();
    await expect(page).toHaveURL('/leads');
  });

  test('theme toggle exists in sidebar', async ({ page }) => {
    await page.goto('/');

    const toggle = page.locator('nav button[title="Toggle theme"]');
    await expect(toggle.first()).toBeVisible();
  });
});
