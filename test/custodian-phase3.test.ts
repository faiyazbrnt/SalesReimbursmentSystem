import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { state } from '../src/server/state';
import { ClaimStatus, CashAdvanceStatus, LiquidationStatus, LiquidationVarianceType, UserRole, type Claim } from '../src/lib/db/serverTypes';
import { listClaims, getClaim, markReadyForClaim, generateClaimCode, custodianClaimDecision, approveClaim } from '../src/services/claims/claims';
import { listCashAdvances, getCashAdvance, releaseCashAdvance, approveCashAdvance } from '../src/services/cash-advances/cashAdvances';
import { listLiquidations, getLiquidation, collectLiquidationRefund } from '../src/services/liquidations/liquidations';
import { getWorkspacePayload } from '../src/server/services/workspaceService';
import { findUploadAccessCheck } from '../src/server/services/authorization';
import { getAnalyticsSummary } from '../src/services/analytics/analytics';
import { POST as commentRoute } from '../src/app/api/custodian/claims/[id]/comments/route';

const original = { ...state };
const makeClaim = (id: string, payment_method?: string): Claim => ({ id, requestor_id: 'u1', current_approver_id: 'u2', claim_type: 'Reimbursement', status: ClaimStatus.PROCESSING, total_amount: 100, approved_amount: 100, payment_method, created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z' });
const comment = (id: string, body: unknown, userId = 'u3') => commentRoute(new Request(`http://test/api/custodian/claims/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': userId }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  state.claims = [makeClaim('cash-claim'), makeClaim('bank-claim', 'Bank Transfer')];
  state.expenses = state.claims.map(record => ({ id: `${record.id}-expense`, claim_id: record.id, vendor: 'Cafe', category: 'Meals', amount: 100, expense_date: '2026-10-26', payment_method: 'Personal Card', business_purpose: 'Meeting', receipt_url: `/uploads/${record.id}.pdf` }));
  state.cashAdvances = ['Cash', 'Bank Transfer'].map((method, index) => ({ id: `advance-${index}`, requestorId: 'u1', approverId: 'u2', amount: 200, purpose: 'Visit', releaseMethod: method, status: CashAdvanceStatus.APPROVED, createdAt: '2026-10-26T00:00:00Z' }));
  state.liquidations = ['Cash', 'Bank Transfer'].map((method, index) => ({ id: `liquidation-${index}`, cashAdvanceId: `advance-${index}`, requestorId: 'u1', totalSpent: 100, varianceAmount: -100, varianceType: LiquidationVarianceType.REFUND_DUE, refundMethod: method, status: LiquidationStatus.REVIEWED, createdAt: '2026-10-26T00:00:00Z' }));
  state.statusHistories = [];
  state.approvals = [];
  state.reviewMeetings = [];
  state.liquidationLineItems = [];
  state.emails = [];
  state.teamsMessages = [];
});
afterEach(() => Object.assign(state, original));

describe('Custodian Phase 3', () => {
  it('limits list, workspace, detail, uploads and analytics to cash payouts and refunds', () => {
    expect((listClaims('u3').body as Array<{id:string}>).map(record => record.id)).toEqual(['cash-claim']);
    expect((listCashAdvances('u3').body as Array<{id:string}>).map(record => record.id)).toEqual(['advance-0']);
    expect((listLiquidations('u3').body as Array<{id:string}>).map(record => record.id)).toEqual(['liquidation-0']);
    const workspace = getWorkspacePayload('u3')!;
    expect(workspace.claims.map(record => record.id)).toEqual(['cash-claim']);
    expect(workspace.advances.map(record => record.id)).toEqual(['advance-0']);
    expect(workspace.liquidations.map(record => record.id)).toEqual(['liquidation-0']);
    expect(getClaim('u3', 'bank-claim').status).toBe(403);
    expect(getCashAdvance('u3', 'advance-1').status).toBe(403);
    expect(getLiquidation('u3', 'liquidation-1').status).toBe(403);
    const custodian = state.users.find(user => user.id === 'u3')!;
    expect(findUploadAccessCheck('/uploads/bank-claim.pdf')?.(custodian)).toBe(false);
    expect(findUploadAccessCheck('/uploads/cash-claim.pdf')?.(custodian)).toBe(true);
    const analytics = getAnalyticsSummary('u3', new URLSearchParams());
    expect((analytics.body as { records: Array<{id:string}> }).records.map(record => record.id).sort()).toEqual(['advance-0', 'cash-claim', 'liquidation-0']);
    expect(getClaim('u2', 'bank-claim').status).toBe(200);
  });
  it.each(['cash-claim', 'advance-0', 'liquidation-0'])('saves an attributed comment on %s without changing status', async id => {
    const before = JSON.stringify([state.claims, state.cashAdvances, state.liquidations]);
    const response = await comment(id, { comment: '  Please bring the original receipt.  ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ changed_by: 'u3', reason: 'Custodian comment: Please bring the original receipt.' });
    expect(state.statusHistories).toHaveLength(1);
    expect(state.statusHistories[0].old_status).toBe(state.statusHistories[0].new_status);
    expect(JSON.stringify([state.claims, state.cashAdvances, state.liquidations])).toBe(before);
  });
  it('blocks empty, malformed, unauthorized and non-cash comments', async () => {
    expect((await comment('cash-claim', { comment: '  ' })).status).toBe(400);
    expect((await comment('cash-claim', { comment: {} })).status).toBe(400);
    expect((await comment('cash-claim', { comment: 'Note' }, 'u1')).status).toBe(403);
    expect((await comment('bank-claim', { comment: 'Note' })).status).toBe(403);
    expect((await comment('missing', { comment: 'Note' })).status).toBe(404);
    expect(state.statusHistories).toHaveLength(0);
  });
  it('blocks non-cash release before generating a code or changing payment state', async () => {
    expect((await markReadyForClaim('u3', 'cash-claim', { payment_method: 'Bank Transfer' })).status).toBe(400);
    expect(state.claims[0].release_code).toBeUndefined();
    expect(state.claims[0].status).toBe(ClaimStatus.PROCESSING);
    expect((await generateClaimCode('u3', 'bank-claim', {})).status).toBe(403);
    expect((await markReadyForClaim('u3', 'bank-claim', { payment_method: 'Cash' })).status).toBe(403);
    expect(state.statusHistories).toHaveLength(0);
    expect((await markReadyForClaim('u3', 'cash-claim', { payment_method: 'Cash', comment: 'Counted and prepared.' })).status).toBe(200);
    expect(state.statusHistories[0].reason).toBe('Counted and prepared.');
  });
  it('enforces cash-only advance release and refund collection, including attempts to overwrite a non-cash record', async () => {
    expect((await releaseCashAdvance('u3', 'advance-0', { releaseReference: 'V1', releaseMethod: 'Bank Transfer' })).status).toBe(400);
    expect((await releaseCashAdvance('u3', 'advance-1', { releaseReference: 'V1', releaseMethod: 'Cash' })).status).toBe(400);
    expect((await collectLiquidationRefund('u3', 'liquidation-0', { refundMethod: 'Bank Transfer' })).status).toBe(400);
    expect((await collectLiquidationRefund('u3', 'liquidation-1', { refundMethod: 'Cash' })).status).toBe(400);
    expect(state.statusHistories).toHaveLength(0);
    expect((await releaseCashAdvance('u3', 'advance-0', { releaseReference: 'V1', releaseMethod: 'Cash' })).status).toBe(200);
    expect((await collectLiquidationRefund('u3', 'liquidation-0', { refundMethod: 'Cash' })).status).toBe(200);
  });
  it('blocks Reject through Custodian decisions and the Approver endpoints, even if misassigned', async () => {
    for (const id of ['cash-claim', 'advance-0', 'liquidation-0']) expect((await custodianClaimDecision('u3', id, { decision: 'Reject', comment: 'No' })).status).toBe(400);
    state.claims[0].current_approver_id = 'u3';
    state.claims[0].status = ClaimStatus.PENDING_APPROVAL;
    state.cashAdvances[0].approverId = 'u3';
    state.cashAdvances[0].status = CashAdvanceStatus.SUBMITTED;
    expect((await approveClaim('u3', 'cash-claim', { decision: 'Rejected', comment: 'No' })).status).toBe(403);
    expect((await approveCashAdvance('u3', 'advance-0', { decision: 'Rejected', comment: 'No' })).status).toBe(403);
    expect(state.statusHistories).toHaveLength(0);
  });
  it('preserves Return for correction on eligible cash reimbursements', async () => {
    expect((await custodianClaimDecision('u3', 'cash-claim', { decision: 'Return', comment: 'Attach the original receipt.' })).status).toBe(200);
    expect(state.claims[0].status).toBe(ClaimStatus.RETURNED);
  });
});
