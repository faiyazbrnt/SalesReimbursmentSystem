import { v4 as uuidv4 } from 'uuid';
import {
  Claim, ClaimStatus, Approval, Mom, MomStatus, UserRole,
  CashAdvanceStatus, LiquidationStatus, ReviewMeeting, ReviewMeetingStatus,
  MinutesSource
} from '../../lib/db/serverTypes';
import { getOrCreateCompany } from '../../server/services/companyService';
import { state, checkCategoryLimits } from '../../server/state';
import { canAccessClaim } from '../../server/services/authorization';
import { isActiveDelegateFor, getActiveDelegation } from '../../server/services/delegations';
import { generateClaimNumber } from '../../server/services/claimNumber';
import { generateReleaseCode, resetReleaseCodeSecurity, timingSafeCodeEquals } from '../../server/services/releaseCode';
import { addHistory, addCaHistory, addLiqHistory } from '../../server/services/history';
import { sendEmail, notifyClientCcSent } from '../../server/services/notifications';
import {
  formatPHP, REIMBURSEMENT_CAP, RELEASE_CODE_MAX_ATTEMPTS,
  RELEASE_CODE_LOCKOUT_MINUTES, isFinanceVisibleFinancialRecord
} from '../../server/constants';
import { normalizeExpenseCategory } from '../../lib/expenseCategories';
import { getReimbursementDateError, getTodayIsoDate } from '../../features/claims/domain/reimbursementPolicy';
import { persistClaim, persistClaimWithLineItems, insertApproval } from '../../lib/db/coreLoopRepo';
import { persistCashAdvance, persistLiquidation } from '../../lib/db/cashAdvanceRepo';
import { persistReviewMeeting } from '../../lib/db/workflowExtrasRepo';
import { ensureUsersExistInDb } from '../../lib/db/usersRepo';

function findUser(userId: string | null) {
  if (!userId) return null;
  return state.users.find(u => u.id === userId || u.entra_object_id === userId || u.user_principal_name === userId) || null;
}

export function listClaims(userId: string | null, searchParams?: URLSearchParams) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  let filtered: Claim[] = [];
  if (user.role === UserRole.REQUESTOR) {
    filtered = state.claims.filter(c => c.requestor_id === user.id);
  } else if (user.role === UserRole.APPROVER) {
    filtered = state.claims.filter(c =>
      c.current_approver_id === user.id ||
      c.original_approver_id === user.id ||
      c.requestor_id === user.id ||
      isActiveDelegateFor(user.id, c.current_approver_id)
    );
  } else if (user.role === UserRole.CUSTODIAN) {
    filtered = state.claims.filter(c =>
      [ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED].includes(c.status) ||
      c.requestor_id === user.id
    );
  } else if (user.role === UserRole.FINANCE) {
    filtered = state.claims.filter(c => isFinanceVisibleFinancialRecord(c.claim_type || 'Reimbursement', c.status));
  } else if (user.role === UserRole.ADMIN) {
    filtered = state.claims;
  }

  const enriched = filtered.map(c => {
    const mom = state.moms.find(m => m.id === c.mom_id);
    const reqUser = state.users.find(u => u.id === c.requestor_id);
    const claimExpenses = state.expenses.filter(e => e.claim_id === c.id);
    const claimApprovals = state.approvals.filter(a => a.claim_id === c.id);
    const claimHistory = state.statusHistories.filter(h => h.claim_id === c.id).map(h => ({
      ...h,
      changedBy: state.users.find(u => u.id === h.changed_by)
    })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const reviewMeeting = state.reviewMeetings.find(rm => rm.claim_id === c.id);
    return { ...c, mom, requestor: reqUser, expenses: claimExpenses, approvals: claimApprovals, history: claimHistory, reviewMeeting };
  });

  const page = searchParams?.get('page');
  const pageSize = searchParams?.get('pageSize');
  const search = searchParams?.get('search');
  const status = searchParams?.get('status');

  let scoped = enriched;
  if (typeof status === 'string' && status.trim()) {
    scoped = scoped.filter(c => c.status === status);
  }
  if (typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    scoped = scoped.filter((c: any) =>
      [c.claim_number, c.mom?.purpose].some(v => (v || '').toString().toLowerCase().includes(q))
    );
  }

  if (page && pageSize) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.max(1, parseInt(pageSize, 10) || 25);
    const total = scoped.length;
    const items = scoped
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice((p - 1) * ps, p * ps);
    return { status: 200, body: { items, total, page: p, pageSize: ps } };
  }

  return { status: 200, body: enriched };
}

export function getClaim(userId: string | null, id: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const claim = state.claims.find(c => c.id === id);
  if (!claim) return { status: 404, body: { error: 'Not found' } };

  if (!canAccessClaim(user, claim)) return { status: 403, body: { error: 'Forbidden' } };

  const claimExpenses = state.expenses.filter(e => e.claim_id === claim.id);
  const claimApprovals = state.approvals.filter(a => a.claim_id === claim.id);
  const claimHistory = state.statusHistories.filter(h => h.claim_id === claim.id).map(h => ({
    ...h,
    changedBy: state.users.find(u => u.id === h.changed_by)
  })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const mom = state.moms.find(m => m.id === claim.mom_id);
  const requestor = state.users.find(u => u.id === claim.requestor_id);
  const reviewMeeting = state.reviewMeetings.find(rm => rm.claim_id === claim.id);

  return {
    status: 200,
    body: {
      ...claim,
      expenses: claimExpenses,
      approvals: claimApprovals,
      history: claimHistory,
      mom,
      requestor,
      reviewMeeting
    }
  };
}

export async function createClaim(userId: string | null, body: any) {
  const user = findUser(userId);
  if (!user || !user.reports_to) {
    return { status: 403, body: { error: 'Forbidden: You must have a designated manager (reports_to) to submit.' } };
  }

  const { claim_type, mom_id, mom: momPayload, expense_category, total_amount, receipt_url, or_number, expense_date, remarks, supporting_documents, line_items, is_draft } = body || {};
  const claimType = claim_type === 'Transport Reimbursement' ? 'Transport Reimbursement' : 'Reimbursement';
  const isTransportReimbursement = claimType === 'Transport Reimbursement';

  let mom: Mom | undefined;
  if (momPayload && typeof momPayload === 'object') {
    if (!is_draft && (!momPayload.client || !momPayload.purpose)) {
      return { status: 400, body: { error: 'Client and Purpose are required for Minutes of Meeting.' } };
    }
    const newMomId = uuidv4();
    mom = {
      id: newMomId,
      claim_id: undefined,
      requestor_id: user.id,
      document_type: momPayload.document_type === 'LOA' || momPayload.documentType === 'LOA' ? 'LOA' : 'MoM',
      client: momPayload.client || (is_draft ? 'Draft Client' : ''),
      contact_person: momPayload.contact_person || momPayload.contactPerson || '',
      contact_person_email: momPayload.contact_person_email || momPayload.contactPersonEmail || '',
      cc_client: Boolean(momPayload.cc_client ?? momPayload.ccClient),
      meeting_date: momPayload.meeting_date || momPayload.meetingDate || new Date().toISOString().split('T')[0],
      meeting_time: momPayload.meeting_time || momPayload.meetingTime || '',
      location: momPayload.location || '',
      purpose: momPayload.purpose || (is_draft ? 'Draft Meeting' : ''),
      discussion: momPayload.discussion || '',
      agreements: momPayload.agreements || '',
      action_items: momPayload.action_items || momPayload.actionItems || '',
      prepared_by: user.name,
      prepared_by_department: user.department,
      prepared_by_job_title: user.job_title,
      file_url: momPayload.file_url,
      file_name: momPayload.file_name,
      status: is_draft ? MomStatus.DRAFT : MomStatus.COMPLETED,
      created_at: new Date().toISOString(),
      minutes_source: momPayload.minutes_source || MinutesSource.TEMPLATE,
      meeting_type: momPayload.meeting_type || '',
      participants_internal: momPayload.participants_internal || '',
      participants_external: momPayload.participants_external || '',
      custom_fields: momPayload.custom_fields || undefined,
    };
    if (mom.client) {
      await getOrCreateCompany(mom.client, user.id);
    }
    state.moms.push(mom);
  } else if (mom_id) {
    mom = state.moms.find(m => m.id === mom_id);
    if (!mom) return { status: 400, body: { error: 'Minutes of Meeting (MOM) not found.' } };
    if (!is_draft && mom.status !== MomStatus.COMPLETED) {
      return { status: 400, body: { error: 'Cannot attach an incomplete or draft Minutes of Meeting.' } };
    }
    if (mom.claim_id) {
      return { status: 400, body: { error: 'This Minutes of Meeting is already linked to another claim and cannot be reused.' } };
    }
  } else if (!is_draft && !isTransportReimbursement) {
    return { status: 400, body: { error: 'Minutes of Meeting (MOM) is required.' } };
  }

  let itemsToCreate: any[] = [];
  let claimTotal = 0;
  let mainCategory = normalizeExpenseCategory(expense_category || 'Multiple Categories');
  let mainReceipt = receipt_url || '';

  if (line_items && Array.isArray(line_items) && line_items.length > 0) {
    for (const [index, item] of line_items.entries()) {
      if (!is_draft && !item.category) return { status: 400, body: { error: 'Each expense must have a category.' } };
      const numericAmount = Number(item.amount);
      if (!is_draft) {
        if (isNaN(numericAmount) || numericAmount <= 0) return { status: 400, body: { error: 'Each expense amount must be a valid number greater than zero.' } };
        if (!item.receipt_url) return { status: 400, body: { error: 'Each expense must have a receipt.' } };
        const dateError = getReimbursementDateError(item.expense_date, getTodayIsoDate());
        if (dateError) return { status: 400, body: { error: `Expense row ${index + 1}: ${dateError}` } };
      }

      const validAmount = isNaN(numericAmount) || numericAmount < 0 ? 0 : numericAmount;
      itemsToCreate.push({
        category: normalizeExpenseCategory(item.category || 'Other'),
        amount: validAmount,
        receipt_url: item.receipt_url || '',
        or_number: item.or_number || '',
        vendor: item.vendor || '',
        expense_date: item.expense_date || getTodayIsoDate(),
        payment_method: item.payment_method || '',
        business_purpose: item.business_purpose || remarks ||
          (isTransportReimbursement ? 'Business transport reimbursement' : `Sales reimbursement for meeting with ${mom?.client || 'client'}`)
      });
      claimTotal += validAmount;
    }
    mainCategory = itemsToCreate.length === 1 ? itemsToCreate[0].category : 'Multiple Categories';
    mainReceipt = itemsToCreate[0]?.receipt_url || '';
  } else {
    if (!is_draft) {
      const dateError = getReimbursementDateError(expense_date, getTodayIsoDate());
      if (dateError) return { status: 400, body: { error: dateError } };
      if (!expense_category) return { status: 400, body: { error: 'Expense Category is required.' } };
      if (total_amount === undefined || total_amount === null || total_amount === '') {
        return { status: 400, body: { error: 'Expense amount is required.' } };
      }
      const numericAmount = Number(total_amount);
      if (isNaN(numericAmount)) {
        return { status: 400, body: { error: 'Expense amount must be a valid number.' } };
      }
      if (numericAmount <= 0) {
        return { status: 400, body: { error: 'Expense amount must be greater than zero.' } };
      }
      if (!receipt_url) return { status: 400, body: { error: 'Receipt image or PDF is required.' } };

      itemsToCreate.push({
        category: normalizeExpenseCategory(expense_category),
        amount: numericAmount,
        receipt_url: receipt_url,
        or_number: or_number,
        expense_date,
        business_purpose: remarks ||
          (isTransportReimbursement ? 'Business transport reimbursement' : `Sales reimbursement for meeting with ${mom?.client || 'client'}`)
      });
      claimTotal = numericAmount;
      mainCategory = normalizeExpenseCategory(expense_category);
      mainReceipt = receipt_url;
    } else {
      const numericAmount = Number(total_amount) || 0;
      itemsToCreate.push({
        category: normalizeExpenseCategory(expense_category || 'Other'),
        amount: numericAmount,
        receipt_url: receipt_url || '',
        or_number: or_number || '',
        expense_date: expense_date || getTodayIsoDate(),
        business_purpose: remarks || (isTransportReimbursement ? 'Business transport reimbursement' : 'Draft reimbursement')
      });
      claimTotal = numericAmount;
      mainCategory = normalizeExpenseCategory(expense_category || 'Other');
      mainReceipt = receipt_url || '';
    }
  }

  if (itemsToCreate.length === 0 && is_draft) {
    itemsToCreate.push({
      category: 'Other',
      amount: 0,
      receipt_url: '',
      or_number: '',
      expense_date: getTodayIsoDate(),
      business_purpose: remarks || (isTransportReimbursement ? 'Business transport reimbursement' : 'Draft reimbursement')
    });
    mainCategory = 'Other';
    mainReceipt = '';
  }

  if (!is_draft) {
    const policyError = checkCategoryLimits(itemsToCreate);
    if (policyError) return { status: 400, body: { error: policyError } };
  }

  const claimId = uuidv4();
  const claimNumber = await generateClaimNumber();

  for (const item of itemsToCreate) {
    state.expenses.push({
      id: uuidv4(),
      claim_id: claimId,
      expense_date: item.expense_date || mom?.meeting_date || new Date().toISOString().split('T')[0],
      vendor: item.vendor || mom?.client || (isTransportReimbursement ? 'Transport Provider' : 'Client Meeting'),
      category: item.category,
      amount: item.amount,
      payment_method: item.payment_method || 'Cash',
      business_purpose: item.business_purpose,
      receipt_url: item.receipt_url,
      or_number: item.or_number
    });
  }

  let originalApproverId: string | undefined = undefined;
  let currentApproverId = user.reports_to || '';

  if (user.reports_to) {
    const activeDelegation = getActiveDelegation(user.reports_to);
    if (activeDelegation) {
      originalApproverId = user.reports_to;
      currentApproverId = activeDelegation.delegate_id;
    }
  }

  // Claims reference both the requestor and approver. Insert only missing
  // principals so submitting a claim never overwrites existing user records.
  const approver = state.users.find(candidate => candidate.id === currentApproverId);
  await ensureUsersExistInDb([user, ...(approver ? [approver] : [])]);

  const claim: Claim = {
    id: claimId,
    claim_number: claimNumber,
    requestor_id: user.id,
    current_approver_id: currentApproverId,
    original_approver_id: originalApproverId,
    mom_id: mom?.id || mom_id || undefined,
    claim_type: claimType,
    status: is_draft ? ClaimStatus.DRAFT : ClaimStatus.PENDING_APPROVAL,
    total_amount: claimTotal,
    expense_category: mainCategory,
    receipt_url: mainReceipt,
    remarks,
    supporting_documents,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    flagged_high_value: itemsToCreate.some(item => item.amount > state.systemSettings.highValueThreshold)
  };

  state.claims.push(claim);
  if (mom) mom.claim_id = claimId;

  try {
    await persistClaimWithLineItems(claim, state.expenses.filter(e => e.claim_id === claim.id), mom ? [mom] : []);
  } catch (err) {
    console.error('[db] Could not persist new claim to Postgres:', err);
    state.expenses = state.expenses.filter(expense => expense.claim_id !== claim.id);
    state.claims = state.claims.filter(candidate => candidate.id !== claim.id);
    if (mom?.claim_id === claim.id) {
      if (momPayload) state.moms = state.moms.filter(candidate => candidate.id !== mom?.id);
      else mom.claim_id = undefined;
    }
    return { status: 500, body: { error: 'Could not save reimbursement. Please try again.' } };
  }

  addHistory(
    claim.id,
    ClaimStatus.DRAFT,
    claim.status,
    user.id,
    is_draft ? 'Draft saved by requestor' : `${claimType} filed and received by the system`
  );

  if (!is_draft && originalApproverId && currentApproverId !== originalApproverId) {
    const origName = state.users.find(u => u.id === originalApproverId)?.name || originalApproverId;
    const delegateName = state.users.find(u => u.id === currentApproverId)?.name || currentApproverId;

    state.statusHistories.push({
      id: uuidv4(),
      claim_id: claim.id,
      old_status: ClaimStatus.DRAFT,
      new_status: ClaimStatus.PENDING_APPROVAL,
      changed_by: user.id,
      reason: `Auto-routed to delegate ${delegateName} (on behalf of ${origName})`,
      timestamp: new Date().toISOString()
    });
  }

  if (!is_draft && currentApproverId) {
    const approver = state.users.find(u => u.id === currentApproverId);
    const approverName = approver ? approver.name : 'Approver';

    const emailSubject = `${claimType} Submitted - ${claimNumber}`;
    const emailBody = `A new ${claimType.toLowerCase()} request ${claimNumber} by ${user.name} has been submitted and is awaiting your review and approval.

Reference:
${claimNumber}

Required Action:
Please log in to the system and navigate to the Approval Queue to approve or reject this claim.`;

    sendEmail(currentApproverId, emailSubject, emailBody, undefined, { eventKey: 'submitted' });

    sendEmail(
      user.id,
      `${claimType} Submitted - ${claimNumber}`,
      `Your ${claimType.toLowerCase()} request ${claimNumber} for PHP ${claimTotal} has been successfully submitted and routed to ${approverName} for review.

Reference:
${claimNumber}

You'll receive another email as soon as ${approverName} makes a decision.`,
      undefined,
      { eventKey: 'submitted' }
    );

    if (mom?.cc_client && mom.contact_person_email) {
      sendEmail(
        mom.contact_person_email,
        `Copy: ${claimType} Submitted - ${claimNumber}`,
        `${user.name} submitted ${claimNumber}, which references the meeting with ${mom.client || 'your organization'}. This is a courtesy copy requested by the filer.`,
        undefined,
        { plain: true, recipientName: mom.contact_person || undefined, fromLabel: `${user.name} via Sales Reimbursement System` }
      );
      notifyClientCcSent({
        recipientIds: [user.id, currentApproverId],
        claimNumber,
        clientName: mom.contact_person,
        clientEmail: mom.contact_person_email,
        eventLabel: 'Submission',
      });
    }
  }

  return { status: 200, body: { ...claim, mom } };
}

export async function resubmitClaim(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const claim = state.claims.find(c => c.id === id && c.requestor_id === user.id);
  if (!claim) return { status: 404, body: { error: 'Claim not found' } };
  if (claim.status !== ClaimStatus.RETURNED && claim.status !== ClaimStatus.DRAFT) {
    return { status: 400, body: { error: 'Only a claim that has been Returned or is a Draft can be revised and submitted.' } };
  }

  const { mom_id, claim_type, expense_category, total_amount, receipt_url, or_number, expense_date, remarks, supporting_documents, line_items } = body || {};
  const claimType = claim_type === 'Transport Reimbursement' || claim.claim_type === 'Transport Reimbursement'
    ? 'Transport Reimbursement'
    : 'Reimbursement';
  const isTransportReimbursement = claimType === 'Transport Reimbursement';

  if (!isTransportReimbursement && !mom_id) return { status: 400, body: { error: 'Minutes of Meeting (MOM) is required.' } };
  const mom = mom_id ? state.moms.find(m => m.id === mom_id) : undefined;
  if (mom_id && !mom) return { status: 400, body: { error: 'Minutes of Meeting (MOM) not found.' } };
  if (mom && mom.status !== MomStatus.COMPLETED) {
    return { status: 400, body: { error: 'Cannot attach an incomplete or draft Minutes of Meeting.' } };
  }
  if (mom?.claim_id && mom.claim_id !== claim.id) {
    const linkedClaim = state.claims.find(c => c.id === mom.claim_id);
    const linkedNumber = linkedClaim?.claim_number || (mom.claim_id ? `REIM-${mom.claim_id.substring(0, 6)}` : 'another claim');
    return { status: 400, body: { error: `This MOM is already linked to claim ${linkedNumber}.` } };
  }

  let itemsToCreate: any[] = [];
  let claimTotal = 0;
  let mainCategory = normalizeExpenseCategory(expense_category || 'Multiple Categories');
  let mainReceipt = receipt_url || '';

  if (line_items && Array.isArray(line_items) && line_items.length > 0) {
    for (const [index, item] of line_items.entries()) {
      if (!item.category) return { status: 400, body: { error: 'Each expense must have a category.' } };
      const numericAmount = Number(item.amount);
      if (isNaN(numericAmount) || numericAmount <= 0) return { status: 400, body: { error: 'Each expense amount must be a valid number greater than zero.' } };
      if (!item.receipt_url) return { status: 400, body: { error: 'Each expense must have a receipt.' } };
      const dateError = getReimbursementDateError(item.expense_date, getTodayIsoDate());
      if (dateError) return { status: 400, body: { error: `Expense row ${index + 1}: ${dateError}` } };

      itemsToCreate.push({
        category: normalizeExpenseCategory(item.category),
        amount: numericAmount,
        receipt_url: item.receipt_url,
        or_number: item.or_number,
        vendor: item.vendor,
        expense_date: item.expense_date,
        payment_method: item.payment_method,
        business_purpose: item.business_purpose || remarks ||
          (isTransportReimbursement ? 'Business transport reimbursement' : `Sales reimbursement for meeting with ${mom?.client || 'client'}`)
      });
      claimTotal += numericAmount;
    }
    mainCategory = itemsToCreate.length === 1 ? itemsToCreate[0].category : 'Multiple Categories';
    mainReceipt = itemsToCreate[0].receipt_url;
  } else {
    const dateError = getReimbursementDateError(expense_date, getTodayIsoDate());
    if (dateError) return { status: 400, body: { error: dateError } };
    if (!expense_category) return { status: 400, body: { error: 'Expense Category is required.' } };
    if (total_amount === undefined || total_amount === null || total_amount === '') {
      return { status: 400, body: { error: 'Expense amount is required.' } };
    }
    const numericAmount = Number(total_amount);
    if (isNaN(numericAmount)) {
      return { status: 400, body: { error: 'Expense amount must be a valid number.' } };
    }
    if (numericAmount <= 0) {
      return { status: 400, body: { error: 'Expense amount must be greater than zero.' } };
    }
    if (!receipt_url) return { status: 400, body: { error: 'Receipt image or PDF is required.' } };

    itemsToCreate.push({
      category: normalizeExpenseCategory(expense_category),
      amount: numericAmount,
      receipt_url: receipt_url,
      or_number: or_number,
      expense_date,
      business_purpose: remarks ||
        (isTransportReimbursement ? 'Business transport reimbursement' : `Sales reimbursement for meeting with ${mom?.client || 'client'}`)
    });
    claimTotal = numericAmount;
    mainCategory = normalizeExpenseCategory(expense_category);
    mainReceipt = receipt_url;
  }

  const policyError = checkCategoryLimits(itemsToCreate);
  if (policyError) return { status: 400, body: { error: policyError } };

  let unlinkedOldMom: Mom | undefined;
  if (claim.mom_id !== mom_id) {
    unlinkedOldMom = state.moms.find(m => m.id === claim.mom_id);
    if (unlinkedOldMom) unlinkedOldMom.claim_id = undefined;
  }
  if (mom) mom.claim_id = claim.id;

  for (let i = state.expenses.length - 1; i >= 0; i--) {
    if (state.expenses[i].claim_id === claim.id) {
      state.expenses.splice(i, 1);
    }
  }
  for (const item of itemsToCreate) {
    state.expenses.push({
      id: uuidv4(),
      claim_id: claim.id,
      expense_date: item.expense_date || mom?.meeting_date || new Date().toISOString().split('T')[0],
      vendor: item.vendor || mom?.client || (isTransportReimbursement ? 'Transport Provider' : 'Client Meeting'),
      category: item.category,
      amount: item.amount,
      payment_method: item.payment_method || 'Cash',
      business_purpose: item.business_purpose,
      receipt_url: item.receipt_url,
      or_number: item.or_number
    });
  }

  const oldStatus = claim.status;
  claim.mom_id = mom_id || undefined;
  claim.claim_type = claimType;
  claim.expense_category = mainCategory;
  claim.total_amount = claimTotal;
  claim.approved_amount = undefined;
  claim.paid_amount = undefined;
  claim.approved_at = undefined;
  claim.paid_at = undefined;
  claim.receipt_url = mainReceipt;
  claim.remarks = remarks;
  claim.supporting_documents = supporting_documents;
  claim.status = ClaimStatus.PENDING_APPROVAL;
  claim.updated_at = new Date().toISOString();
  claim.flagged_high_value = itemsToCreate.some(item => item.amount > state.systemSettings.highValueThreshold);

  const actionDescription = oldStatus === ClaimStatus.DRAFT
    ? 'Completed and submitted by requestor from draft'
    : 'Revised and resubmitted by requestor after being returned';
  addHistory(claim.id, oldStatus, ClaimStatus.PENDING_APPROVAL, user.id, actionDescription);

  const claimNumber = claim.claim_number || `REIM-${claim.id.substring(0, 6)}`;

  if (claim.current_approver_id) {
    const approverName = state.users.find(u => u.id === claim.current_approver_id)?.name || 'Approver';

    const emailSubject = oldStatus === ClaimStatus.DRAFT
      ? `Reimbursement Submitted - ${claimNumber}`
      : `Reimbursement Resubmitted - ${claimNumber}`;
    const emailBody = oldStatus === ClaimStatus.DRAFT
      ? `A reimbursement request ${claimNumber} by ${user.name} has been submitted and is awaiting your review and approval.

Reference:
${claimNumber}

Required Action:
Please log in to the system and navigate to the Approval Queue to approve or reject this claim.`
      : `A previously returned reimbursement request ${claimNumber} by ${user.name} has been revised and resubmitted, and is awaiting your review and approval.

Reference:
${claimNumber}

Required Action:
Please log in to the system and navigate to the Approval Queue to approve or reject this claim.`;
    sendEmail(claim.current_approver_id, emailSubject, emailBody, undefined, { eventKey: 'submitted' });

    sendEmail(
      user.id,
      emailSubject,
      oldStatus === ClaimStatus.DRAFT
        ? `Your reimbursement claim ${claimNumber} for ${formatPHP(claimTotal)} has been successfully submitted and routed to ${approverName} for review.

Reference:
${claimNumber}

You'll receive another email as soon as ${approverName} makes a decision.`
        : `Your revised reimbursement claim ${claimNumber} has been successfully resubmitted and routed to ${approverName} for review.

Reference:
${claimNumber}

You'll receive another email as soon as ${approverName} makes a decision.`,
      undefined,
      { eventKey: 'submitted' }
    );
  }

  try {
    const momsToBackfill = [unlinkedOldMom, mom].filter((m): m is NonNullable<typeof m> => !!m);
    await persistClaimWithLineItems(claim, state.expenses.filter(e => e.claim_id === claim.id), momsToBackfill);
  } catch (err) {
    console.error('[db] Could not persist resubmitted claim to Postgres:', err);
  }

  return { status: 200, body: claim };
}

export async function deleteDraftClaim(userId: string | null, claimId: string) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const claimIndex = state.claims.findIndex(c => c.id === claimId);
  if (claimIndex === -1) return { status: 404, body: { error: 'Claim not found' } };

  const claim = state.claims[claimIndex];
  if (claim.requestor_id !== user.id && user.role !== UserRole.ADMIN) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  if (claim.status !== ClaimStatus.DRAFT) {
    return { status: 400, body: { error: 'Only draft claims can be deleted.' } };
  }

  if (claim.mom_id) {
    const mom = state.moms.find(m => m.id === claim.mom_id);
    if (mom && mom.claim_id === claim.id) {
      mom.claim_id = undefined;
    }
  }

  for (let i = state.expenses.length - 1; i >= 0; i--) {
    if (state.expenses[i].claim_id === claim.id) {
      state.expenses.splice(i, 1);
    }
  }

  for (let i = state.statusHistories.length - 1; i >= 0; i--) {
    if (state.statusHistories[i].claim_id === claim.id) {
      state.statusHistories.splice(i, 1);
    }
  }

  state.claims.splice(claimIndex, 1);

  return { status: 200, body: { message: 'Draft deleted successfully.' } };
}

export async function approveClaim(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const claim = state.claims.find(c => c.id === id);
  if (!claim) return { status: 404, body: { error: 'Not found' } };

  if (claim.requestor_id === user.id) {
    return { status: 403, body: { error: 'Segregation of Duties: You cannot approve your own reimbursement claim.' } };
  }

  const requestor = state.users.find(u => u.id === claim.requestor_id);
  if (
    claim.current_approver_id !== user.id &&
    claim.original_approver_id !== user.id &&
    !isActiveDelegateFor(user.id, claim.current_approver_id)
  ) {
    return { status: 403, body: { error: 'Not your direct report' } };
  }

  if (claim.status !== ClaimStatus.PENDING_APPROVAL) {
    return { status: 409, body: { error: `This claim is "${claim.status}" and is no longer awaiting an approval decision.` } };
  }

  const { decision, comment, review_meeting_date, review_meeting_time } = body || {};
  if (!['Approved', 'Rejected', 'Returned'].includes(decision)) return { status: 400, body: { error: 'Invalid decision' } };
  if ((decision === 'Rejected' || decision === 'Returned') && !comment) {
    return { status: 400, body: { error: 'Comment required' } };
  }
  if (Boolean(review_meeting_date) !== Boolean(review_meeting_time)) {
    return { status: 400, body: { error: 'Provide both a review meeting date and time, or leave both blank.' } };
  }
  if (review_meeting_date && decision === 'Approved') {
    return { status: 400, body: { error: 'A review meeting can only be scheduled when returning or rejecting a claim.' } };
  }
  if (review_meeting_date) {
    const hasConflict = state.reviewMeetings.some(rm =>
      rm.approver_id === user.id &&
      [ReviewMeetingStatus.PENDING_CONFIRMATION, ReviewMeetingStatus.CONFIRMED].includes(rm.status) &&
      rm.meeting_date === review_meeting_date &&
      rm.meeting_time === review_meeting_time
    );
    if (hasConflict) {
      return { status: 409, body: { error: 'You already have a review meeting scheduled at that date and time.' } };
    }
  }

  const oldStatus = claim.status;
  let newStatus: ClaimStatus = claim.status;

  if (decision === 'Approved') newStatus = ClaimStatus.PROCESSING;
  else if (decision === 'Rejected') newStatus = ClaimStatus.REJECTED;
  else if (decision === 'Returned') newStatus = ClaimStatus.RETURNED;

  claim.status = newStatus;
  claim.updated_at = new Date().toISOString();

  const newApproval: Approval = {
    id: uuidv4(),
    claim_id: claim.id,
    approver_id: user.id,
    decision,
    comment: comment || '',
    timestamp: new Date().toISOString()
  };
  state.approvals.push(newApproval);

  addHistory(claim.id, oldStatus, newStatus, user.id, comment || undefined);

  let newReviewMeeting: ReviewMeeting | undefined;
  if (review_meeting_date && review_meeting_time) {
    newReviewMeeting = {
      id: uuidv4(),
      claim_id: claim.id,
      requestor_id: claim.requestor_id,
      approver_id: user.id,
      meeting_date: review_meeting_date,
      meeting_time: review_meeting_time,
      status: ReviewMeetingStatus.CONFIRMED,
      created_at: new Date().toISOString()
    };
    state.reviewMeetings.push(newReviewMeeting);
    addHistory(
      claim.id,
      newStatus,
      newStatus,
      user.id,
      `Review meeting scheduled for ${review_meeting_date} at ${review_meeting_time}`
    );
  }

  const claimNumber = claim.claim_number || `REIM-${claim.id.substring(0,6)}`;

  if (decision === 'Approved') {
    claim.approved_at = new Date().toISOString();
    claim.approved_amount = Math.min(claim.total_amount, REIMBURSEMENT_CAP);

    const approvedSubject = `Approved - ${claimNumber}`;
    const approvedBody = `Your reimbursement request ${claimNumber} has been approved by ${user.name}. It has been forwarded to the Custodian for processing and payment release.

Claimed amount: ${formatPHP(claim.total_amount)}
Approved reimbursement: ${formatPHP(claim.approved_amount)}${claim.total_amount > REIMBURSEMENT_CAP ? ` (capped at ${formatPHP(REIMBURSEMENT_CAP)})` : ''}

Reference:
${claimNumber}`;
    sendEmail(claim.requestor_id, approvedSubject, approvedBody, undefined, { eventKey: 'approved' });

    const custodians = state.users.filter(u => u.role === UserRole.CUSTODIAN);
    custodians.forEach(c => {
      const custodianSubject = `Reimbursement Processing Required - ${claimNumber}`;
      const custodianBody = `Reimbursement request ${claimNumber} submitted by ${requestor?.name || 'Requestor'} and approved by ${user.name} is now in your processing queue.

Reference:
${claimNumber}

Required Action:
Please generate the Claim Code, release the payment, and mark it as Ready for Claim.`;
      sendEmail(c.id, custodianSubject, custodianBody);
    });
  } else {
    claim.approved_at = undefined;
    claim.approved_amount = undefined;
    claim.paid_at = undefined;
    claim.paid_amount = undefined;
    const actionText = decision === 'Returned' ? 'Please revise and resubmit your claim.' : 'No action required.';
    const meetingText = review_meeting_date && review_meeting_time
      ? `\n\nReview Meeting:\n${review_meeting_date} at ${review_meeting_time}`
      : '';
    const emailSubject = `Reimbursement ${decision} - ${claimNumber}`;
    const emailBody = `Your reimbursement request ${claimNumber} has been ${decision.toLowerCase()} by ${user.name}.

Reason:
${comment}${meetingText}

Reference:
${claimNumber}

Required Action:
${actionText}`;
    sendEmail(claim.requestor_id, emailSubject, emailBody, undefined,
      decision === 'Returned' ? { eventKey: 'returned' } : undefined);
  }

  const claimMom = claim.mom_id ? state.moms.find(candidate => candidate.id === claim.mom_id) : undefined;
  if (claimMom?.cc_client && claimMom.contact_person_email) {
    sendEmail(
      claimMom.contact_person_email,
      `Copy: Reimbursement ${decision} - ${claimNumber}`,
      `${claimNumber}, filed by ${requestor?.name || 'the requestor'}, was ${decision.toLowerCase()}.${comment ? `\n\nComment: ${comment}` : ''}`,
      undefined,
      { plain: true, recipientName: claimMom.contact_person || undefined, fromLabel: `${user.name} via Sales Reimbursement System` }
    );
    notifyClientCcSent({
      recipientIds: [claim.requestor_id, user.id],
      claimNumber,
      clientName: claimMom.contact_person,
      clientEmail: claimMom.contact_person_email,
      eventLabel: decision,
    });
  }

  try {
    await persistClaim(claim);
    await insertApproval(newApproval);
    if (newReviewMeeting) await persistReviewMeeting(newReviewMeeting);
  } catch (err) {
    console.error('[db] Could not persist approval decision to Postgres:', err);
  }

  return { status: 200, body: claim };
}

export async function transferClaimApprover(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const claim = state.claims.find(c => c.id === id);
  if (!claim) return { status: 404, body: { error: 'Not found' } };

  const isCurrentApprover = claim.current_approver_id === user.id;
  const isAdmin = user.role === UserRole.ADMIN;
  if (!isCurrentApprover && !isAdmin) return { status: 403, body: { error: 'Forbidden' } };

  const targetApproverId = body?.to || claim.pending_transfer_to;
  if (!targetApproverId) return { status: 400, body: { error: 'No target approver specified.' } };
  const newApprover = state.users.find(u => u.id === targetApproverId);
  if (!newApprover) return { status: 404, body: { error: 'Target approver not found.' } };

  const oldApprover = state.users.find(u => u.id === claim.current_approver_id);
  const claimNumber = claim.claim_number || `REIM-${claim.id.substring(0, 6)}`;

  claim.current_approver_id = targetApproverId;
  claim.approver_stale_since = null;
  claim.pending_transfer_to = null;
  claim.approver_stale_reason = undefined;
  claim.escalated_to_admin = false;
  claim.updated_at = new Date().toISOString();

  addHistory(claim.id, claim.status, claim.status, user.id,
    `Approver transferred from ${oldApprover?.name || '(unknown)'} to ${newApprover.name} — org change`);

  sendEmail(targetApproverId, `Reimbursement now assigned to you - ${claimNumber}`,
    `${claimNumber} has been transferred to you for review following an organizational change.`);

  try {
    await persistClaim(claim);
  } catch (err) {
    console.error('[db] Could not persist approver transfer to Postgres:', err);
  }
  return { status: 200, body: claim };
}

export async function custodianClaimDecision(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user || user.role !== UserRole.CUSTODIAN) {
    return { status: 403, body: { error: 'Forbidden: Only Custodians can make processing decisions.' } };
  }

  const { decision, comment } = (body || {}) as { decision?: 'Return' | 'Reject'; comment?: string };
  if (decision !== 'Return' && decision !== 'Reject') {
    return { status: 400, body: { error: 'Decision must be Return or Reject.' } };
  }
  if (!comment?.trim()) {
    return { status: 400, body: { error: 'A reason is required so the requestor and audit trail are clear.' } };
  }

  const claim = state.claims.find(item => item.id === id);
  const cashAdvance = state.cashAdvances.find(item => item.id === id);
  const liquidation = state.liquidations.find(item => item.id === id);
  const now = new Date().toISOString();

  if (claim) {
    if (![ClaimStatus.APPROVED, ClaimStatus.PROCESSING].includes(claim.status)) {
      return { status: 400, body: { error: 'Only approved or processing reimbursements can be returned or rejected by the Custodian.' } };
    }
    const oldStatus = claim.status;
    const newStatus = decision === 'Return' ? ClaimStatus.RETURNED : ClaimStatus.REJECTED;
    claim.status = newStatus;
    claim.updated_at = now;
    claim.processing_date = undefined;
    claim.processed_by = undefined;
    claim.release_code = undefined;
    claim.release_code_expires_at = undefined;
    claim.release_code_attempts = 0;
    claim.release_code_locked_until = undefined;
    addHistory(claim.id, oldStatus, newStatus, user.id, `Custodian ${decision.toLowerCase()}: ${comment.trim()}`);

    const claimNumber = claim.claim_number || `REIM-${claim.id.substring(0, 6)}`;
    sendEmail(
      claim.requestor_id,
      `Reimbursement ${decision === 'Return' ? 'Returned for Revision' : 'Rejected'} - ${claimNumber}`,
      `${user.name} ${decision === 'Return' ? 'returned' : 'rejected'} ${claimNumber} during payment processing.\n\nReason: ${comment.trim()}`
    );
    if (claim.current_approver_id) {
      sendEmail(
        claim.current_approver_id,
        `Custodian ${decision} - ${claimNumber}`,
        `${user.name} ${decision.toLowerCase()}ed ${claimNumber} during payment processing.\n\nReason: ${comment.trim()}`
      );
    }
    try {
      await persistClaim(claim);
    } catch (err) {
      console.error('[db] Could not persist custodian decision to Postgres:', err);
    }
    return { status: 200, body: claim };
  }

  if (cashAdvance) {
    if (decision !== 'Reject') {
      return { status: 400, body: { error: 'Approved Cash Advances can be rejected before release, but they do not have a return-for-revision state.' } };
    }
    if (cashAdvance.status !== CashAdvanceStatus.APPROVED) {
      return { status: 400, body: { error: 'Only an Approved Cash Advance can be rejected before release.' } };
    }
    const oldStatus = cashAdvance.status;
    cashAdvance.status = CashAdvanceStatus.REJECTED;
    addCaHistory(cashAdvance.id, oldStatus, CashAdvanceStatus.REJECTED, user.id, `Custodian rejected before release: ${comment.trim()}`);
    sendEmail(
      cashAdvance.requestorId,
      `Cash Advance Rejected - CADV-${cashAdvance.id.substring(0, 6)}`,
      `${user.name} rejected this Cash Advance before funds were released.\n\nReason: ${comment.trim()}`
    );
    try {
      await persistCashAdvance(cashAdvance);
    } catch (err) {
      console.error('[db] Could not persist custodian cash advance decision to Postgres:', err);
    }
    return { status: 200, body: cashAdvance };
  }

  if (liquidation) {
    if (decision !== 'Return') {
      return { status: 400, body: { error: 'A reviewed Liquidation can be returned for correction, but it cannot be rejected after the Cash Advance was released.' } };
    }
    if (liquidation.status !== LiquidationStatus.REVIEWED || liquidation.varianceType !== 'RefundDue') {
      return { status: 400, body: { error: 'Only a reviewed Liquidation awaiting refund collection can be returned.' } };
    }
    const oldStatus = liquidation.status;
    liquidation.status = LiquidationStatus.RETURNED_FOR_REVISION;
    addLiqHistory(liquidation.id, oldStatus, LiquidationStatus.RETURNED_FOR_REVISION, user.id, `Custodian returned before refund collection: ${comment.trim()}`);
    sendEmail(
      liquidation.requestorId,
      `Liquidation Returned - LIQ-${liquidation.id.substring(0, 6)}`,
      `${user.name} returned this Liquidation for correction before refund collection.\n\nReason: ${comment.trim()}`
    );
    try {
      await persistLiquidation(liquidation);
    } catch (err) {
      console.error('[db] Could not persist custodian liquidation decision to Postgres:', err);
    }
    return { status: 200, body: liquidation };
  }

  return { status: 404, body: { error: 'Processing record not found.' } };
}

export async function generateClaimCode(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user || user.role !== UserRole.CUSTODIAN) return { status: 403, body: { error: 'Forbidden' } };

  const claim = state.claims.find(c => c.id === id);
  if (!claim) return { status: 404, body: { error: 'Claim not found' } };

  if (![ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM].includes(claim.status)) {
    return { status: 409, body: { error: `A claim code can only be generated for a claim in Processing or Ready for Claim (this one is "${claim.status}").` } };
  }

  const { code } = body || {};
  const isRegen = !!claim.release_code;
  claim.release_code = code || generateReleaseCode();
  resetReleaseCodeSecurity(claim);

  addHistory(claim.id, claim.status, claim.status, user.id, isRegen ? `Regenerated Claim Code to ${claim.release_code}` : `Generated Claim Code ${claim.release_code}`);

  try {
    await persistClaim(claim);
  } catch (err) {
    console.error('[db] Could not persist claim code to Postgres:', err);
  }
  return { status: 200, body: claim };
}

export async function markReadyForClaim(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user || user.role !== UserRole.CUSTODIAN) return { status: 403, body: { error: 'Forbidden' } };

  const claim = state.claims.find(c => c.id === id);
  if (!claim) return { status: 404, body: { error: 'Claim not found' } };

  if (claim.status !== ClaimStatus.PROCESSING) {
    return { status: 409, body: { error: `Only a claim in Processing can be marked Ready for Claim (this one is "${claim.status}").` } };
  }

  if (!claim.release_code) {
    claim.release_code = generateReleaseCode();
    resetReleaseCodeSecurity(claim);
  }

  const { payment_method } = body || {};
  const isReimbursement = claim.claim_type === 'Reimbursement' || claim.claim_type === 'Transport Reimbursement';
  if (isReimbursement && payment_method !== 'Cash') {
    return { status: 400, body: { error: 'Reimbursements are released in cash only.' } };
  }
  if (!isReimbursement && (!payment_method || !state.systemSettings.paymentMethods.includes(payment_method))) {
    return { status: 400, body: { error: `Payment method must be one of: ${state.systemSettings.paymentMethods.join(', ')}` } };
  }
  claim.payment_method = payment_method;
  claim.processed_by = user.id;

  const oldStatus = claim.status;
  claim.status = ClaimStatus.READY_FOR_CLAIM;
  claim.processing_date = new Date().toISOString();
  claim.paid_at = claim.processing_date;
  claim.paid_amount = claim.approved_amount ?? claim.total_amount;
  claim.updated_at = new Date().toISOString();

  addHistory(claim.id, oldStatus, ClaimStatus.READY_FOR_CLAIM, user.id);

  const requestor = state.users.find(u => u.id === claim.requestor_id);
  const claimNumber = claim.claim_number || `REIM-${claim.id.substring(0,6)}`;

  const emailSubject = `Reimbursement - For Release`;
  const emailBody = `This request ${claimNumber} by ${requestor?.name || 'Requestor'} has been approved and ready for release.

Enter code ${claim.release_code} for releasing of cash.
_________________________________________
This is an automatically generated email, please do not reply.
${requestor?.name || 'Requestor'}
BSM Assistant | BSD - IT Security Business`;

  sendEmail(claim.requestor_id, emailSubject, emailBody, undefined, {
    plain: true,
    fromLabel: "SharePoint Online <no-reply@sharepointonline.com>",
    eventKey: 'ready',
  });

  try {
    await persistClaim(claim);
  } catch (err) {
    console.error('[db] Could not persist ready-for-claim to Postgres:', err);
  }
  return { status: 200, body: claim };
}

export async function confirmClaimPayout(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const claim = state.claims.find(c => c.id === id && c.requestor_id === user.id);
  if (!claim) return { status: 404, body: { error: 'Claim not found' } };

  if (claim.status !== ClaimStatus.READY_FOR_CLAIM) {
    return { status: 400, body: { error: 'Claim is not ready for claiming.' } };
  }

  const { code } = body || {};
  if (!code) {
    return { status: 400, body: { error: 'Incorrect Claim Code' } };
  }

  if (claim.release_code_locked_until && new Date(claim.release_code_locked_until) > new Date()) {
    const minutesLeft = Math.max(1, Math.ceil((new Date(claim.release_code_locked_until).getTime() - Date.now()) / 60000));
    return { status: 429, body: { error: `Too many incorrect attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}, or ask your custodian to regenerate the code.` } };
  }

  if (claim.release_code_expires_at && new Date(claim.release_code_expires_at) < new Date()) {
    return { status: 400, body: { error: 'This claim code has expired. Ask your custodian to regenerate it.' } };
  }

  if (!claim.release_code || !timingSafeCodeEquals(code, claim.release_code)) {
    claim.release_code_attempts = (claim.release_code_attempts || 0) + 1;
    if (claim.release_code_attempts >= RELEASE_CODE_MAX_ATTEMPTS) {
      claim.release_code_locked_until = new Date(Date.now() + RELEASE_CODE_LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }
    try {
      await persistClaim(claim);
    } catch (err) {
      console.error('[db] Could not persist release-code attempt to Postgres:', err);
    }
    return { status: 400, body: { error: 'Incorrect Claim Code' } };
  }

  claim.release_code_attempts = 0;
  claim.release_code_locked_until = undefined;

  const oldStatus = claim.status;
  claim.status = ClaimStatus.COMPLETED;
  claim.updated_at = new Date().toISOString();

  addHistory(claim.id, oldStatus, ClaimStatus.COMPLETED, user.id);

  if (claim.sourceLiquidationId) {
    addLiqHistory(claim.sourceLiquidationId, LiquidationStatus.CLOSED, LiquidationStatus.CLOSED, user.id, 'Reimbursement Processed');
  }

  const claimNumber = claim.claim_number || `REIM-${claim.id.substring(0, 6)}`;
  if (claim.processed_by) {
    sendEmail(
      claim.processed_by,
      `Reimbursement Completed - ${claimNumber}`,
      `${user.name} has confirmed receipt of the payout for ${claimNumber} (PHP ${claim.total_amount}). The claim is now complete — no further action is required.`
    );
  }
  sendEmail(
    claim.requestor_id,
    `Reimbursement Completed - ${claimNumber}`,
    `You've confirmed receipt of your reimbursement ${claimNumber} (PHP ${claim.total_amount}). This claim is now complete.`
  );

  try {
    await persistClaim(claim);
  } catch (err) {
    console.error('[db] Could not persist claim completion to Postgres:', err);
  }
  return { status: 200, body: claim };
}

export async function reassignClaim(userId: string | null, id: string, body: any) {
  const user = findUser(userId);
  if (!user || user.role !== UserRole.ADMIN) return { status: 403, body: { error: 'Forbidden' } };

  const { new_approver_id, reason } = body || {};
  if (!new_approver_id || !reason) return { status: 400, body: { error: 'Missing required fields' } };

  const newApprover = state.users.find(u => u.id === new_approver_id);
  if (!newApprover) return { status: 400, body: { error: 'New approver not found.' } };
  if (newApprover.role !== UserRole.APPROVER) return { status: 400, body: { error: 'New approver must have the Approver role.' } };

  const claim = state.claims.find(c => c.id === id);
  if (!claim) return { status: 404, body: { error: 'Claim not found' } };

  const oldApproverId = claim.current_approver_id;
  const oldApproverName = state.users.find(u => u.id === oldApproverId)?.name || oldApproverId;
  const newApproverName = state.users.find(u => u.id === new_approver_id)?.name || new_approver_id;

  claim.current_approver_id = new_approver_id;
  claim.approver_stale_since = null;
  claim.pending_transfer_to = null;
  claim.approver_stale_reason = undefined;
  claim.escalated_to_admin = false;
  claim.updated_at = new Date().toISOString();

  addHistory(claim.id, claim.status, claim.status, user.id,
    `Admin reassigned from ${oldApproverName} to ${newApproverName}. Reason: ${reason}`);

  try {
    await persistClaim(claim);
  } catch (err) {
    console.error('[db] Could not persist admin reassignment to Postgres:', err);
  }
  return { status: 200, body: claim };
}
