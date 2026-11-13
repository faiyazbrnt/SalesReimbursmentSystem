import { expect, test, type Page } from '@playwright/test';

const personas = [
  { slug: 'requestor', id: 'u1', name: 'Mia Fernandez', role: 'Requestor', label: 'Requestor' },
  { slug: 'approver', id: 'u2', name: 'Noah Villanueva', role: 'Approver', label: 'Approver' },
  { slug: 'custodian', id: 'u3', name: 'Carol Ramos', role: 'Custodian', label: 'Custodian' },
  { slug: 'finance', id: 'u22', name: 'Sofia Lim', role: 'Finance', label: 'Finance' },
  { slug: 'admin', id: 'u4', name: 'Dave Lopez', role: 'Admin', label: 'Administrator' },
];

const demoUsers = personas.map(persona => ({
  id: persona.id,
  name: persona.name,
  email: `${persona.slug}@example.com`,
  role: persona.role,
  department: 'Test',
  job_title: 'Test role',
}));

async function mockApis(page: Page) {
  await page.route('**/api/**', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === '/api/auth/config') {
      await route.fulfill({ json: {
        provider: 'microsoft', mode: 'demo', demoModeEnabled: true, demoLoginEnabled: true,
        microsoft: { configured: false, loginUrl: '/api/auth/microsoft/start' },
      } });
      return;
    }
    if (requestUrl.pathname === '/api/demo-users') {
      await route.fulfill({ json: demoUsers });
      return;
    }
    if (requestUrl.pathname === '/api/workspace') {
      const currentUserId = route.request().headers()['x-user-id'];
      const currentUser = demoUsers.find(user => user.id === currentUserId) || demoUsers[0];
      await route.fulfill({ json: {
        me: currentUser,
        users: demoUsers,
        claims: [], advances: [], liquidations: [], masterAll: {}, fieldDefinitions: [],
        moms: [], reviewMeetings: [], companies: [], outbox: [], support: [], delegations: [],
        settings: {}, authConfig: { demoModeEnabled: true },
      } });
      return;
    }
    if (requestUrl.pathname === '/api/analytics/summary') {
      await route.fulfill({ json: {
        metrics: {
          recordCount: 0, lineItemCount: 0, claimedAmount: 0, approvedAmount: 0,
          paidAmount: 0, outstandingAmount: 0, avgApprovalTurnaroundDays: null,
        },
        breakdowns: {
          byStatus: [], byType: [], byRequestor: [], byDepartment: [], byCategory: [],
        },
        dimensions: {
          types: [], statuses: [], departments: [], requestors: [], clients: [],
          categories: [], paymentMethods: [],
        },
        records: [],
      } });
      return;
    }
    await route.fulfill({ json: [] });
  });
}

async function loginAs(page: Page, persona: typeof personas[number]) {
  await page.getByRole('button', { name: /Demo access/ }).click();
  await page.getByRole('button', { name: new RegExp(persona.name) }).click();
  await page.getByRole('button', { name: `Launch demo as ${persona.label}` }).click();
  await expect(page).toHaveURL(new RegExp(`/${persona.slug}/?$`));
}

for (const persona of personas) {
  test(`${persona.role} login lands on its lowercase role dashboard and prefixes sidebar links`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    await mockApis(page);
    await page.goto('/claims?status=Draft');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    await loginAs(page, persona);

    const links = page.locator('aside nav a');
    await expect(links.first()).toBeVisible();
    const count = await links.count();
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index);
      const href = await link.getAttribute('href');
      expect(href).toMatch(new RegExp(`^/${persona.slug}(?:/|$)`));
      await link.click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(href);
      await expect(page.getByText('This page is not available for your role')).toHaveCount(0);
    }
    expect(pageErrors).toEqual([]);
  });
}

for (const persona of personas) {
  test(`legacy /claims is scoped to the ${persona.role} session with its query intact`, async ({ page }) => {
    await mockApis(page);
    await page.addInitScript(({ id }) => {
      sessionStorage.setItem('hasLoggedIn', 'true');
      sessionStorage.setItem('mockUserId', id);
    }, { id: persona.id });
    await page.goto('/claims?status=Draft');

    const expectedPath = ['requestor', 'approver', 'finance'].includes(persona.slug)
      ? `/${persona.slug}/claims`
      : `/${persona.slug}`;
    await expect(page).toHaveURL(new RegExp(`${expectedPath.replaceAll('/', '\\/')}\\?status=Draft$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${expectedPath.replaceAll('/', '\\/')}\\?status=Draft$`));
  });
}

test('cross-role paths map to the signed-in role or its dashboard, and browser back restores deep links', async ({ page }) => {
  await mockApis(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('hasLoggedIn', 'true');
    sessionStorage.setItem('mockUserId', 'u1');
  });
  await page.goto('/approver/claims?status=Pending');
  await expect(page).toHaveURL(/\/requestor\/claims\?status=Pending$/);
  await page.reload();
  await expect(page).toHaveURL(/\/requestor\/claims\?status=Pending$/);
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/requestor\/?$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/requestor\/claims\?status=Pending$/);
  await expect(page.getByText('This page is not available for your role')).toHaveCount(0);
  await page.goto('/approver/approvals?tab=mine');
  await expect(page).toHaveURL(/\/requestor\?tab=mine$/);
  await expect(page.getByText('This page is not available for your role')).toHaveCount(0);
});

test('signing out and back in as another role clears the previous role path', async ({ page }) => {
  await mockApis(page);
  await page.goto('/');
  await loginAs(page, personas[0]);
  await page.getByRole('link', { name: 'My Requests' }).click();
  await expect(page).toHaveURL(/\/requestor\/claims$/);
  await page.getByRole('button', { name: 'Open account menu for Mia Fernandez' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await loginAs(page, personas[4]);
  await expect(page).toHaveURL(/\/admin\/?$/);
});
