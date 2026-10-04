import { test, expect } from '@playwright/test';

// Smoke test for the synthetic public demo core loop. Uses only the
// backend-free /demo-app route with deterministic sample data, so it needs no
// real Supabase project (dummy VITE_* vars are injected in playwright.config).
test.describe('synthetic demo', () => {
  test('renders plan item, timeline axis, and recap evidence', async ({ page }) => {
    await page.goto('/demo-app');

    await expect(page.getByText('Public demo')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Draft project notes').first()).toBeVisible();
    await expect(page.getByText('12:00').first()).toBeVisible();
    await expect(page.getByText('focused').first()).toBeVisible();
  });

  test('exposes the add-task composer', async ({ page }) => {
    await page.goto('/demo-app');
    await expect(page.getByText('Public demo')).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByPlaceholder(/Add a task/i).or(page.getByPlaceholder(/添加任务/)),
    ).toBeVisible();
  });

  test('keeps long recap titles inside the phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto('/demo-app');
    await expect(page.getByText('Public demo')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /Recap/ }).last().click();
    await page.getByText('Draft project notes', { exact: true }).last().click();

    const title = 'Check for career fair and cancel handshake registration before the deadline';
    const titleInput = page.getByRole('textbox').last();
    await titleInput.fill(title);
    await titleInput.press('Enter');

    const titleNode = page.getByText(title, { exact: true });
    await expect(titleNode).toBeVisible();
    const layout = await titleNode.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        right: rect.right,
        viewportWidth: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        whiteSpace: window.getComputedStyle(element).whiteSpace,
      };
    });

    expect(layout.whiteSpace).toBe('normal');
    expect(layout.height).toBeGreaterThan(20);
    expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.pageWidth).toBe(layout.viewportWidth);
  });
});
