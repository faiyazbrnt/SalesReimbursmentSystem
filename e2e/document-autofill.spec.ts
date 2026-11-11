import { expect, test, type Page } from '@playwright/test';

// Allows local verification with an installed Chromium browser without changing
// the project's browser choice for its other E2E suites.
test.use({ channel: undefined, ...(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE } } : {}) });

const attachment = { name: 'fictional-mom.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fictional fixture') };
const purpose = (page: Page) => page.locator('label').filter({ hasText: /^Purpose of Meeting/ }).locator('..').locator('input');

async function capability(page: Page, enabled: boolean, post?: (route: import('@playwright/test').Route) => Promise<void>) {
  await page.route('**/api/moms/extract', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { enabled } })
    : post ? post(route) : route.fulfill({ status: 503, json: { error: 'Document autofill is unavailable until Azure OpenAI is configured.' } }));
}

test('manual meeting entry and attachment save work while Azure is unavailable', async ({ page }) => {
  let analyses = 0;
  let uploaded = false;
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/moms/extract', async route => {
    if (route.request().method() === 'POST') analyses++;
    await route.continue();
  });
  await page.route('**/api/upload', async route => { uploaded = route.request().postDataBuffer()!.includes(Buffer.from(attachment.name)); await route.fulfill({ json: { url: '/uploads/fictional-mom.pdf' } }); });
  await page.route('**/api/moms', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { id: 'ui-test-only' } });
  });
  await page.goto('/moms/new?role=requestor');
  await expect(page.getByText('Document autofill is unavailable until Azure OpenAI is configured. Attach your file and enter the details manually.')).toBeVisible();
  await page.locator('#mom-attachment').setInputFiles(attachment);
  await page.locator('#mom-client').selectOption({ index: 1 });
  await purpose(page).fill('Manual fictional client review');
  await page.getByRole('button', { name: /Save Draft/ }).click();
  await expect.poll(() => saved?.purpose).toBe('Manual fictional client review');
  expect(saved).toMatchObject({ file_url: '/uploads/fictional-mom.pdf', file_name: attachment.name, minutes_source: 'Uploaded', status: 'Draft', cc_client: false });
  expect(uploaded).toBe(true);
  expect(analyses).toBe(0);
});

test('claim manual entry keeps the required attachment and blank official template without Azure', async ({ page }) => {
  let saved: Record<string, any> | undefined;
  await page.route('**/api/upload', route => route.fulfill({ json: { url: '/uploads/fictional-claim-mom.pdf' } }));
  await page.route('**/api/claims', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    saved = route.request().postDataJSON(); await route.fulfill({ json: { id: 'ui-test-only' } });
  });
  await page.goto('/claims/new?type=reimbursement&role=requestor');
  await expect(page.getByRole('region', { name: 'Document autofill' })).toContainText('unavailable until Azure OpenAI is configured');
  await page.locator('#mom-attachment').setInputFiles(attachment);
  await page.locator('#claim-mom-client').selectOption({ index: 1 });
  await purpose(page).fill('Manual claim review');
  await expect(page.locator('#mom-template')).toHaveValue('');
  await expect(page.getByText('MOM template pending — please provide the official template.')).toBeVisible();
  await page.getByRole('button', { name: /Save Draft/ }).click();
  await expect.poll(() => saved?.mom?.purpose).toBe('Manual claim review');
  expect(saved?.mom).toMatchObject({ minutes_source: 'Uploaded', file_url: '/uploads/fictional-claim-mom.pdf', cc_client: false, discussion: '', action_items: '' });
});

test('reviews editable suggestions without overwriting typed values or enabling notifications', async ({ page }) => {
  await capability(page, true, route => route.fulfill({ json: {
    fields: [
      { key: 'purpose', label: 'Purpose of meeting / agreement', inputType: 'text', value: 'Extracted purpose', evidence: 'Extracted purpose in MOM' },
      { key: 'location', label: 'Location', inputType: 'text', value: 'Client office', evidence: 'Client office' },
      { key: 'clientEmails', label: 'Client emails (comma separated)', inputType: 'text', value: 'fictional@example.com', evidence: 'fictional@example.com' },
    ], expenses: [], warnings: [],
  } }));
  await page.goto('/moms/new?role=requestor');
  await purpose(page).fill('Typed purpose');
  await page.locator('#mom-attachment').setInputFiles(attachment);
  await expect(page.getByLabel('Apply Purpose of meeting / agreement')).not.toBeChecked();
  await expect(page.getByLabel('Apply Location', { exact: true })).toBeChecked();
  const clientCopy = page.getByRole('checkbox', { name: /Send a copy of these minutes to the client/ });
  await clientCopy.check();
  await expect(page.getByLabel('Apply Location', { exact: true })).toBeVisible();
  await clientCopy.uncheck();
  await page.getByLabel('Suggested Location', { exact: true }).fill('Reviewed client office');
  await page.getByRole('button', { name: 'Apply selected suggestions' }).click();
  await expect(purpose(page)).toHaveValue('Typed purpose');
  await expect(page.getByText('Location of Meeting', { exact: true }).locator('..').locator('input')).toHaveValue('Reviewed client office');
  await expect(page.getByRole('checkbox', { name: /Send a copy of these minutes to the client/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Apply selected suggestions' })).toHaveCount(0);
});

test('claim review imports expenses once, preserves missing payment, and survives wizard navigation', async ({ page }) => {
  let analyses = 0;
  await capability(page, true, async route => { analyses++; await route.fulfill({ json: {
    fields: [], expenses: [{ values: { vendor: 'Fictional parking vendor', category: 'Others', otherCategory: 'Parking', amount: '425', tinNumber: '000-000-000', expenseDate: new Date().toISOString().slice(0, 10) }, evidence: 'Parking PHP 425', warnings: [] }], warnings: [],
  } }); });
  await page.goto('/claims/new?type=reimbursement&role=requestor');
  await page.locator('#claim-mom-client').selectOption({ index: 1 });
  await purpose(page).fill('Expense import review');
  await page.locator('label').filter({ hasText: /^Date of Meeting/ }).locator('..').locator('input[type=date]').fill(new Date().toISOString().slice(0, 10));
  await page.locator('#mom-attachment').setInputFiles(attachment);
  await page.getByRole('button', { name: 'Apply selected suggestions' }).click();
  await page.getByRole('button', { name: /Next Step/ }).click();
  await expect(page.locator('#expense-vendor-0')).toHaveValue('Fictional parking vendor');
  await expect(page.locator('#expense-payment-method-0')).toHaveValue('');
  await expect(page.getByText('Expense Item #1', { exact: true })).toBeVisible();
  await expect(page.getByText('Expense Item #2', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Back$/ }).click();
  await expect(page.getByText(/Selected suggestions applied/)).toBeVisible();
  expect(analyses).toBe(1);
});

test('every new manual edit requires fresh replacement opt-in', async ({ page }) => {
  await capability(page, true, route => route.fulfill({ json: { fields: [
    { key: 'purpose', label: 'Purpose', inputType: 'text', value: 'Extracted purpose', evidence: 'Extracted purpose' },
  ], expenses: [], warnings: [] } }));
  await page.goto('/moms/new?role=requestor');
  await page.locator('#mom-attachment').setInputFiles(attachment);
  const replacement = page.getByLabel('Apply Purpose', { exact: true });
  await expect(replacement).toBeChecked();
  await purpose(page).fill('First manual edit');
  await expect(replacement).not.toBeChecked();
  await replacement.check();
  await purpose(page).fill('Second manual edit');
  await expect(replacement).not.toBeChecked();
});

test('provider failure and cancelled stale results preserve typed form data', async ({ page }) => {
  let requestNumber = 0;
  let finishStale: () => void;
  const staleFinished = new Promise<void>(resolve => { finishStale = resolve; });
  await capability(page, true, async route => {
    requestNumber++;
    if (requestNumber === 1) return route.fulfill({ status: 502, json: { error: 'Document analysis unavailable. Retry or enter manually.' } });
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ json: { fields: [{ key: 'purpose', label: 'Purpose', inputType: 'text', value: 'Stale value', evidence: 'Old file' }], expenses: [], warnings: [] } }).catch(() => {});
    finishStale();
  });
  await page.goto('/moms/new?role=requestor');
  await purpose(page).fill('Keep my purpose');
  await page.locator('#mom-attachment').setInputFiles(attachment);
  await expect(page.getByRole('region', { name: 'Document autofill' }).getByRole('alert')).toContainText('Document analysis unavailable');
  await page.getByRole('button', { name: 'Retry analysis' }).click();
  await expect.poll(() => requestNumber).toBe(2);
  await page.getByRole('button', { name: 'Remove attachment' }).click();
  await staleFinished;
  await expect(page.getByText('Choose an attachment above to start.')).toBeVisible();
  await expect(purpose(page)).toHaveValue('Keep my purpose');
  await expect(page.getByRole('button', { name: 'Apply selected suggestions' })).toHaveCount(0);
});

for (const width of [390, 768, 1280]) {
  test(`review remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await capability(page, true, route => route.fulfill({ json: { fields: [{ key: 'location', label: 'Location', inputType: 'text', value: 'Long fictional client office location '.repeat(10), evidence: 'Supporting document excerpt '.repeat(20) }], expenses: [], warnings: ['Review extracted details before applying.'] } }));
    await page.goto('/moms/new?role=requestor');
    await page.locator('#mom-attachment').setInputFiles(attachment);
    await expect(page.getByRole('button', { name: 'Apply selected suggestions' })).toBeVisible();
    const panel = page.getByRole('region', { name: 'Document autofill' });
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await panel.screenshot({ path: `test-results/document-autofill-${width}.png` });
  });
}
