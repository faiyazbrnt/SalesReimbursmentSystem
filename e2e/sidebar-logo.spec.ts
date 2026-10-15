import { test, expect } from '@playwright/test';

test.describe('Sidebar Logo Toggle & Responsive Behavior', () => {
  test('displays full logo when expanded and Saturn icon when collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?role=approver');

    const aside = page.locator('aside');
    await expect(aside).toBeVisible();

    const fullLogo = aside.locator('img[alt="Microgenesis"]').last();
    const saturnIcon = aside.locator('img[alt="Microgenesis"]').first();

    // 1. In expanded state: full logo should be visible
    await expect(fullLogo).toBeVisible();

    // 2. Click collapse toggle button
    const collapseButton = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(collapseButton).toBeVisible();
    await collapseButton.click();

    // 3. In collapsed state: Saturn icon should be visible
    await expect(saturnIcon).toBeVisible();
    const expandButton = page.getByRole('button', { name: 'Expand sidebar' });
    await expect(expandButton).toBeVisible();

    // Verify Saturn icon dimensions and exact vertical center alignment (header height = 64px, center = 32px)
    const iconBox = await saturnIcon.boundingBox();
    expect(iconBox).not.toBeNull();
    expect(iconBox!.width).toBe(48);
    expect(iconBox!.height).toBe(48);
    expect(iconBox!.y + iconBox!.height / 2).toBe(32);

    // 4. Click expand toggle button to restore
    await expandButton.click();
    await expect(fullLogo).toBeVisible();
  });

  test('handles narrow mobile viewport properly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/?role=approver');

    // On mobile, the hamburger menu is visible
    const menuButton = page.getByRole('button', { name: 'Open main navigation' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // When drawer opens, full logo is visible in sidebar drawer
    const aside = page.locator('aside');
    await expect(aside).toBeVisible();
    const fullLogo = aside.locator('img[alt="Microgenesis"]').last();
    await expect(fullLogo).toBeVisible();

    // Mobile close button is present
    const closeButton = page.getByRole('button', { name: 'Close sidebar' });
    await expect(closeButton).toBeVisible();
    await closeButton.click();
  });

  test('persists collapsed state across page reloads via cookie', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?role=approver');

    // Collapse the sidebar
    const collapseButton = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(collapseButton).toBeVisible();
    await collapseButton.click();

    // Verify collapsed state
    const expandButton = page.getByRole('button', { name: 'Expand sidebar' });
    await expect(expandButton).toBeVisible();

    // Verify cookie exists
    const cookies = await page.context().cookies();
    const sidebarCookie = cookies.find(c => c.name === 'sidebar_collapsed');
    expect(sidebarCookie).toBeDefined();
    expect(sidebarCookie!.value).toBe('true');

    // Reload page and check that collapsed state is maintained
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    const saturnIcon = page.locator('aside img[alt="Microgenesis"]').first();
    await expect(saturnIcon).toBeVisible();

    // Expand sidebar again and verify cookie updates
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();

    const updatedCookies = await page.context().cookies();
    const updatedCookie = updatedCookies.find(c => c.name === 'sidebar_collapsed');
    expect(updatedCookie!.value).toBe('false');
  });

  test('handles rapid toggle interruptions smoothly without crashing', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?role=approver');

    const aside = page.locator('aside');
    await expect(aside).toBeVisible();

    // Rapidly toggle multiple times to simulate user interrupting transitions
    for (let i = 0; i < 6; i++) {
      const toggle = aside.locator('button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"]').first();
      await toggle.click();
      await page.waitForTimeout(50); // Click mid-transition
    }

    // Give animation time to settle and verify valid state
    await page.waitForTimeout(400);
    const finalToggle = aside.locator('button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"]').first();
    await expect(finalToggle).toBeVisible();
    await expect(aside).toBeVisible();
  });

  test('retains collapsed state during route navigation and updates active route', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?role=approver');

    // Collapse sidebar
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();

    // Navigate to Expenses & Receipts by clicking nav icon link
    const receiptsLink = page.locator('aside nav a[href="/approver/receipts"]');
    await expect(receiptsLink).toBeVisible();
    await receiptsLink.click();

    // Confirm URL uses the current role prefix
    await expect(page).toHaveURL(/.*receipts/);

    // Sidebar should still be collapsed
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    const saturnIcon = page.locator('aside img[alt="Microgenesis"]').first();
    await expect(saturnIcon).toBeVisible();
  });

  test('adapts layout correctly at 768px tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/?role=approver');

    // At 768px (< 1024px lg breakpoint), hamburger menu is active
    const menuButton = page.getByRole('button', { name: 'Open main navigation' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Drawer opens with full logo
    const aside = page.locator('aside');
    await expect(aside).toBeVisible();
    const fullLogo = aside.locator('img[alt="Microgenesis"]').last();
    await expect(fullLogo).toBeVisible();
  });
});
