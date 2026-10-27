import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { state } from '../src/server/state';
import { Claim, ClaimStatus, UserRole, CashAdvanceStatus, LiquidationStatus, LiquidationVarianceType, MomStatus, MinutesSource } from '../src/lib/db/serverTypes';
import { getWorkspacePayload } from '../src/server/services/workspaceService';
import { findUploadAccessCheck } from '../src/server/services/authorization';
import { listClaims, getClaim, approveClaim, markReadyForClaim, deleteDraftClaim } from '../src/services/claims/claims';
import { listCashAdvances, getCashAdvance } from '../src/services/cash-advances/cashAdvances';
import { listLiquidations, getLiquidation } from '../src/services/liquidations/liquidations';
import { listMoms, getMom, updateMom } from '../src/services/moms/moms';
import { listReceipts } from '../src/services/claims/receipts';
import { getAnalyticsSummary } from '../src/services/analytics/analytics';
import { buildReceiptRecordsCsv } from '../src/lib/financialRecordsCsv';
import { canonicalRoleUrl } from '../src/routes/rolePaths';

const reviewer = 'phase2-approver';
const original = { ...state };
const claim = (id: string, status: ClaimStatus, approverId = 'u2'): Claim => ({ id, status, requestor_id: 'u1', current_approver_id: approverId, total_amount: 100, approved_amount: status === ClaimStatus.APPROVED ? 100 : 0, claim_type: 'Reimbursement', created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z' });

beforeEach(() => {
  state.users = [...original.users, { ...original.users.find(user => user.id === 'u1')!, id: 'phase2-requestor', role: UserRole.REQUESTOR }, { ...original.users.find(user => user.id === 'u2')!, id: reviewer, role: UserRole.APPROVER, reports_to: null }];
  state.claims = [claim('approved-foreign', ClaimStatus.APPROVED), claim('pending-foreign', ClaimStatus.PENDING_APPROVAL), claim('draft-foreign', ClaimStatus.DRAFT), claim('assigned-pending', ClaimStatus.PENDING_APPROVAL, reviewer)];
  state.claims[0].mom_id = 'financial-mom';
  state.expenses = [{ id: 'financial-expense', claim_id: 'approved-foreign', category: 'Meals', amount: 100, vendor: 'Cafe', business_purpose: 'Review', expense_date: '2026-10-26', payment_method: 'Cash', receipt_url: '/uploads/one.pdf', receipt_urls: ['/uploads/one.pdf', '/uploads/two.pdf'] }];
  state.moms = [{ id: 'financial-mom', claim_id: 'approved-foreign', requestor_id: 'u1', meeting_date: '2026-10-26', file_url: '/uploads/mom.pdf', status: MomStatus.COMPLETED, minutes_source: MinutesSource.UPLOADED, created_at: '2026-10-26T00:00:00Z' }];
  state.cashAdvances = [CashAdvanceStatus.APPROVED, CashAdvanceStatus.SUBMITTED].map((status, index) => ({ id: `advance-${index}`, status, requestorId: 'u1', approverId: 'u2', amount: 100, purpose: 'Trip', createdAt: '2026-10-26T00:00:00Z' }));
  state.liquidations = [LiquidationStatus.REVIEWED, LiquidationStatus.SUBMITTED].map((status, index) => ({ id: `liquidation-${index}`, status, requestorId: 'u1', cashAdvanceId: 'advance-0', totalSpent: 100, varianceAmount: 0, varianceType: LiquidationVarianceType.SETTLED, createdAt: '2026-10-26T00:00:00Z' }));
  state.liquidationLineItems = [];
  state.statusHistories = [];
  state.approvals = [];
  state.reviewMeetings = [];
  state.delegations = [];
});
afterEach(() => Object.assign(state, original));

describe('Approver financial responsibilities', () => {
  it('includes company-wide approved records alongside assigned work in list, detail, and workspace', () => {
    const result = listClaims(reviewer);
    expect(result.status).toBe(200);
    expect((result.body as Array<{id: string}>).map(record => record.id)).toEqual(['approved-foreign', 'assigned-pending']);
    expect(getClaim(reviewer, 'approved-foreign').status).toBe(200);
    expect(getClaim(reviewer, 'pending-foreign').status).toBe(403);
    expect(getClaim(reviewer, 'draft-foreign').status).toBe(403);
    const workspace = getWorkspacePayload(reviewer)!;
    expect(workspace.claims.map(record => record.id)).toEqual(['approved-foreign', 'assigned-pending']);
    expect(workspace.advances.map(record => record.id)).toEqual(['advance-0']);
    expect(workspace.liquidations.map(record => record.id)).toEqual(['liquidation-0']);
    expect(workspace.moms.map(record => record.id)).toEqual(['financial-mom']);
  });
  it.each([ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED])('keeps company financial access through reimbursement status %s', status => {
    state.claims[0].status = status;
    expect(getClaim(reviewer, 'approved-foreign').status).toBe(200);
    expect(getWorkspacePayload(reviewer)?.claims.some(record => record.id === 'approved-foreign')).toBe(true);
    expect(listReceipts(reviewer).status).toBe(200);
  });
  it('grants finance-stage advance and liquidation access while restricting unassigned submissions', () => {
    expect((listCashAdvances(reviewer).body as Array<{id: string}>).map(record => record.id)).toEqual(['advance-0']);
    expect(getCashAdvance(reviewer, 'advance-0').status).toBe(200);
    expect(getCashAdvance(reviewer, 'advance-1').status).toBe(403);
    expect((listLiquidations(reviewer).body as Array<{id: string}>).map(record => record.id)).toEqual(['liquidation-0']);
    expect(getLiquidation(reviewer, 'liquidation-0').status).toBe(200);
    expect(getLiquidation(reviewer, 'liquidation-1').status).toBe(403);
  });
  it('opens financial evidence, including secondary receipts, without granting MOM edit authority', async () => {
    expect(getMom(reviewer, 'financial-mom').status).toBe(200);
    expect((listMoms(reviewer).body as Array<{id: string}>).map(record => record.id)).toEqual(['financial-mom']);
    const user = state.users.find(record => record.id === reviewer)!;
    expect(findUploadAccessCheck('/uploads/two.pdf')?.(user)).toBe(true);
    expect(findUploadAccessCheck('/uploads/mom.pdf')?.(user)).toBe(true);
    expect((await updateMom(reviewer, 'financial-mom', { purpose: 'Unauthorized edit' })).status).toBe(403);
    const receipts = listReceipts(reviewer);
    expect(receipts.status).toBe(200);
    expect(receipts.body).toMatchObject([{ parentId: 'approved-foreign', receipt_urls: ['/uploads/one.pdf', '/uploads/two.pdf'] }]);
    expect(listReceipts('u1').status).toBe(403);
  });
  it('provides company-wide financial analytics without including pending approval work in the financial view', () => {
    const result = getAnalyticsSummary(reviewer, new URLSearchParams('scope=financial'));
    expect(result.status).toBe(200);
    expect((result.body as { records: Array<{id: string}> }).records.map(record => record.id).sort()).toEqual(['advance-0', 'approved-foreign', 'liquidation-0']);
    const ownScope = getAnalyticsSummary('phase2-requestor', new URLSearchParams('scope=financial'));
    expect(ownScope.status).toBe(200);
    expect((ownScope.body as { records: unknown[] }).records).toEqual([]);
  });
  it('does not grant approval, payout, or deletion authority through financial visibility', async () => {
    expect((await approveClaim(reviewer, 'pending-foreign', { decision: 'Approved' })).status).toBe(403);
    expect((await markReadyForClaim(reviewer, 'approved-foreign', {})).status).toBe(403);
    expect((await deleteDraftClaim(reviewer, 'draft-foreign')).status).toBe(403);
    expect(state.claims.find(record => record.id === 'pending-foreign')?.status).toBe(ClaimStatus.PENDING_APPROVAL);
  });
  it('preserves direct links to the new financial routes under the Approver prefix', () => {
    for (const path of ['/financials', '/financials/records', '/financials/receipts', '/financials/analytics']) expect(canonicalRoleUrl(`/approver${path}`, '', '', UserRole.APPROVER)).toBe(`/approver${path}`);
  });
  it('exports multiple receipt links once per expense and escapes spreadsheet formulas', () => {
    const csv = buildReceiptRecordsCsv([{ claimRef: 'REIM-1', requestorName: '=SUM(1)', vendor: 'Cafe', category: 'Meals', amount: 100, date: '2026-10-26', fileUrls: ['/one.pdf', '/two.pdf'] }]);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('/one.pdf; /two.pdf');
    expect(csv).toContain("'=SUM(1)");
  });
});
