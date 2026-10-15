import { Claim } from '../types';
import { MinutesSource } from '@/features/moms/types';
import { apiFetch, uploadFile } from '../../../lib/api/client';
import { getReimbursementDateError, getTodayIsoDate } from '../schema';
import { normalizeExpenseCategory } from '../../../lib/expenseCategories';

/** A line item as the wizard holds it, before receipts have been uploaded. */
export interface DraftLineItem {
  category?: string;
  amount?: number;
  vendor?: string;
  businessPurpose?: string;
  expenseDate?: string;
  paymentMethod?: string;
  orNumber?: string;
  receiptFile?: File;
  receiptUrl?: string;
}

export interface SubmitClaimInput {
  claimType: 'Reimbursement' | 'Transport Reimbursement';
  lineItems: DraftLineItem[];
  /** Core MOM columns the server models as first-class fields. */
  mom?: {
    client?: string;
    purpose?: string;
    location?: string;
    contactPerson?: string;
    contactPersonEmail?: string;
    ccClient?: boolean;
    discussion?: string;
    actionItems?: string;
    meetingDate?: string;
    meetingTime?: string;
    source?: MinutesSource;
    documentType?: 'MoM' | 'LOA';
  };
  /** Admin-defined dynamic fields, keyed by FieldDefinition.key. */
  customFields?: Record<string, string>;
  remarks?: string;
  isDraft?: boolean;
}

export interface ResubmitClaimInput {
  claimId: string;
  momId?: string;
  claimType?: 'Reimbursement' | 'Transport Reimbursement';
  lineItems: DraftLineItem[];
  remarks?: string;
}

/**
 * Approve / reject / return, routed to whichever endpoint owns the entity.
 * The UI calls this with its own vocabulary and stays out of the server's.
 */
export async function decideOnClaim(
  claim: Claim,
  decision: 'Approved' | 'Rejected' | 'Returned',
  comment: string,
  options?: { reviewMeetingDate?: string; reviewMeetingTime?: string }
) {
  if (claim.type === 'Cash Advance') {
    return apiFetch(`/api/cash-advances/${claim.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    });
  }
  if (claim.type === 'Liquidation') {
    return apiFetch(`/api/liquidations/${claim.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    });
  }
  return apiFetch(`/api/claims/${claim.id}/approve`, {
    method: 'POST',
    body: JSON.stringify({
      decision,
      comment,
      review_meeting_date: options?.reviewMeetingDate || undefined,
      review_meeting_time: options?.reviewMeetingTime || undefined,
    }),
  });
}

/**
 * Approver (or Admin): hand a claim off to another approver after an
 * org-chart change flags it stale. `to` defaults server-side to the claim's
 * own `pending_transfer_to` suggestion if omitted.
 */
export const transferApprover = (claimId: string, to?: string) =>
  apiFetch(`/api/claims/${claimId}/transfer-approver`, {
    method: 'POST',
    body: JSON.stringify(to ? { to } : {}),
  });

/** Admin: force-move a claim to a different approver outside the normal org-change flow. */
export const reassignApprover = (claimId: string, newApproverId: string, reason: string) =>
  apiFetch(`/api/claims/${claimId}/reassign`, {
    method: 'PUT',
    body: JSON.stringify({ new_approver_id: newApproverId, reason }),
  });

/** Admin: manually trigger the fallback-escalation sweep (normally a cron). */
export const runFallbackCheck = (force = false) =>
  apiFetch('/api/admin/run-fallback-check', {
    method: 'POST',
    body: JSON.stringify({ force }),
  });

/**
 * Custodian: issue (or regenerate) the release code the requestor quotes at
 * payout. The server mints one itself if `code` is omitted.
 */
export const generateClaimCode = (claimId: string, code?: string) =>
  apiFetch(`/api/claims/${claimId}/claim-code`, {
    method: 'PUT',
    body: JSON.stringify({ code }),
  });

/** Custodian: mark an approved claim ready for the requestor to collect. */
export const markReadyForClaim = (claimId: string, paymentMethod?: string) =>
  apiFetch(`/api/claims/${claimId}/ready-for-claim`, {
    method: 'POST',
    body: JSON.stringify({ payment_method: paymentMethod }),
  });

/**
 * Custodian correction decision after approval but before funds move.
 * The server validates which decision is meaningful for each request type.
 */
export const decideAsCustodian = (
  claimId: string,
  decision: 'Return' | 'Reject',
  comment: string,
) =>
  apiFetch(`/api/custodian/claims/${claimId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, comment }),
  });

/**
 * Requestor: confirm receipt of funds by quoting the release code the custodian
 * issued. This is the two-party anti-fraud gate — the server verifies both that
 * the caller owns the claim and that the code matches, then completes it.
 */
export const confirmReceipt = (claimId: string, code: string) =>
  apiFetch(`/api/claims/${claimId}/claim`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

export const deleteClaim = (claimId: string) =>
  apiFetch(`/api/claims/${claimId}`, {
    method: 'DELETE',
  });

/**
 * The server models submission as three dependent writes — receipts must exist
 * before line items can reference them, and a completed MOM must exist before a
 * claim can attach to it. Ordering matters and a failure part-way leaves the
 * earlier writes in place, which is why the error message names the stage.
 */
export async function submitClaimFlow(input: SubmitClaimInput) {
  const { claimType, lineItems, mom, customFields, remarks, isDraft } = input;

  if (!isDraft) {
    const filingDate = getTodayIsoDate();
    const invalidDateIndex = lineItems.findIndex(li => Boolean(getReimbursementDateError(li.expenseDate, filingDate)));
    if (invalidDateIndex !== -1) {
      throw new Error(`Expense row ${invalidDateIndex + 1}: ${getReimbursementDateError(lineItems[invalidDateIndex].expenseDate, filingDate)}`);
    }
  }

  // 1. Receipts. The server rejects any line item without a receipt_url.
  let uploaded: DraftLineItem[];
  try {
    uploaded = await Promise.all(
      lineItems.map(async (li) => {
        if (li.receiptFile) {
          try {
            const { url } = await uploadFile(li.receiptFile);
            return { ...li, receiptUrl: url };
          } catch (uploadErr) {
            if (isDraft) {
              console.warn('[submitClaimFlow] Receipt upload skipped during draft save:', uploadErr);
              return { ...li, receiptUrl: li.receiptUrl || `/uploads/draft_${encodeURIComponent(li.receiptFile.name)}` };
            }
            throw uploadErr;
          }
        }
        return li;
      })
    );
  } catch (err: any) {
    throw new Error(err?.message || 'Could not upload one or more receipts.');
  }

  const missing = uploaded.findIndex((li) => !li.receiptUrl);
  if (!isDraft && missing !== -1) {
    throw new Error(`Expense row ${missing + 1} needs a receipt attached before you can submit.`);
  }

  // 2. Atomic Claim Submission (MOM + Claim + Line Items in a single request).
  let momPayload: any | undefined;
  if (claimType === 'Reimbursement') {
    if (!mom && !isDraft) throw new Error('Minutes of Meeting details are required.');
    if (mom) {
      momPayload = {
        client: mom.client || (isDraft ? 'Draft Client' : ''),
        purpose: mom.purpose || (isDraft ? 'Draft Meeting' : ''),
        location: mom.location || '',
        contact_person: mom.contactPerson || '',
        contact_person_email: mom.contactPersonEmail || '',
        cc_client: Boolean(mom.ccClient),
        discussion: mom.discussion || '',
        action_items: mom.actionItems || '',
        meeting_date: mom.meetingDate || new Date().toISOString().split('T')[0],
        meeting_time: mom.meetingTime || '',
        minutes_source: MinutesSource.TEMPLATE,
        document_type: mom.documentType || 'MoM',
        status: isDraft ? 'Draft' : 'Completed',
        custom_fields: customFields,
      };
    }
  }

  return apiFetch('/api/claims', {
    method: 'POST',
    body: JSON.stringify({
      claim_type: claimType,
      mom: momPayload,
      remarks: remarks || mom?.purpose || (isDraft ? 'Draft reimbursement' : (claimType === 'Transport Reimbursement' ? 'Transport reimbursement' : '')),
      is_draft: Boolean(isDraft),
      line_items: uploaded.map((li) => ({
        category: normalizeExpenseCategory(li.category),
        amount: Number(li.amount) || 0,
        receipt_url: li.receiptUrl,
        or_number: li.orNumber || '',
        vendor: li.vendor || '',
        expense_date: li.expenseDate || '',
        payment_method: li.paymentMethod || '',
        business_purpose: li.businessPurpose || '',
      })),
    }),
  });
}

/**
 * Revise & Resubmit — a Returned Reimbursement re-enters the approval queue
 * via PUT /api/claims/:id/resubmit. The server requires the MOM this claim
 * already carries (re-linking a different one is possible but out of scope
 * here) and re-derives category/total from the edited line items, same as
 * a fresh submission's receipt-then-claim ordering.
 */
export async function resubmitClaimFlow(input: ResubmitClaimInput) {
  const { claimId, momId, claimType, lineItems, remarks } = input;

  const filingDate = getTodayIsoDate();
  const invalidDateIndex = lineItems.findIndex(li => Boolean(getReimbursementDateError(li.expenseDate, filingDate)));
  if (invalidDateIndex !== -1) {
    throw new Error(`Expense row ${invalidDateIndex + 1}: ${getReimbursementDateError(lineItems[invalidDateIndex].expenseDate, filingDate)}`);
  }

  let uploaded: DraftLineItem[];
  try {
    uploaded = await Promise.all(
      lineItems.map(async (li) => {
        if (li.receiptFile) {
          const { url } = await uploadFile(li.receiptFile);
          return { ...li, receiptUrl: url };
        }
        return li;
      })
    );
  } catch (err: any) {
    throw new Error(err?.message || 'Could not upload one or more receipts.');
  }

  const missing = uploaded.findIndex((li) => !li.receiptUrl);
  if (missing !== -1) {
    throw new Error(`Expense row ${missing + 1} needs a receipt attached before you can resubmit.`);
  }

  return apiFetch(`/api/claims/${claimId}/resubmit`, {
    method: 'PUT',
    body: JSON.stringify({
      mom_id: momId,
      claim_type: claimType,
      remarks: remarks || '',
      line_items: uploaded.map((li) => ({
        category: normalizeExpenseCategory(li.category),
        amount: Number(li.amount) || 0,
        receipt_url: li.receiptUrl,
        or_number: li.orNumber || '',
        vendor: li.vendor || '',
        expense_date: li.expenseDate || '',
        payment_method: li.paymentMethod || '',
        business_purpose: li.businessPurpose || '',
      })),
    }),
  });
}
