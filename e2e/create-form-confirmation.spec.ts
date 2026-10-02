import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('hasLoggedIn', 'true');
    sessionStorage.setItem('mockUserId', 'u1');
  });
  // All API requests are intercepted: these checks never write to live data.
  await page.route('**/api/**', async route => {
    if (route.request().url().endsWith('/workspace')) {
      const me = { id: 'u1', name: 'Test Requestor', email: 'test@example.com', role: 'Requestor' };
      await route.fulfill({ json: { me, users: [me], masterAll: {}, settings: {}, authConfig: { demoModeEnabled: true } } });
    } else {
      await route.fulfill({ json: {} });
    }
  });
});

for (const form of [
  { name: 'minutes', path: '/moms/new', field: 'Who did you meet with?', endpoint: '/api/moms' },
  { name: 'reimbursement', path: '/claims/new?type=reimbursement', field: 'Why did you meet?', endpoint: '/api/claims' },
  { name: 'transport', path: '/claims/new?type=transport', field: 'e.g. Cafe Manila', endpoint: '/api/claims' },
]) {
  test(form.name + ': empty form leaves without prompting', async ({ page }) => {
    await page.goto(form.path);
    await expect(page.getByPlaceholder(form.field)).toBeVisible();
    await page.getByRole('link', { name: /Dashboard$/ }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test(form.name + ': Back preserves input, failed save stays, successful save leaves', async ({ page }) => {
    await page.goto(form.path);
    await page.getByPlaceholder(form.field).fill('Partial draft');
    await page.getByRole('link', { name: /Dashboard$/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const yes = dialog.getByRole('button', { name: 'Yes', exact: true });
    const save = dialog.getByRole('button', { name: 'Save as Draft', exact: true });
    const back = dialog.getByRole('button', { name: 'Back', exact: true });
    expect((await yes.boundingBox())!.x).toBeLessThan((await save.boundingBox())!.x);
    expect((await save.boundingBox())!.x).toBeLessThan((await back.boundingBox())!.x);
    await expect(yes).toHaveAttribute('class', await back.getAttribute('class') || '');
    await back.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByPlaceholder(form.field)).toHaveValue('Partial draft');
    await page.getByRole('link', { name: /Dashboard$/ }).click();
    await page.route('**' + form.endpoint, route => route.fulfill({ status: 500, json: { message: 'Save failed' } }));
    await save.click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog).toBeVisible();
    let payload: any;
    await page.route('**' + form.endpoint, route => {
      payload = route.request().postDataJSON();
      return route.fulfill({ json: { id: 'draft-test' } });
    });
    await save.click();
    await expect(page).toHaveURL('/');
    expect(JSON.stringify(payload)).toContain('Partial draft');
    expect(payload.is_draft ?? (payload.status === 'Draft')).toBe(true);
  });
}

test('cancel and browser Back can be rejected or confirmed', async ({ page }) => {
  await page.goto('/moms');
  await page.getByRole('button', { name: /Create Minutes/ }).click();
  await page.getByPlaceholder('Who did you meet with?').fill('Unsaved client');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByPlaceholder('Who did you meet with?')).toHaveValue('Unsaved client');
  await page.getByRole('button', { name: 'Go back to the previous page' }).click();
  await dialog.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page).toHaveURL('/moms');
});
