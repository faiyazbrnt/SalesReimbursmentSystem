import { describe, expect, it } from 'vitest';
import { dispatchTestRequest } from './testRouter';
import { state } from '../src/server/state';
import { fromServerExpense } from '../src/lib/api/adapters';
import { EXPENSE_CATEGORIES } from '../src/lib/expenseCategories';
import { getTodayIsoDate } from '../src/features/claims/schema';

const post = (body: unknown) => dispatchTestRequest('/api/claims', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': 'u1' }, body: JSON.stringify(body) });

describe('Requestor Phase 1 records', () => {
  it('preserves uploaded MOM, all receipts, vendor TIN, and custom category under the authenticated requestor', async () => {
    const response = await post({ requestor_id: 'u2', claim_type: 'Reimbursement', mom: { client: state.companies[0]?.name || 'Client', purpose: 'Review', meeting_date: getTodayIsoDate(), minutes_source: 'Uploaded', file_url: '/uploads/phase1-mom.pdf', file_name: 'meeting.pdf' }, line_items: [{ category: 'Others', other_category: 'Parking', amount: 100, tin_number: '123-456-789', expense_date: getTodayIsoDate(), receipt_urls: ['/uploads/phase1-a.pdf', '/uploads/phase1-b.png'] }] });
    expect(response.status).toBe(200);
    const claim = await response.json();
    expect(claim.requestor_id).toBe('u1');
    const mom = state.moms.find(item => item.id === claim.mom_id);
    expect(mom).toMatchObject({ requestor_id: 'u1', file_url: '/uploads/phase1-mom.pdf', file_name: 'meeting.pdf', minutes_source: 'Uploaded', discussion: '', action_items: '' });
    const expense = state.expenses.find(item => item.claim_id === claim.id);
    expect(expense).toBeDefined();
    expect(fromServerExpense(expense, claim.id)).toMatchObject({ category: 'Parking', tinNumber: '123-456-789', receiptUrls: ['/uploads/phase1-a.pdf', '/uploads/phase1-b.png'] });
  });
  it('rejects an uploaded MOM with no file before creating a meeting record', async () => {
    const count = state.moms.length;
    const response = await post({ claim_type: 'Reimbursement', mom: { client: 'Client', purpose: 'Review', minutes_source: 'Uploaded' } });
    expect(response.status).toBe(400);
    expect(state.moms.length).toBe(count);
  });
  it('offers Others and excludes removed expense categories', () => {
    expect(EXPENSE_CATEGORIES).toContain('Others');
    expect(EXPENSE_CATEGORIES).not.toContain('Entertainment');
    expect(EXPENSE_CATEGORIES).not.toContain('Lodging');
  });
});
