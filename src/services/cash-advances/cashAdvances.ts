import { v4 as uuidv4 } from 'uuid';
import { CashAdvance, CashAdvanceStatus, UserRole, MomStatus } from '../../lib/db/serverTypes';
import { state } from '../../server/state';
import { isActiveDelegateFor, getActiveDelegation } from '../../server/services/delegations';
import { addCaHistory } from '../../server/services/history';
import { sendEmail } from '../../server/services/notifications';
import { isFinanceVisibleFinancialRecord, LIQUIDATION_DEADLINE_DAYS } from '../../server/constants';
import { isClaimTypeEnabled, COMING_SOON_MESSAGE } from '../featureFlags';
import { persistCashAdvance } from '../../lib/db/cashAdvanceRepo';

function findUser(userId: string | null) {
  if (!userId) return null;
  return state.users.find(u => u.id === userId || u.entra_object_id === userId || u.user_principal_name === userId) || null;
}

export function listCashAdvances(userId: string | null) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  let filtered: CashAdvance[] = [];
  if (user.role === UserRole.REQUESTOR) {
    filtered = state.cashAdvances.filter(ca => ca.requestorId === user.id);
  } else if (user.role === UserRole.APPROVER) {
    const reporteeIds = state.users.filter(u => u.reports_to === user.id).map(u => u.id);
    filtered = state.cashAdvances.filter(
      ca => ca.approverId === user.id || ca.requestorId === user.id || reporteeIds.includes(ca.requestorId) || isActiveDelegateFor(user.id, ca.approverId)
    );
  } else if (user.role === UserRole.FINANCE) {
    filtered = state.cashAdvances.filter(ca => isFinanceVisibleFinancialRecord('Cash Advance', ca.status));
  } else {
    filtered = state.cashAdvances;
  }

  const enriched = filtered.map(ca => {
    const requestor = state.users.find(u => u.id === ca.requestorId);
    const approver = state.users.find(u => u.id === ca.approverId);
    const mom = ca.momId ? state.moms.find(m => m.id === ca.momId) : undefined;
    const history = state.statusHistories
      .filter(h => h.cash_advance_id === ca.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { ...ca, requestor, approver, mom, history };
  });
  return { status: 200, body: enriched };
}

export function getCashAdvance(userId: string | null, id: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const ca = state.cashAdvances.find(c => c.id === id);
  if (!ca) return { status: 404, body: { error: 'Cash Advance not found' } };

  let hasAccess = false;
  if (user.role === UserRole.REQUESTOR) {
    hasAccess = ca.requestorId === user.id;
  } else if (user.role === UserRole.APPROVER) {
    const reporteeIds = state.users.filter(u => u.reports_to === user.id).map(u => u.id);
    hasAccess = ca.approverId === user.id || ca.requestorId === user.id || reporteeIds.includes(ca.requestorId) || isActiveDelegateFor(user.id, ca.approverId);
  } else if (user.role === UserRole.FINANCE) {
    hasAccess = isFinanceVisibleFinancialRecord('Cash Advance', ca.status);
  } else {
    hasAccess = true;
  }
  if (!hasAccess) return { status: 403, body: { error: 'Forbidden' } };

  const requestor = state.users.find(u => u.id === ca.requestorId);
  const approver = state.users.find(u => u.id === ca.approverId);
  const mom = ca.momId ? state.moms.find(m => m.id === ca.momId) : undefined;

  const history = state.statusHistories
    .filter(h => h.cash_advance_id === ca.id)
    .map(h => ({
      ...h,
      changedBy: state.users.find(u => u.id === h.changed_by)
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { status: 200, body: { ...ca, requestor, approver, mom, history } };
}

export async function createCashAdvance(userId: string | null, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };
  if (!isClaimTypeEnabled('Cash Advance')) return { status: 403, body: { error: COMING_SOON_MESSAGE } };
  if (!user.reports_to) return { status: 403, body: { error: 'Forbidden: You must have a designated manager (reports_to) to submit.' } };

  const hasActive = state.cashAdvances.some(ca => ca.requestorId === user.id && ca.status !== CashAdvanceStatus.LIQUIDATED && ca.status !== CashAdvanceStatus.REJECTED);
  if (hasActive) {
    return { status: 400, body: { error: 'A requestor may only have one active (unliquidated) Cash Advance at a time. Please liquidate or resolve your current open Cash Advance before requesting a new one.' } };
  }

  const { amount, purpose, momId, is_draft, isDraft } = body || {};
  const isDraftFlag = Boolean(is_draft || isDraft);
  let numericAmount = Number(amount);
  if (!isDraftFlag) {
    if (amount === undefined || amount === null || amount === '') {
      return { status: 400, body: { error: 'Amount is required.' } };
    }
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return { status: 400, body: { error: 'Amount must be a valid positive number.' } };
    }
    if (!purpose) {
      return { status: 400, body: { error: 'Purpose is required.' } };
    }
  } else {
    if (isNaN(numericAmount) || numericAmount < 0) {
      numericAmount = 0;
    }
  }

  if (momId) {
    const mom = state.moms.find(m => m.id === momId);
    if (!mom) return { status: 400, body: { error: 'Minutes of Meeting (MOM) not found.' } };
    if (!isDraftFlag && mom.status !== MomStatus.COMPLETED) {
      return { status: 400, body: { error: 'Cannot attach an incomplete or draft Minutes of Meeting.' } };
    }
  }

  const caId = uuidv4();
  const cashAdvance: CashAdvance = {
    id: caId,
    requestorId: user.id,
    amount: numericAmount,
    purpose: purpose || (isDraftFlag ? 'Draft Cash Advance' : ''),
    momId,
    approverId: user.reports_to,
    status: CashAdvanceStatus.DRAFT,
    createdAt: new Date().toISOString()
  };

  state.cashAdvances.push(cashAdvance);
  try {
    await persistCashAdvance(cashAdvance);
  } catch (err) {
    console.error('[db] Could not persist new cash advance to Postgres:', err);
  }
  addCaHistory(caId, '', CashAdvanceStatus.DRAFT, user.id, 'Cash Advance Draft Created');
  return { status: 200, body: cashAdvance };
}

export async function updateCashAdvance(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const ca = state.cashAdvances.find(c => c.id === id);
  if (!ca) return { status: 404, body: { error: 'Cash Advance not found' } };

  const { amount, purpose, momId } = body || {};

  if ([CashAdvanceStatus.RELEASED, CashAdvanceStatus.LIQUIDATED].includes(ca.status)) {
    if (user.role !== UserRole.ADMIN) {
      return { status: 403, body: { error: 'This Cash Advance has already been released/liquidated. Its amount, purpose, and MOM are locked and can only be modified by an Admin.' } };
    }
  }

  if (amount !== undefined) {
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return { status: 400, body: { error: 'Amount must be a valid positive number.' } };
    }
    ca.amount = numericAmount;
  }

  if (purpose !== undefined) {
    if (!purpose) return { status: 400, body: { error: 'Purpose cannot be empty.' } };
    ca.purpose = purpose;
  }

  if (momId !== undefined) {
    if (momId) {
      const mom = state.moms.find(m => m.id === momId);
      if (!mom) return { status: 400, body: { error: 'Minutes of Meeting (MOM) not found.' } };
      if (mom.status !== MomStatus.COMPLETED) {
        return { status: 400, body: { error: 'Cannot attach an incomplete or draft Minutes of Meeting.' } };
      }
    }
    ca.momId = momId || undefined;
  }

  try {
    await persistCashAdvance(ca);
  } catch (err) {
    console.error('[db] Could not persist cash advance changes to Postgres:', err);
  }
  return { status: 200, body: ca };
}

export async function submitCashAdvance(userId: string | null, id: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const ca = state.cashAdvances.find(c => c.id === id && c.requestorId === user.id);
  if (!ca) return { status: 404, body: { error: 'Cash Advance not found' } };

  if (ca.status !== CashAdvanceStatus.DRAFT && ca.status !== CashAdvanceStatus.REJECTED) {
    return { status: 400, body: { error: 'Only Cash Advances in Draft or Rejected status can be submitted.' } };
  }

  const oldStatus = ca.status;
  ca.status = CashAdvanceStatus.SUBMITTED;
  addCaHistory(ca.id, oldStatus, CashAdvanceStatus.SUBMITTED, user.id, 'Cash Advance Submitted for Approval');

  if (user.reports_to) {
    const activeDelegation = getActiveDelegation(user.reports_to);
    ca.approverId = activeDelegation ? activeDelegation.delegate_id : user.reports_to;
  }

  const approver = state.users.find(u => u.id === ca.approverId);
  if (approver) {
    sendEmail(
      ca.approverId,
      `Cash Advance Request Submitted - CADV-${ca.id.substring(0,6)}`,
      `A Cash Advance request for PHP ${ca.amount} has been submitted by ${user.name} for your approval.\n\nPurpose: ${ca.purpose}`
    );
  }

  sendEmail(
    user.id,
    `Cash Advance Request Submitted - CADV-${ca.id.substring(0,6)}`,
    `Your Cash Advance request for PHP ${ca.amount} has been successfully submitted and routed for approval.\n\nPurpose: ${ca.purpose}\n\nYou'll receive another email as soon as a decision is made.`
  );

  try {
    await persistCashAdvance(ca);
  } catch (err) {
    console.error('[db] Could not persist cash advance submission to Postgres:', err);
  }
  return { status: 200, body: ca };
}

export async function approveCashAdvance(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user || user.role !== UserRole.APPROVER) return { status: 403, body: { error: 'Forbidden' } };

  const ca = state.cashAdvances.find(c => c.id === id);
  if (!ca) return { status: 404, body: { error: 'Cash Advance not found' } };

  if (ca.approverId !== user.id && !isActiveDelegateFor(user.id, ca.approverId)) {
    return { status: 403, body: { error: 'You are not the designated approver for this Cash Advance.' } };
  }

  if (ca.status !== CashAdvanceStatus.SUBMITTED) {
    return { status: 400, body: { error: 'Only Submitted Cash Advances can be approved or rejected.' } };
  }

  const { decision, comment } = body || {};
  if (!['Approved', 'Rejected'].includes(decision)) {
    return { status: 400, body: { error: 'Invalid decision. Must be Approved or Rejected.' } };
  }

  if (decision === 'Rejected' && !comment) {
    return { status: 400, body: { error: 'A comment is required when rejecting a Cash Advance.' } };
  }

  const oldStatus = ca.status;
  const newStatus = decision === 'Approved' ? CashAdvanceStatus.APPROVED : CashAdvanceStatus.REJECTED;
  ca.status = newStatus;
  if (decision === 'Approved') {
    ca.approvedAt = new Date().toISOString();
  } else {
    ca.approvedAt = undefined;
    ca.paidAmount = undefined;
  }
  addCaHistory(ca.id, oldStatus, newStatus, user.id, comment || `Cash Advance ${decision}`);

  sendEmail(
    ca.requestorId,
    `Cash Advance Request ${decision} - CADV-${ca.id.substring(0,6)}`,
    `Your Cash Advance request for PHP ${ca.amount} has been ${decision} by ${user.name}.${comment ? `\n\nComment: ${comment}` : ''}`
  );

  try {
    await persistCashAdvance(ca);
  } catch (err) {
    console.error('[db] Could not persist cash advance decision to Postgres:', err);
  }
  return { status: 200, body: ca };
}

export async function releaseCashAdvance(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user || user.role !== UserRole.CUSTODIAN) return { status: 403, body: { error: 'Forbidden: Only Custodians can release Cash Advances.' } };

  const ca = state.cashAdvances.find(c => c.id === id);
  if (!ca) return { status: 404, body: { error: 'Cash Advance not found' } };

  if (ca.status !== CashAdvanceStatus.APPROVED) {
    return { status: 400, body: { error: 'Only Approved Cash Advances can be released.' } };
  }

  const { releaseReference, releaseMethod } = body || {};
  if (!releaseReference) {
    return { status: 400, body: { error: 'Release Reference/Voucher is required.' } };
  }
  if (!releaseMethod || !state.systemSettings.paymentMethods.includes(releaseMethod)) {
    return { status: 400, body: { error: `Release method must be one of: ${state.systemSettings.paymentMethods.join(', ')}` } };
  }

  const oldStatus = ca.status;
  ca.status = CashAdvanceStatus.RELEASED;
  ca.releasedBy = user.id;
  ca.releaseDate = new Date().toISOString();
  ca.paidAmount = ca.amount;
  ca.releaseReference = releaseReference;
  ca.releaseMethod = releaseMethod;
  addCaHistory(ca.id, oldStatus, CashAdvanceStatus.RELEASED, user.id, `Released via ${releaseMethod} with Voucher Reference: ${releaseReference}`);

  sendEmail(
    ca.requestorId,
    `Cash Advance Released - CADV-${ca.id.substring(0,6)}`,
    `Your Cash Advance for PHP ${ca.amount} has been released by ${user.name}.\n\nRelease Reference: ${releaseReference}\n\nPlease file your liquidation within ${LIQUIDATION_DEADLINE_DAYS} days.`
  );

  try {
    await persistCashAdvance(ca);
  } catch (err) {
    console.error('[db] Could not persist cash advance release to Postgres:', err);
  }
  return { status: 200, body: ca };
}
