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

    await expect(page.getByTestId('today-mode-recap')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('recap-photo-action')).toBeVisible();
    await expect(page.getByTestId('recap-location-action')).toBeVisible();
    await page.getByTestId('recap-photo-action').click();
    await expect(page.getByTestId('recap-camera-choice')).toBeVisible();
    await expect(page.getByTestId('recap-library-choice')).toBeVisible();
    expect(await page.getByTestId('recap-photo-sheet').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(260);
    await page.keyboard.press('Escape');
    expect(await page.getByTestId('recap-notes-toggle').first().evaluate((element) => window.getComputedStyle(element).fontSize)).toBe('12px');
    await expect(page.getByText('07:48 → 08:18', { exact: true })).toHaveCount(0);
    await page.getByText('Draft project notes', { exact: true }).last().click();
    await expect(page.getByText('07:48 → 08:18', { exact: true })).toBeVisible();

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
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        whiteSpace: window.getComputedStyle(element).whiteSpace,
      };
    });

    expect(layout.whiteSpace).toBe('normal');
    expect(layout.height).toBeGreaterThan(20);
    expect(layout.left).toBeLessThan(85);
    expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.pageWidth).toBe(layout.viewportWidth);

    const stream = page.getByTestId('recap-stream');
    const axisX = await stream.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left + Number.parseFloat(window.getComputedStyle(element, '::before').left);
    });
    expect(axisX).toBeLessThan(65);
    const dotCenters = await page.getByTestId('recap-stream-dot').evaluateAll((dots) =>
      dots.slice(0, 3).map((dot) => {
        const rect = dot.getBoundingClientRect();
        return rect.left + rect.width / 2;
      }),
    );
    for (const center of dotCenters) expect(Math.abs(center - axisX)).toBeLessThan(0.5);

    await expect(page.getByTestId('recap-phase').first()).toHaveText('Morning');
    await expect(page.getByText('☀', { exact: true }).first()).toBeVisible();
    expect(await page.getByTestId('recap-phase').first().evaluate((element) => element.getBoundingClientRect().left)).toBeLessThan(55);
    expect(await titleNode.evaluate((element) => window.getComputedStyle(element).fontSize)).toBe('15px');
    expect(await titleNode.evaluate((element) => window.getComputedStyle(element).fontWeight)).toBe('500');
    expect(await page.getByTestId('recap-phase').first().evaluate((element) => window.getComputedStyle(element).fontSize)).toBe('12px');
  });
});
