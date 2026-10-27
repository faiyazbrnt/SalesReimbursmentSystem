import { CUSTODIAN_CASH_ONLY_ERROR } from '../../lib/custodianPolicy';
import { v4 as uuidv4 } from 'uuid';
import {
  Liquidation, LiquidationStatus, LiquidationVarianceType, LiquidationLineItem,
  CashAdvanceStatus, Claim, ClaimStatus, UserRole
} from '../../lib/db/serverTypes';
import { state, checkCategoryLimits } from '../../server/state';
import { canAccessLiquidation } from '../../server/services/authorization';
import { isActiveDelegateFor } from '../../server/services/delegations';
import { generateClaimNumber } from '../../server/services/claimNumber';
import { addHistory, addCaHistory, addLiqHistory } from '../../server/services/history';
import { sendEmail } from '../../server/services/notifications';
import { normalizeExpenseCategory } from '../../lib/expenseCategories';
import { isFinancialRecord, REIMBURSEMENT_CAP } from '../../server/constants';
import { isClaimTypeEnabled, COMING_SOON_MESSAGE } from '../featureFlags';
import { persistLiquidation, persistLiquidationLineItems, persistCashAdvance } from '../../lib/db/cashAdvanceRepo';
import { persistClaim, persistClaimWithLineItems, persistExpenseLineItems } from '../../lib/db/coreLoopRepo';

function findUser(userId: string | null) {
  if (!userId) return null;
  return state.users.find(u => u.id === userId || u.entra_object_id === userId || u.user_principal_name === userId) || null;
}

export const recalculateLiquidation = async (liquidationId: string) => {
  const liq = state.liquidations.find(l => l.id === liquidationId);
  if (!liq) return;
  const ca = state.cashAdvances.find(c => c.id === liq.cashAdvanceId);
  if (!ca) return;

  const items = state.liquidationLineItems.filter(item => item.liquidationId === liquidationId);
  const totalSpent = items.reduce((sum, item) => sum + item.amount, 0);
  const varianceAmount = totalSpent - ca.amount;

  liq.totalSpent = totalSpent;
  liq.varianceAmount = varianceAmount;
  if (varianceAmount === 0) {
    liq.varianceType = LiquidationVarianceType.SETTLED;
  } else if (varianceAmount < 0) {
    liq.varianceType = LiquidationVarianceType.REFUND_DUE;
  } else {
    liq.varianceType = LiquidationVarianceType.REIMBURSEMENT_DUE;
  }

  try {
    await persistLiquidation(liq);
    await persistLiquidationLineItems(liquidationId, items);
  } catch (err) {
    console.error('[db] Could not persist recalculated liquidation to Postgres:', err);
  }
};

export function listLiquidations(userId: string | null) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  let filtered: Liquidation[] = [];
  if (user.role === UserRole.REQUESTOR) {
    filtered = state.liquidations.filter(l => l.requestorId === user.id);
  } else if (user.role === UserRole.APPROVER) {
    filtered = state.liquidations.filter(l => canAccessLiquidation(user, l));
  } else if (user.role === UserRole.CUSTODIAN) {
    filtered = state.liquidations.filter(liquidation => canAccessLiquidation(user, liquidation));
  } else {
    filtered = state.liquidations;
  }

  const enriched = filtered.map(l => {
    const requestor = state.users.find(u => u.id === l.requestorId);
    const cashAdvance = state.cashAdvances.find(c => c.id === l.cashAdvanceId);
    const items = state.liquidationLineItems.filter(item => item.liquidationId === l.id);
    const mom = cashAdvance?.momId ? state.moms.find(m => m.id === cashAdvance.momId) : undefined;
    const history = state.statusHistories
      .filter(h => h.liquidation_id === l.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { ...l, requestor, cashAdvance, mom, lineItems: items, history };
  });
  return { status: 200, body: enriched };
}

export function getLiquidation(userId: string | null, id: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const l = state.liquidations.find(liq => liq.id === id);
  if (!l) return { status: 404, body: { error: 'Liquidation not found' } };

  if (!canAccessLiquidation(user, l)) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  const requestor = state.users.find(u => u.id === l.requestorId);
  const cashAdvance = state.cashAdvances.find(c => c.id === l.cashAdvanceId);
  const items = state.liquidationLineItems.filter(item => item.liquidationId === l.id);
  const mom = cashAdvance?.momId ? state.moms.find(m => m.id === cashAdvance.momId) : undefined;

  const history = state.statusHistories
    .filter(h => h.liquidation_id === l.id)
    .map(h => ({
      ...h,
      changedBy: state.users.find(u => u.id === h.changed_by)
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { status: 200, body: { ...l, requestor, cashAdvance, mom, lineItems: items, history } };
}

export async function createLiquidation(userId: string | null, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };
  if (!isClaimTypeEnabled('Liquidation')) return { status: 403, body: { error: COMING_SOON_MESSAGE } };

  const { cashAdvanceId } = body || {};
  if (!cashAdvanceId) return { status: 400, body: { error: 'cashAdvanceId is required.' } };

  const ca = state.cashAdvances.find(c => c.id === cashAdvanceId);
  if (!ca) return { status: 404, body: { error: 'Cash Advance not found.' } };

  if (ca.requestorId !== user.id) {
    return { status: 403, body: { error: 'You can only file a liquidation for your own Cash Advance.' } };
  }

  if (ca.status !== CashAdvanceStatus.RELEASED) {
    return { status: 400, body: { error: 'Can only file a liquidation against a Released Cash Advance.' } };
  }

  const existing = state.liquidations.find(l => l.cashAdvanceId === cashAdvanceId && l.status !== LiquidationStatus.CLOSED);
  if (existing) {
    return { status: 400, body: { error: 'A Liquidation already exists for this Cash Advance.' } };
  }

  const liqId = uuidv4();
  const liquidation: Liquidation = {
    id: liqId,
    cashAdvanceId: ca.id,
    requestorId: user.id,
    status: LiquidationStatus.DRAFT,
    totalSpent: 0,
    varianceAmount: -ca.amount,
    varianceType: LiquidationVarianceType.REFUND_DUE,
    createdAt: new Date().toISOString()
  };

  state.liquidations.push(liquidation);
  try {
    await persistLiquidation(liquidation);
  } catch (err) {
    console.error('[db] Could not persist new liquidation to Postgres:', err);
  }
  addLiqHistory(liqId, '', LiquidationStatus.DRAFT, user.id, 'Liquidation Draft Created');
  return { status: 200, body: liquidation };
}

export async function addLiquidationLineItem(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const l = state.liquidations.find(liq => liq.id === id);
  if (!l) return { status: 404, body: { error: 'Liquidation not found' } };

  if (l.requestorId !== user.id) return { status: 403, body: { error: 'Forbidden' } };
  if (l.status !== LiquidationStatus.DRAFT && l.status !== LiquidationStatus.RETURNED_FOR_REVISION) {
    return { status: 400, body: { error: 'Cannot add line items to a submitted, approved, or closed Liquidation.' } };
  }

  const category = body?.category;
  const vendor = body?.vendor;
  const amount = body?.amount;
  const paymentMethod = body?.payment_method || body?.paymentMethod;
  const expenseDate = body?.expense_date || body?.expenseDate;
  const businessPurpose = body?.business_purpose || body?.businessPurpose;
  const orNumber = body?.or_number || body?.orNumber;
  const receiptUrl = body?.receipt_url || body?.receiptUrl;

  if (!category || !vendor || amount === undefined || amount === null || !paymentMethod || !expenseDate) {
    return { status: 400, body: { error: 'Missing required expense item fields.' } };
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return { status: 400, body: { error: 'Amount must be a positive number.' } };
  }

  const normalizedCategory = normalizeExpenseCategory(category);
  const limitWarning = checkCategoryLimits([{ category: normalizedCategory, amount: numericAmount }]);
  if (limitWarning) {
    return { status: 400, body: { error: limitWarning } };
  }

  const lineItem: LiquidationLineItem = {
    id: uuidv4(),
    liquidationId: l.id,
    category: normalizedCategory,
    vendor,
    amount: numericAmount,
    payment_method: paymentMethod,
    expense_date: expenseDate,
    business_purpose: businessPurpose || '',
    or_number: orNumber,
    receipt_url: receiptUrl
  };

  state.liquidationLineItems.push(lineItem);
  await recalculateLiquidation(l.id);
  return { status: 200, body: lineItem };
}

export async function updateLiquidationLineItem(userId: string | null, id: string, itemId: string, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const l = state.liquidations.find(liq => liq.id === id);
  if (!l) return { status: 404, body: { error: 'Liquidation not found' } };

  const item = state.liquidationLineItems.find(i => i.id === itemId && i.liquidationId === id);
  if (!item) return { status: 404, body: { error: 'Line item not found' } };

  if (l.requestorId !== user.id && user.role !== UserRole.ADMIN) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  if ([LiquidationStatus.CLOSED, LiquidationStatus.REVIEWED].includes(l.status) && user.role !== UserRole.ADMIN) {
    return { status: 403, body: { error: 'Cannot modify line items on closed or reviewed Liquidations.' } };
  }

  const category = body?.category;
  const vendor = body?.vendor;
  const amount = body?.amount;
  const paymentMethod = body?.payment_method || body?.paymentMethod;
  const expenseDate = body?.expense_date || body?.expenseDate;
  const businessPurpose = body?.business_purpose !== undefined ? body.business_purpose : body?.businessPurpose;
  const orNumber = body?.or_number !== undefined ? body.or_number : body?.orNumber;
  const receiptUrl = body?.receipt_url !== undefined ? body.receipt_url : body?.receiptUrl;

  if (amount !== undefined) {
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return { status: 400, body: { error: 'Amount must be a positive number.' } };
    }
    const catToCheck = category ? normalizeExpenseCategory(category) : item.category;
    const limitWarning = checkCategoryLimits([{ category: catToCheck, amount: numericAmount }]);
    if (limitWarning) {
      return { status: 400, body: { error: limitWarning } };
    }
    item.amount = numericAmount;
  }

  if (category) item.category = normalizeExpenseCategory(category);
  if (vendor) item.vendor = vendor;
  if (paymentMethod) item.payment_method = paymentMethod;
  if (expenseDate) item.expense_date = expenseDate;
  if (businessPurpose !== undefined) item.business_purpose = businessPurpose;
  if (orNumber !== undefined) item.or_number = orNumber;
  if (receiptUrl !== undefined) item.receipt_url = receiptUrl;

  await recalculateLiquidation(l.id);
  return { status: 200, body: item };
}

export async function deleteLiquidationLineItem(userId: string | null, id: string, itemId: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const l = state.liquidations.find(liq => liq.id === id);
  if (!l) return { status: 404, body: { error: 'Liquidation not found' } };

  const index = state.liquidationLineItems.findIndex(i => i.id === itemId && i.liquidationId === id);
  if (index === -1) return { status: 404, body: { error: 'Line item not found' } };

  if (l.requestorId !== user.id && user.role !== UserRole.ADMIN) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  if ([LiquidationStatus.CLOSED, LiquidationStatus.REVIEWED].includes(l.status) && user.role !== UserRole.ADMIN) {
    return { status: 403, body: { error: 'Cannot delete line items on closed or reviewed Liquidations.' } };
  }

  state.liquidationLineItems.splice(index, 1);
  await recalculateLiquidation(l.id);
  return { status: 200, body: { success: true } };
}

export async function submitLiquidation(userId: string | null, id: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const l = state.liquidations.find(liq => liq.id === id && liq.requestorId === user.id);
  if (!l) return { status: 404, body: { error: 'Liquidation not found' } };

  if (l.status !== LiquidationStatus.DRAFT && l.status !== LiquidationStatus.RETURNED_FOR_REVISION) {
    return { status: 400, body: { error: 'Only Draft or Returned liquidations can be submitted.' } };
  }

  const items = state.liquidationLineItems.filter(i => i.liquidationId === l.id);
  if (items.length === 0) {
    return { status: 400, body: { error: 'Cannot submit an empty liquidation report. Add at least one expense line item.' } };
  }

  await recalculateLiquidation(l.id);

  const ca = state.cashAdvances.find(c => c.id === l.cashAdvanceId);
  const approver = ca ? state.users.find(u => u.id === ca.approverId) : undefined;

  const oldStatus = l.status;
  l.status = LiquidationStatus.SUBMITTED;
  addLiqHistory(l.id, oldStatus, LiquidationStatus.SUBMITTED, user.id, 'Liquidation Submitted for Approval');

  if (approver) {
    sendEmail(
      approver.id,
      `Liquidation Submitted for Review - LIQ-${l.id.substring(0,6)}`,
      `A Liquidation report has been submitted by ${user.name} for Cash Advance CADV-${ca ? ca.id.substring(0,6) : ''}.\n\nTotal Spent: PHP ${l.totalSpent}\nVariance: PHP ${l.varianceAmount} (${l.varianceType})\n\nPlease review and approve.`
    );
  }

  sendEmail(
    user.id,
    `Liquidation Submitted - LIQ-${l.id.substring(0,6)}`,
    `Your Liquidation report has been submitted successfully${approver ? ` and routed to ${approver.name}` : ''}.\n\nTotal Spent: PHP ${l.totalSpent}\nVariance: PHP ${l.varianceAmount} (${l.varianceType})`
  );

  try {
    await persistLiquidation(l);
  } catch (err) {
    console.error('[db] Could not persist liquidation submission to Postgres:', err);
  }
  return { status: 200, body: l };
}

export async function reviewLiquidation(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user || user.role !== UserRole.APPROVER) return { status: 403, body: { error: 'Forbidden' } };

  const l = state.liquidations.find(liq => liq.id === id);
  if (!l) return { status: 404, body: { error: 'Liquidation not found' } };

  const ca = state.cashAdvances.find(c => c.id === l.cashAdvanceId);
  if (!ca || (ca.approverId !== user.id && !isActiveDelegateFor(user.id, ca.approverId))) {
    return { status: 403, body: { error: 'You are not the designated approver/reviewer for this Liquidation.' } };
  }

  if (l.status !== LiquidationStatus.SUBMITTED) {
    return { status: 400, body: { error: 'Only Submitted Liquidations can be reviewed.' } };
  }

  const { decision, comment } = body || {};
  if (!['Approved', 'Returned'].includes(decision)) {
    return { status: 400, body: { error: 'Invalid decision. Must be Approved or Returned.' } };
  }

  if (decision === 'Returned' && !comment) {
    return { status: 400, body: { error: 'A comment is required when returning a Liquidation for revision.' } };
  }

  let shortFallClaim: Claim | undefined;

  if (decision === 'Returned') {
    const oldStatus = l.status;
    l.status = LiquidationStatus.RETURNED_FOR_REVISION;
    addLiqHistory(l.id, oldStatus, LiquidationStatus.RETURNED_FOR_REVISION, user.id, comment || 'Returned for revision');
    addCaHistory(ca.id, ca.status, ca.status, user.id, `Liquidation Returned for Revision: ${comment}`);
    sendEmail(
      l.requestorId,
      `Liquidation Returned - LIQ-${l.id.substring(0,6)}`,
      `Your Liquidation report has been returned for revision by ${user.name}.\n\nReason: ${comment}`
    );
  } else {
    await recalculateLiquidation(l.id);

    if (l.varianceType === LiquidationVarianceType.SETTLED) {
      const oldStatus = l.status;
      const oldCaStatus = ca.status;
      l.status = LiquidationStatus.CLOSED;
      ca.status = CashAdvanceStatus.LIQUIDATED;
      addLiqHistory(l.id, oldStatus, LiquidationStatus.CLOSED, user.id, 'Liquidation Approved & Closed (Settled with zero variance)');
      addCaHistory(ca.id, oldCaStatus, CashAdvanceStatus.LIQUIDATED, user.id, 'Liquidation Closed');

      sendEmail(
        l.requestorId,
        `Liquidation Approved & Closed - LIQ-${l.id.substring(0,6)}`,
        `Your Liquidation report has been approved and closed by ${user.name}. Since it is settled with zero variance, no further action is required.`
      );
    } else if (l.varianceType === LiquidationVarianceType.REIMBURSEMENT_DUE) {
      const oldStatus = l.status;
      const oldCaStatus = ca.status;
      l.status = LiquidationStatus.CLOSED;
      ca.status = CashAdvanceStatus.LIQUIDATED;

      const claimId = uuidv4();
      const claimNumber = await generateClaimNumber();

      shortFallClaim = {
        id: claimId,
        claim_number: claimNumber,
        requestor_id: l.requestorId,
        current_approver_id: ca.approverId,
        mom_id: ca.momId || '',
        status: ClaimStatus.PROCESSING,
        total_amount: l.varianceAmount,
        approved_amount: Math.min(l.varianceAmount, REIMBURSEMENT_CAP),
        approved_at: new Date().toISOString(),
        expense_category: 'Cash Advance Shortfall',
        receipt_url: state.liquidationLineItems.find(item => item.liquidationId === l.id)?.receipt_url || '',
        remarks: `Automatic shortfall reimbursement from Liquidation of CADV-${ca.id.substring(0,6)}`,
        sourceLiquidationId: l.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        flagged_high_value: l.varianceAmount > state.systemSettings.highValueThreshold
      };

      state.claims.push(shortFallClaim);

      state.expenses.push({
        id: uuidv4(),
        claim_id: claimId,
        expense_date: new Date().toISOString().split('T')[0],
        vendor: 'Shortfall Payout',
        category: 'Cash Advance Shortfall',
        amount: l.varianceAmount,
        payment_method: 'Cash',
        business_purpose: `Shortfall payout for CADV-${ca.id.substring(0,6)} liquidation`,
        receipt_url: shortFallClaim.receipt_url
      });

      try {
        await persistClaimWithLineItems(shortFallClaim, state.expenses.filter(e => e.claim_id === claimId));
      } catch (err) {
        console.error('[db] Could not persist shortfall claim to Postgres:', err);
      }

      addHistory(claimId, ClaimStatus.DRAFT, ClaimStatus.PROCESSING, user.id, 'Automatic creation from Cash Advance Liquidation Shortfall');
      addLiqHistory(l.id, oldStatus, LiquidationStatus.CLOSED, user.id, `Liquidation Approved & Closed. Shortfall reimbursement claim created: ${claimNumber}`);
      addCaHistory(ca.id, oldCaStatus, CashAdvanceStatus.LIQUIDATED, user.id, 'Liquidation Closed (Reimbursement Payout Queued)');

      sendEmail(
        l.requestorId,
        `Liquidation Approved & Reimbursement Payout Queued - LIQ-${l.id.substring(0,6)}`,
        `Your Liquidation has been approved. A shortfall reimbursement claim ${claimNumber} for PHP ${l.varianceAmount} has been automatically created and routed directly to the Custodian's disbursement preparation queue.`
      );
    } else {
      const oldStatus = l.status;
      l.status = LiquidationStatus.REVIEWED;
      addLiqHistory(l.id, oldStatus, LiquidationStatus.REVIEWED, user.id, `Liquidation Approved & Reviewed. Pending refund of PHP ${Math.abs(l.varianceAmount)}`);
      addCaHistory(ca.id, ca.status, ca.status, user.id, 'Liquidation Reviewed (Pending Refund)');

      sendEmail(
        l.requestorId,
        `Liquidation Reviewed & Approved - LIQ-${l.id.substring(0,6)}`,
        `Your Liquidation has been approved and is awaiting Custodian refund collection of PHP ${Math.abs(l.varianceAmount)}.`
      );
    }
  }

  try {
    await persistLiquidation(l);
    await persistCashAdvance(ca);
    if (shortFallClaim) {
      await persistClaim(shortFallClaim);
      await persistExpenseLineItems(shortFallClaim.id, state.expenses.filter(e => e.claim_id === shortFallClaim!.id));
    }
  } catch (err) {
    console.error('[db] Could not persist liquidation review to Postgres:', err);
  }
  return { status: 200, body: l };
}

export async function collectLiquidationRefund(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user || user.role !== UserRole.CUSTODIAN) return { status: 403, body: { error: 'Forbidden: Only Custodians can collect refunds.' } };

  const l = state.liquidations.find(liq => liq.id === id);
  if (!l) return { status: 404, body: { error: 'Liquidation not found' } };

  if (l.status !== LiquidationStatus.REVIEWED) {
    return { status: 400, body: { error: 'Only Reviewed Liquidations with pending refunds can be marked collected.' } };
  }

  if (l.varianceType !== LiquidationVarianceType.REFUND_DUE) {
    return { status: 400, body: { error: 'No refund is due for this Liquidation.' } };
  }

  const { referenceNote, refundMethod } = body || {};
  if (refundMethod !== 'Cash' || !canAccessLiquidation(user, l)) return { status: 400, body: { error: CUSTODIAN_CASH_ONLY_ERROR } };

  const oldStatus = l.status;
  l.status = LiquidationStatus.CLOSED;

  const ca = state.cashAdvances.find(c => c.id === l.cashAdvanceId);
  let oldCaStatus = '';
  if (ca) {
    oldCaStatus = ca.status;
    ca.status = CashAdvanceStatus.LIQUIDATED;
  }

  addLiqHistory(l.id, oldStatus, LiquidationStatus.CLOSED, user.id, `Closed (Refund Collected via ${refundMethod}). Note: ${referenceNote || 'Collected by Custodian'}`);
  if (ca) {
    addCaHistory(ca.id, oldCaStatus, CashAdvanceStatus.LIQUIDATED, user.id, 'Closed (Refund Collected)');
  }

  (l as any).refundReference = referenceNote || 'Collected by Custodian';
  (l as any).refundMethod = refundMethod;
  (l as any).refundCollectedAt = new Date().toISOString();

  sendEmail(
    l.requestorId,
    `Liquidation Closed (Refund Collected) - LIQ-${l.id.substring(0,6)}`,
    `Your Liquidation has been marked as Closed. Custodian ${user.name} has verified collection of your refund of PHP ${Math.abs(l.varianceAmount)}.${referenceNote ? `\n\nReference: ${referenceNote}` : ''}`
  );

  try {
    await persistLiquidation(l);
    if (ca) await persistCashAdvance(ca);
  } catch (err) {
    console.error('[db] Could not persist refund collection to Postgres:', err);
  }
  return { status: 200, body: l };
}
