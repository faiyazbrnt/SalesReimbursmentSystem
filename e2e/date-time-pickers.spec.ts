import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Manila' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-30T05:07:00Z'));
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
        claims: [{ id: 'test-claim', requestor_id: 'u1', current_approver_id: 'u2', claim_number: 'TEST-001', status: 'Pending Approval', created_at: '2026-09-30T00:00:00Z', total_amount: 100, expenses: [] }],
        fieldDefinitions: [{ id: 'custom-date', entity: 'mom', key: 'followup_date', label: 'Follow-up date', input_type: 'date', active: true, display_order: 0 }],
      } });
    } else {
      // Never send a decision or other write to live data.
      await route.fulfill({ json: {} });
    }
  });
});

for (const path of ['/moms/new', '/claims/new?type=reimbursement']) {
  test(path + ': jump month/year, leap-day selection and manual entry', async ({ page }) => {
    await page.goto(path);
    const field = page.locator('input[type="date"]').first();
    await page.getByRole('button', { name: 'Choose date', exact: true }).first().click();
    const picker = page.getByRole('group', { name: 'Date picker', exact: true });
    await picker.getByRole('spinbutton', { name: 'Year', exact: true }).fill('2024');
    await picker.getByRole('combobox', { name: 'Month', exact: true }).selectOption('1');
    await picker.getByRole('button', { name: 'February 29, 2024', exact: true }).click();
    await expect(field).toHaveValue('2024-02-29');
    await expect(picker).toHaveCount(0);
    await field.fill('2025-12-31');
    await page.getByRole('button', { name: 'Choose date', exact: true }).first().click();
    await expect(picker.getByRole('combobox', { name: 'Month', exact: true })).toHaveValue('11');
    await picker.getByRole('button', { name: 'Next month', exact: true }).click();
    await expect(picker.getByRole('spinbutton', { name: 'Year', exact: true })).toHaveValue('2026');
    await picker.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(field).toHaveValue('');
    await page.getByRole('button', { name: 'Choose date', exact: true }).last().click();
    await page.getByRole('group', { name: 'Date picker', exact: true }).getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('#dynamic-mom-followup_date')).toHaveValue('2026-09-30');
  });
}

test('purchase date picker respects the maximum date', async ({ page }) => {
  await page.goto('/claims/new?type=transport');
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  const picker = page.getByRole('group', { name: 'Date picker', exact: true });
  await picker.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'October 1, 2026', exact: true })).toBeDisabled();
  await picker.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('#expense-date-0')).toHaveValue('2026-09-30');
});

for (const width of [375, 1280]) {
  test('Reject Claim: current time, manual AM/PM and layout at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/claims/test-claim');
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject Claim', exact: true });
    const initialHeight = await dialog.evaluate(element => element.getBoundingClientRect().height);
    const initialScrollHeight = await dialog.evaluate(element => element.scrollHeight);
    await dialog.locator('input[type="date"]').click();
    const datePicker = dialog.getByRole('group', { name: 'Date picker', exact: true });
    await expect(datePicker).toBeVisible();
    expect(await dialog.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 1);
    expect(await dialog.evaluate(element => element.scrollHeight)).toBe(initialScrollHeight);
    const dateBox = (await datePicker.boundingBox())!;
    expect(dateBox.x).toBeGreaterThanOrEqual(8);
    expect(dateBox.x + dateBox.width).toBeLessThanOrEqual(width - 8);
    expect(dateBox.y).toBeGreaterThanOrEqual(8);
    expect(dateBox.y + dateBox.height).toBeLessThanOrEqual(892);
    await datePicker.getByRole('spinbutton', { name: 'Year', exact: true }).fill('2028');
    await datePicker.getByRole('combobox', { name: 'Month', exact: true }).selectOption('1');
    await datePicker.getByRole('button', { name: 'February 29, 2028', exact: true }).click();
    await dialog.getByRole('button', { name: 'Choose time', exact: true }).click();
    const timePicker = dialog.getByRole('group', { name: 'Time picker', exact: true });
    await timePicker.getByRole('button', { name: 'Current Time', exact: true }).click();
    await expect(dialog.locator('input[type="time"]')).toHaveValue('13:07');
    await expect(timePicker).toHaveCount(0);
    await dialog.locator('input[type="time"]').click();
    await expect(timePicker.getByRole('combobox', { name: 'Hour', exact: true })).toHaveValue('1');
    await expect(timePicker.getByRole('combobox', { name: 'Minute', exact: true })).toHaveValue('07');
    await expect(timePicker.getByRole('combobox', { name: 'AM/PM', exact: true })).toHaveValue('PM');
    await timePicker.getByRole('combobox', { name: 'Hour', exact: true }).selectOption('12');
    await timePicker.getByRole('combobox', { name: 'Minute', exact: true }).selectOption('00');
    await timePicker.getByRole('button', { name: 'Set Time', exact: true }).click();
    await expect(timePicker).toHaveCount(0);
    await expect(dialog.locator('input[type="time"]')).toHaveValue('12:00');
    await dialog.getByRole('button', { name: 'Choose time', exact: true }).click();
    await timePicker.getByRole('combobox', { name: 'AM/PM', exact: true }).selectOption('AM');
    await timePicker.getByRole('button', { name: 'Set Time', exact: true }).click();
    await expect(timePicker).toHaveCount(0);
    await expect(dialog.locator('input[type="time"]')).toHaveValue('00:00');
    await dialog.getByRole('button', { name: 'Choose time', exact: true }).click();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const panel = (await timePicker.boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(8);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width - 8);
    expect(panel.y).toBeGreaterThanOrEqual(8);
    expect(panel.y + panel.height).toBeLessThanOrEqual(892);
    expect(await dialog.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 1);
    expect(await dialog.evaluate(element => element.scrollHeight)).toBe(initialScrollHeight);
    await page.keyboard.press('Escape');
    await expect(timePicker).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Choose time', exact: true }).click();
    await dialog.getByPlaceholder('Please explain why this claim is rejected...').click();
    await expect(timePicker).toHaveCount(0);
    await dialog.getByPlaceholder('Please explain why this claim is rejected...').fill('Test reason');
    const request = page.waitForRequest(request => request.url().endsWith('/api/claims/test-claim/approve'));
    await dialog.getByRole('button', { name: 'Reject Claim', exact: true }).click();
    expect((await request).postDataJSON()).toMatchObject({ review_meeting_date: '2028-02-29', review_meeting_time: '00:00' });
  });
}


test('popup remains within a small viewport after resize and scroll without moving the form', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 500 });
  await page.goto('/claims/new?type=transport');
  const field = page.locator('#expense-date-0');
  await field.scrollIntoViewIfNeeded();
  const before = await page.locator('main').evaluate(element => element.scrollHeight);
  await field.click();
  const picker = page.getByRole('group', { name: 'Date picker', exact: true });
  await expect(picker).toBeVisible();
  expect(await page.locator('main').evaluate(element => element.scrollHeight)).toBe(before);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 500 });
    await expect.poll(async () => {
      const box = (await picker.boundingBox())!;
      return box.x >= 8 && box.x + box.width <= width - 8 && box.y >= 8 && box.y + box.height <= 492;
    }).toBe(true);
  }
  await page.evaluate(() => window.scrollBy(0, 30));
  await expect.poll(async () => {
    const box = (await picker.boundingBox())!;
    return box.y >= 8 && box.y + box.height <= 492;
  }).toBe(true);
  await picker.getByRole('button', { name: 'Next month', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(field).toBeFocused();
});
