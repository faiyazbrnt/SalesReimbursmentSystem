import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'America/Los_Angeles' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
  await page.addInitScript(() => {
    sessionStorage.setItem('hasLoggedIn', 'true');
    sessionStorage.setItem('mockUserId', 'u2');
  });
  await page.route('**/api/**', async route => {
    const me = { id: 'u2', name: 'Test Approver', email: 'approver@example.com', role: 'Approver' };
    const requestor = { id: 'u1', name: 'Test Requestor', email: 'requestor@example.com', role: 'Requestor', reports_to: 'u2' };
    if (route.request().url().endsWith('/workspace')) {
      await route.fulfill({ json: {
        me, users: [me, requestor], masterAll: {}, settings: {}, authConfig: { demoModeEnabled: true },
        claims: [1, 2].map(id => ({ id: 'claim-' + id, requestor_id: 'u1', current_approver_id: 'u2', claim_number: 'REIM-00' + id, status: 'Pending Approval', created_at: '2026-09-15T00:00:00Z', total_amount: 100, expenses: [] })),
        reviewMeetings: [1, 2].map(id => ({ id: 'review-' + id, claim_id: 'claim-' + id, claim_number: 'REIM-00' + id, meeting_date: '2026-09-15', meeting_time: id === 1 ? '09:30' : '14:15', approver_id: 'u2', requestor_id: 'u1', requestor_name: 'Test Requestor', status: 'PendingConfirmation' })),
        moms: [{ id: 'meeting-1', meeting_date: '2026-09-15', client_name: 'Example Client', status: 'Completed', purpose: 'Quarterly review' }],
      } });
    } else {
      await route.fulfill({ json: {} });
    }
  });
});

for (const width of [375, 1280]) {
  test('date popup shows every entry without resizing the calendar at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/calendar');
    const day = page.getByRole('button', { name: 'September 15, 2026: 3 scheduled entries', exact: true });
    await expect(day).toBeVisible();
    const height = await page.locator('main').evaluate(element => element.scrollHeight);
    const box = (await day.boundingBox())!;
    await day.click();
    const popup = page.getByRole('dialog', { name: 'September 15, 2026', exact: true });
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('link')).toHaveCount(3);
    const first = popup.getByRole('link', { name: /REIM-001/ });
    await expect(first).toContainText('Test Requestor');
    await expect(first).toContainText('09:30');
    await expect(first).toContainText('Pending Approval');
    await expect(popup.getByRole('link', { name: /REIM-002/ })).toContainText('14:15');
    await expect(popup.getByRole('link', { name: /meeting-1/ })).toContainText('Example Client');
    await expect(popup.getByRole('link', { name: /meeting-1/ })).toContainText('Time not set');
    expect(await page.locator('main').evaluate(element => element.scrollHeight)).toBe(height);
    expect((await day.boundingBox())!.height).toBeCloseTo(box.height, 1);
    const popupBox = (await popup.boundingBox())!;
    expect(popupBox.x).toBeGreaterThanOrEqual(0);
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(width);
    expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(900);
    await popup.getByRole('button', { name: 'Close scheduled entries' }).click();
    await expect(popup).toHaveCount(0);
    await expect(day).toBeFocused();
    await day.click();
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await day.click();
    await page.mouse.click(4, 4);
    await expect(popup).toHaveCount(0);
    await day.click();
    await popup.getByRole('button', { name: 'Review meeting', exact: true }).first().click();
    const review = page.getByRole('dialog', { name: 'Review Meeting', exact: true });
    await expect(review).toBeVisible();
    await expect(review.getByRole('button', { name: /Confirm$/ })).toBeVisible();
    await review.getByRole('button', { name: 'Close review meeting details' }).click();
    await day.click();
    await first.click();
    await expect(page).toHaveURL('/claims/claim-1');
    await expect(page.getByText('REIM-001').first()).toBeVisible();
  });
}

test('empty dates have no hover effect or popup; standalone activities open their details', async ({ page }) => {
  await page.goto('/calendar');
  const empty = page.getByLabel('September 14, 2026: No scheduled reimbursements', { exact: true });
  await expect(empty).not.toHaveClass(/hover:/);
  await empty.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'September 15, 2026: 3 scheduled entries', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: /meeting-1/ }).click();
  await expect(page).toHaveURL('/moms/meeting-1');
});
