import { persistedReceiptUrls } from '../receiptAttachments';
import { normalizeLegacyRole } from '../legacyRole';
import {
  Claim, ClaimStatus, ClaimType, ExpenseLineItem, MOM, User, UserRole,
  StatusHistory, MasterData, FieldDefinition, MinutesSource,
  ReviewMeeting, ReviewMeetingStatus, Company, SystemEmail,
  SupportRequest, SupportRequestStatus, ApproverDelegation, DelegationStatus,
} from '../../types';
import { normalizeExpenseCategory } from '../expenseCategories';

// --- status mapping -------------------------------------------------------

export const CLAIM_STATUS: Record<string, ClaimStatus> = {
  'Draft': ClaimStatus.DRAFT,
  'Pending Approval': ClaimStatus.PENDING_APPROVAL,
  'Approved': ClaimStatus.APPROVED,
  'Processing': ClaimStatus.PROCESSING,
  'Ready for Claim': ClaimStatus.READY_FOR_CLAIM,
  'Completed': ClaimStatus.COMPLETED,
  'Rejected': ClaimStatus.REJECTED,
  'Returned': ClaimStatus.RETURNED,
};

export const CASH_ADVANCE_STATUS: Record<string, ClaimStatus> = {
  'Draft': ClaimStatus.DRAFT,
  'Submitted': ClaimStatus.SUBMITTED,
  'Approved': ClaimStatus.APPROVED,
  'Rejected': ClaimStatus.REJECTED,
  'Released': ClaimStatus.RELEASED,
  'Liquidated': ClaimStatus.LIQUIDATED,
};

export const LIQUIDATION_STATUS: Record<string, ClaimStatus> = {
  'Draft': ClaimStatus.DRAFT,
  'Submitted': ClaimStatus.SUBMITTED,
  'ReturnedForRevision': ClaimStatus.RETURNED,
  'Reviewed': ClaimStatus.REVIEWED,
  'Closed': ClaimStatus.CLOSED,
};

export function toServerStatus(status: ClaimStatus, type: ClaimType): string {
  const table = type === 'Cash Advance' ? CASH_ADVANCE_STATUS
    : type === 'Liquidation' ? LIQUIDATION_STATUS
    : CLAIM_STATUS;
  const hit = Object.entries(table).find(([, ui]) => ui === status);
  return hit ? hit[0] : status;
}

// --- inbound adapters -----------------------------------------------------

export function fromServerUser(u: any): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: normalizeLegacyRole(u.role) as UserRole,
    department: u.department || '',
    jobTitle: u.job_title || '',
    reportsTo: u.reports_to || undefined,
    employmentStatus: u.employment_status === 'Inactive' ? 'Inactive' : 'Active',
    canApproveReimbursements: Boolean(u.can_approve_reimbursements),
    notificationPrefs: u.notification_prefs || undefined,
    avatarUrl: u.avatar_url || undefined,
  };
}

export function fromServerExpense(e: any, claimId: string): ExpenseLineItem {
  const receiptUrls = persistedReceiptUrls(e.receipt_url, e.receipt_urls);
  const receiptPath = (receiptUrls[0] || '').split('?')[0];
  const receiptFileName = receiptPath
    ? decodeURIComponent(receiptPath.split('/').filter(Boolean).pop() || '')
    : undefined;
  return {
    id: e.id,
    claimId,
    expenseDate: (e.expense_date || '').split('T')[0],
    vendor: e.vendor || '',
    category: normalizeExpenseCategory(e.category),
    amount: Number(e.amount) || 0,
    paymentMethod: e.payment_method || '',
    businessPurpose: e.business_purpose || '',
    receiptUrl: receiptUrls[0],
    receiptUrls,
    receiptFileName: receiptFileName || undefined,
    orNumber: e.or_number || undefined,
    tinNumber: e.tin_number || undefined,
  };
}

export function fromServerMom(m: any): MOM | null {
  if (!m) return null;
  return {
    id: m.id,
    claimId: m.claim_id || '',
    requestorId: m.requestor_id || undefined,
    documentType: m.document_type === 'LOA' ? 'LOA' : 'MoM',
    meetingDate: m.meeting_date || undefined,
    status: m.status || undefined,
    source: m.minutes_source === 'Uploaded' ? MinutesSource.UPLOADED : MinutesSource.TEMPLATE,
    fileUrl: m.file_url === '/mom_attachment_placeholder.png' ? undefined : (m.file_url || undefined),
    fileName: m.file_url === '/mom_attachment_placeholder.png' ? undefined : (m.file_name || undefined),
    companyName: m.client_name || m.client || undefined,
    purposeOfMeeting: m.purpose || undefined,
    location: m.location || undefined,
    contactPerson: m.contact_person || undefined,
    contactPersonDesignation: m.custom_fields?.contact_person_designation || undefined,
    contactPersonEmail: m.contact_person_email || undefined,
    ccClient: Boolean(m.cc_client),
    description: m.discussion || undefined,
    agreements: m.agreements || undefined,
    actionItems: m.action_items || undefined,
    preparedBy: m.prepared_by || undefined,
    summary: m.summary || undefined,
    meetingType: m.meeting_type || undefined,
    participantsInternal: m.participants_internal || undefined,
    participantsExternal: m.participants_external || undefined,
    customFields: m.custom_fields || undefined,
    typeOfAccount: m.custom_fields?.type_of_account || undefined,
    category: m.custom_fields?.category === 'Other' && m.custom_fields?.category_other
      ? `Other (${m.custom_fields.category_other})`
      : (m.custom_fields?.category || undefined),
  };
}

export const REVIEW_MEETING_STATUS: Record<string, ReviewMeetingStatus> = {
  PendingConfirmation: ReviewMeetingStatus.PENDING_CONFIRMATION,
  Confirmed: ReviewMeetingStatus.CONFIRMED,
  DeclineRequested: ReviewMeetingStatus.DECLINE_REQUESTED,
  Completed: ReviewMeetingStatus.COMPLETED,
};

export function fromServerReviewMeeting(r: any): ReviewMeeting {
  return {
    id: r.id,
    claimId: r.claim_id,
    meetingDate: (r.meeting_date || '').split('T')[0],
    meetingTime: r.meeting_time || '',
    approverId: r.approver_id,
    status: REVIEW_MEETING_STATUS[r.status] ?? (r.status as ReviewMeetingStatus),
    requestorId: r.requestor_id || undefined,
    requestorName: r.requestor_name || undefined,
    approverName: r.approver_name || undefined,
    claimNumber: r.claim_number || undefined,
    declineReason: r.decline_reason || undefined,
  };
}

export function mapHistoryStatus(status: string, type: ClaimType): ClaimStatus {
  const table = type === 'Cash Advance'
    ? CASH_ADVANCE_STATUS
    : type === 'Liquidation'
      ? LIQUIDATION_STATUS
      : CLAIM_STATUS;
  return table[status] ?? (status as ClaimStatus);
}

export function fromServerHistory(h: any, claimId: string, type: ClaimType): StatusHistory {
  return {
    id: h.id,
    claimId,
    oldStatus: h.old_status ? mapHistoryStatus(h.old_status, type) : undefined,
    newStatus: mapHistoryStatus(h.new_status, type),
    changedBy: h.changed_by,
    timestamp: h.timestamp,
    comment: h.reason || undefined,
  };
}

export function fromServerClaim(c: any, demoModeEnabled = false): Claim {
  const submitted = (c.history || []).find((h: any) => h.new_status === 'Pending Approval');
  const approved = c.approved_at || (c.history || []).find((h: any) => h.new_status === 'Processing')?.timestamp;
  const paid = c.paid_at || (c.history || []).find((h: any) => h.new_status === 'Ready for Claim')?.timestamp;
  const completed = (c.history || []).find((h: any) => h.new_status === 'Completed')?.timestamp;
  const isApproved = ['Approved', 'Processing', 'Ready for Claim', 'Completed'].includes(c.status);
  const isPaid = ['Ready for Claim', 'Completed'].includes(c.status);
  const claimedAmount = Number(c.total_amount) || 0;
  const type: ClaimType = c.claim_type === 'Transport Reimbursement'
    ? 'Transport Reimbursement'
    : 'Reimbursement';
  const fallbackApprovedAmount = demoModeEnabled ? Math.min(claimedAmount, 1000) : undefined;
  return {
    id: c.id,
    ref: c.claim_number || `REIM-${String(c.id).slice(0, 6)}`,
    requestorId: c.requestor_id,
    status: CLAIM_STATUS[c.status] ?? (c.status as ClaimStatus),
    total: claimedAmount,
    claimedAmount,
    approvedAmount: c.approved_amount != null ? Number(c.approved_amount) : (isApproved ? fallbackApprovedAmount : undefined),
    paidAmount: c.paid_amount != null ? Number(c.paid_amount) : (isPaid ? fallbackApprovedAmount ?? 0 : 0),
    submittedAt: submitted?.timestamp,
    approvedAt: approved || undefined,
    paidAt: paid || undefined,
    completedAt: completed || undefined,
    createdAt: c.created_at,
    type,
    purpose: c.remarks || c.mom?.purpose || c.expense_category || 'Reimbursement',
    client: c.mom?.client || c.mom?.client_name || undefined,
    location: c.mom?.location || undefined,
    flaggedHighValue: Boolean(c.flagged_high_value),
    releaseCode: c.release_code || undefined,
    releaseCodeExpiresAt: c.release_code_expires_at || undefined,
    paymentReference: c.payment_reference || undefined,
    paymentMethod: c.payment_method || undefined,
    processedBy: c.processed_by || undefined,
    processingDate: c.processing_date || undefined,
    approverId: c.current_approver_id || undefined,
    approverStaleSince: c.approver_stale_since || undefined,
    approverStaleReason: c.approver_stale_reason || undefined,
    pendingTransferTo: c.pending_transfer_to || undefined,
    escalatedToAdmin: Boolean(c.escalated_to_admin),
    importBatchId: c.import_batch_id || undefined,
  };
}

export function fromServerCashAdvance(ca: any): Claim {
  const submitted = (ca.history || []).find((h: any) => h.new_status === 'Submitted')?.timestamp;
  const approved = ca.approvedAt || (ca.history || []).find((h: any) => h.new_status === 'Approved')?.timestamp;
  const completed = (ca.history || []).find((h: any) => h.new_status === 'Liquidated')?.timestamp;
  const isApproved = ['Approved', 'Released', 'Liquidated'].includes(ca.status);
  const isPaid = ['Released', 'Liquidated'].includes(ca.status);
  const claimedAmount = Number(ca.amount) || 0;
  return {
    id: ca.id,
    ref: `CADV-${String(ca.id).slice(0, 6)}`,
    requestorId: ca.requestorId,
    status: CASH_ADVANCE_STATUS[ca.status] ?? (ca.status as ClaimStatus),
    total: claimedAmount,
    claimedAmount,
    approvedAmount: isApproved ? claimedAmount : undefined,
    paidAmount: ca.paidAmount != null ? Number(ca.paidAmount) : isPaid ? claimedAmount : 0,
    createdAt: ca.createdAt,
    submittedAt: submitted || (ca.status === 'Draft' ? undefined : ca.createdAt),
    approvedAt: approved || undefined,
    paidAt: ca.releaseDate || undefined,
    completedAt: completed || undefined,
    type: 'Cash Advance',
    purpose: ca.purpose || 'Cash Advance',
    client: ca.mom?.client || ca.mom?.client_name || undefined,
    location: ca.mom?.location || undefined,
    approverId: ca.approverId || undefined,
    releasedBy: ca.releasedBy || undefined,
    releaseDate: ca.releaseDate || undefined,
    releaseReference: ca.releaseReference || undefined,
    paymentMethod: ca.releaseMethod || undefined,
    reminderSent: Boolean(ca.reminderSent),
  };
}

export function fromServerLiquidation(l: any): Claim {
  const submitted = (l.history || []).find((h: any) => h.new_status === 'Submitted')?.timestamp;
  const reviewed = (l.history || []).find((h: any) => ['Reviewed', 'Closed'].includes(h.new_status))?.timestamp;
  const completed = (l.history || []).find((h: any) => h.new_status === 'Closed')?.timestamp;
  const claimedAmount = Number(l.totalSpent) || 0;
  return {
    id: l.id,
    ref: `LIQ-${String(l.id).slice(0, 6)}`,
    requestorId: l.requestorId,
    status: LIQUIDATION_STATUS[l.status] ?? (l.status as ClaimStatus),
    total: claimedAmount,
    claimedAmount,
    approvedAmount: ['Reviewed', 'Closed'].includes(l.status) ? claimedAmount : undefined,
    paidAmount: 0,
    createdAt: l.createdAt,
    submittedAt: submitted || (l.status === 'Draft' ? undefined : l.createdAt),
    approvedAt: reviewed || undefined,
    completedAt: completed || undefined,
    type: 'Liquidation',
    purpose: l.cashAdvance?.purpose || 'Liquidation',
    client: l.mom?.client || l.mom?.client_name || undefined,
    location: l.mom?.location || undefined,
    cashAdvanceId: l.cashAdvanceId,
    varianceAmount: Number(l.varianceAmount) || 0,
    varianceType: l.varianceType as Claim['varianceType'],
    paymentMethod: l.refundMethod || undefined,
  };
}

export function fromServerEmail(e: any): SystemEmail {
  const body = (e.body || '') as string;
  const displayBody = body
    .replace(/(successfully (?:re)?submitted) and routed to [^\r\n]+? for (review|approval)\./g, '$1 and routed for $2.')
    .replace(/You'll receive another email as soon as [^\r\n]+? makes a decision\./g, "You'll receive another email as soon as a decision is made.");
  return {
    id: e.id,
    recipientId: e.recipient_id,
    from: e.from || 'no-reply@mgenesis.com',
    to: e.to || '',
    subject: e.subject || '',
    body: displayBody,
    read: Boolean(e.read),
    timestamp: e.timestamp,
    channel: e.channel === 'Teams' ? 'Teams' : 'Email',
  };
}

export function fromServerSupportMessage(m: any) {
  return {
    id: m.id,
    senderId: m.sender_id,
    message: m.message,
    timestamp: m.timestamp,
  };
}

export function fromServerSupport(s: any): SupportRequest {
  return {
    id: s.id,
    requestorId: s.requestor_id,
    subject: s.subject,
    description: s.description,
    relatedEntityType: s.related_entity_type || undefined,
    relatedEntityId: s.related_entity_id || undefined,
    priority: s.priority,
    status: s.status as SupportRequestStatus,
    assignedAdminId: s.assigned_admin_id || undefined,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    messages: (s.messages || []).map(fromServerSupportMessage),
  };
}

export function fromServerDelegation(d: any): ApproverDelegation {
  return {
    id: d.id,
    approver_id: d.approver_id,
    delegate_id: d.delegate_id,
    start_date: d.start_date,
    end_date: d.end_date,
    status: d.status as DelegationStatus,
    decline_reason: d.decline_reason || undefined,
    created_by: d.created_by,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

export function fromServerMasterData(all: any): MasterData[] {
  const catalogs: Array<[string, MasterData['type']]> = [
    ['departments', 'department'],
    ['costCenters', 'costCenter'],
    ['businessUnits', 'businessUnit'],
    ['branches', 'branch'],
    ['projectCodes', 'projectCode'],
    ['vendors', 'vendor'],
  ];
  return catalogs.flatMap(([key, type]) =>
    (all?.[key] || []).map((r: any) => ({
      id: r.id,
      type,
      name: r.name,
      code: r.code || undefined,
      active: r.active !== false,
      notes: r.notes || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  );
}

export const MASTER_ENTITY_SINGULAR: Record<string, string> = {
  departments: 'department',
  costCenters: 'costCenter',
  businessUnits: 'businessUnit',
  branches: 'branch',
  projectCodes: 'projectCode',
  vendors: 'vendor',
};

export function fromServerFieldDefinition(fd: any): FieldDefinition {
  return {
    id: fd.id,
    entity: fd.entity,
    key: fd.key,
    label: fd.label,
    input_type: fd.input_type,
    required: Boolean(fd.required),
    active: fd.active !== false,
    default_value: fd.default_value || undefined,
    display_order: Number(fd.display_order) || 0,
    options: fd.options || undefined,
    master_data_entity: fd.master_data_entity
      ? MASTER_ENTITY_SINGULAR[fd.master_data_entity] || fd.master_data_entity
      : undefined,
    allow_other: Boolean(fd.allow_other),
    applicableClaimTypes: fd.applicableClaimTypes || undefined,
    validation: fd.validation || undefined,
  };
}
