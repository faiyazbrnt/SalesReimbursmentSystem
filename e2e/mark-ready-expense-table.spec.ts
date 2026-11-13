import { expect, test } from '@playwright/test';

async function openMarkReadyModal(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/custodian/disbursements?role=custodian');
  await page.getByRole('button', { name: 'Review' }).first().click();
  await expect(page.getByRole('heading', { name: 'Review & Mark Ready' })).toBeVisible();
}

test.describe('Review & Mark Ready expense table', () => {
  test('keeps headers intact at desktop widths', async ({ page }) => {
    await openMarkReadyModal(page, 1280);

    const dialog = page.getByRole('dialog');
    const headers = dialog.getByRole('columnheader');
    await expect(headers).toHaveText(['Date', 'Category / Vendor', 'Amount', 'Receipt']);
    for (let index = 0; index < await headers.count(); index += 1) {
      await expect(headers.nth(index)).toHaveCSS('white-space', 'nowrap');
    }

    const scrollRegion = dialog.getByRole('table').locator('..');
    const hasHorizontalOverflow = await scrollRegion.evaluate(element => element.scrollWidth > element.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('preserves header words when a narrower effective viewport needs scrolling', async ({ page }) => {
    await openMarkReadyModal(page, 640);

    const dialog = page.getByRole('dialog');
    const headers = dialog.getByRole('columnheader');
    for (let index = 0; index < await headers.count(); index += 1) {
      await expect(headers.nth(index)).toHaveCSS('white-space', 'nowrap');
    }

    const scrollRegion = dialog.getByRole('table').locator('..');
    const isScrollable = await scrollRegion.evaluate(element => element.scrollWidth > element.clientWidth);
    expect(isScrollable).toBe(true);
  });
});
