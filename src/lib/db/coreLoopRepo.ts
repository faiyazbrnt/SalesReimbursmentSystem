import type {
  approval_decision,
  approvals as ApprovalRow,
  claims as ClaimRow,
  claim_status,
  expense_line_items as ExpenseLineItemRow,
  minutes_source,
  moms as MomRow,
  mom_document_type,
  mom_status,
  status_histories as StatusHistoryRow,
} from '../../generated/prisma/client';
import { serverEnv } from '../../config/env';
import type {
  Approval,
  Claim,
  ClaimStatus,
  ExpenseLineItem,
  ImportBatch,
  MinutesSource,
  Mom,
  MomStatus,
  StatusHistory,
} from './serverTypes';
import { getDb } from './index';
import { recordDbFailure, recordDbSuccess } from './persistenceHealth';
import { trackPersistence } from './persistenceScope';

const globalForDbHealth = globalThis as typeof globalThis & {
  dbConnectionFailed?: boolean;
};

export const isDbConfigured = () => !!serverEnv.databaseUrl;

export function isDbAvailable(): boolean {
  if (!isDbConfigured()) return false;
  if (!serverEnv.isProduction && globalForDbHealth.dbConnectionFailed) {
    return false;
  }
  return true;
}

function claimStatusToPrisma(status: ClaimStatus | string): claim_status {
  if (status === 'Pending Approval') return 'Pending_Approval';
  if (status === 'Ready for Claim') return 'Ready_for_Claim';
  if (status === 'Returned for Revision' || status === 'Returned') return 'Returned';
  return status as claim_status;
}

function claimStatusFromPrisma(status: claim_status): ClaimStatus {
  if (status === 'Pending_Approval') return 'Pending Approval' as ClaimStatus;
  if (status === 'Ready_for_Claim') return 'Ready for Claim' as ClaimStatus;
  return status as ClaimStatus;
}

async function trackedWrite(
  context: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  if (!isDbAvailable()) return;
  try {
    await operation();
    recordDbSuccess();
  } catch (error) {
    if (!serverEnv.isProduction) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('timeout') ||
        msg.includes('connect') ||
        msg.includes('Connection terminated')
      ) {
        globalForDbHealth.dbConnectionFailed = true;
      }
    }
    recordDbFailure(context, error);
    throw error;
  }
}

function momToRow(mom: Mom) {
  return {
    id: mom.id,
    claim_id: mom.claim_id ?? null,
    requestor_id: mom.requestor_id ?? null,
    document_type: (mom.document_type === 'LOA' ? 'LOA' : 'MoM') as
      mom_document_type,
    client: mom.client ?? null,
    contact_person: mom.contact_person ?? null,
    contact_person_email: mom.contact_person_email ?? null,
    cc_client: !!mom.cc_client,
    meeting_date: mom.meeting_date,
    meeting_time: mom.meeting_time ?? null,
    location: mom.location ?? null,
    purpose: mom.purpose ?? null,
    discussion: mom.discussion ?? null,
    agreements: mom.agreements ?? null,
    action_items: mom.action_items ?? null,
    prepared_by: mom.prepared_by ?? null,
    prepared_by_department: mom.prepared_by_department ?? null,
    prepared_by_job_title: mom.prepared_by_job_title ?? null,
    summary: mom.summary ?? null,
    file_url: mom.file_url ?? null,
    file_name: mom.file_name ?? null,
    status: mom.status as mom_status,
    minutes_source: mom.minutes_source as minutes_source,
    meeting_type: mom.meeting_type ?? null,
    participants_internal: mom.participants_internal ?? null,
    participants_external: mom.participants_external ?? null,
    custom_fields: mom.custom_fields ? JSON.stringify(mom.custom_fields) : null,
  };
}

function momFromRow(row: MomRow): Mom {
  return {
    id: row.id,
    claim_id: row.claim_id ?? undefined,
    requestor_id: row.requestor_id ?? undefined,
    document_type: row.document_type,
    client: row.client ?? undefined,
    contact_person: row.contact_person ?? undefined,
    contact_person_email: row.contact_person_email ?? undefined,
    cc_client: row.cc_client,
    meeting_date: row.meeting_date,
    meeting_time: row.meeting_time ?? undefined,
    location: row.location ?? undefined,
    purpose: row.purpose ?? undefined,
    discussion: row.discussion ?? undefined,
    agreements: row.agreements ?? undefined,
    action_items: row.action_items ?? undefined,
    prepared_by: row.prepared_by ?? undefined,
    prepared_by_department: row.prepared_by_department ?? undefined,
    prepared_by_job_title: row.prepared_by_job_title ?? undefined,
    summary: row.summary ?? undefined,
    file_url: row.file_url ?? undefined,
    file_name: row.file_name ?? undefined,
    status: row.status as MomStatus,
    created_at: row.created_at.toISOString(),
    minutes_source: row.minutes_source as MinutesSource,
    meeting_type: row.meeting_type ?? undefined,
    participants_internal: row.participants_internal ?? undefined,
    participants_external: row.participants_external ?? undefined,
    custom_fields: row.custom_fields ? JSON.parse(row.custom_fields) : undefined,
  };
}

export async function persistMom(mom: Mom): Promise<void> {
  if (!isDbConfigured()) return;
  const row = momToRow(mom);
  await trackedWrite('persistMom', () =>
    getDb().moms.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    }));
}

function claimToRow(claim: Claim) {
  return {
    id: claim.id,
    claim_number: claim.claim_number ?? null,
    requestor_id: claim.requestor_id,
    current_approver_id: claim.current_approver_id,
    original_approver_id: claim.original_approver_id ?? null,
    mom_id: claim.mom_id || null,
    claim_type: claim.claim_type ?? 'Reimbursement',
    status: claimStatusToPrisma(claim.status),
    total_amount: claim.total_amount,
    approved_amount: claim.approved_amount ?? null,
    paid_amount: claim.paid_amount ?? null,
    expense_category: claim.expense_category ?? null,
    receipt_url: claim.receipt_url ?? null,
    remarks: claim.remarks ?? null,
    supporting_documents: claim.supporting_documents ?? null,
    payment_reference: claim.payment_reference ?? null,
    payment_method: claim.payment_method ?? null,
    release_code: claim.release_code ?? null,
    release_code_expires_at: claim.release_code_expires_at
      ? new Date(claim.release_code_expires_at)
      : null,
    release_code_attempts: claim.release_code_attempts ?? 0,
    release_code_locked_until: claim.release_code_locked_until
      ? new Date(claim.release_code_locked_until)
      : null,
    flagged_high_value: !!claim.flagged_high_value,
    approved_at: claim.approved_at ? new Date(claim.approved_at) : null,
    paid_at: claim.paid_at ? new Date(claim.paid_at) : null,
    processed_by: claim.processed_by ?? null,
    processing_date: claim.processing_date
      ? new Date(claim.processing_date)
      : null,
    source_liquidation_id: claim.sourceLiquidationId ?? null,
    import_batch_id: claim.import_batch_id ?? null,
    updated_at: new Date(),
    approver_stale_since: claim.approver_stale_since
      ? new Date(claim.approver_stale_since)
      : null,
    pending_transfer_to: claim.pending_transfer_to ?? null,
    approver_stale_reason: claim.approver_stale_reason ?? null,
    escalated_to_admin: !!claim.escalated_to_admin,
  };
}

function claimFromRow(row: ClaimRow): Claim {
  return {
    id: row.id,
    claim_number: row.claim_number ?? undefined,
    requestor_id: row.requestor_id,
    current_approver_id: row.current_approver_id,
    original_approver_id: row.original_approver_id ?? undefined,
    mom_id: row.mom_id ?? undefined,
    claim_type: row.claim_type as Claim['claim_type'],
    status: claimStatusFromPrisma(row.status),
    total_amount: Number(row.total_amount),
    approved_amount: row.approved_amount !== null
      ? Number(row.approved_amount)
      : undefined,
    paid_amount: row.paid_amount !== null ? Number(row.paid_amount) : undefined,
    expense_category: row.expense_category ?? undefined,
    receipt_url: row.receipt_url ?? undefined,
    remarks: row.remarks ?? undefined,
    supporting_documents: row.supporting_documents ?? undefined,
    payment_reference: row.payment_reference ?? undefined,
    payment_method: row.payment_method ?? undefined,
    release_code: row.release_code ?? undefined,
    release_code_expires_at: row.release_code_expires_at?.toISOString(),
    release_code_attempts: row.release_code_attempts ?? undefined,
    release_code_locked_until: row.release_code_locked_until?.toISOString(),
    flagged_high_value: row.flagged_high_value ?? undefined,
    approved_at: row.approved_at?.toISOString(),
    paid_at: row.paid_at?.toISOString(),
    processed_by: row.processed_by ?? undefined,
    processing_date: row.processing_date?.toISOString(),
    sourceLiquidationId: row.source_liquidation_id ?? undefined,
    import_batch_id: row.import_batch_id ?? undefined,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    approver_stale_since: row.approver_stale_since?.toISOString() ?? null,
    pending_transfer_to: row.pending_transfer_to ?? null,
    approver_stale_reason: row.approver_stale_reason ?? undefined,
    escalated_to_admin: row.escalated_to_admin ?? undefined,
  };
}

export async function persistClaim(claim: Claim): Promise<void> {
  if (!isDbConfigured()) return;
  const row = claimToRow(claim);
  await trackedWrite('persistClaim', () =>
    getDb().claims.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    }));
}

export async function persistClaimWithLineItems(
  claim: Claim,
  items: ExpenseLineItem[],
  moms: Mom[] = [],
): Promise<void> {
  if (!isDbConfigured()) return;
  await trackedWrite('persistClaimWithLineItems', () =>
    getDb().$transaction(async (tx) => {
      // A newly created MOM points back to its claim while the claim points to
      // the MOM. Insert its nullable side first, then complete the backfill.
      for (const mom of moms) {
        const momRow = momToRow(mom);
        await tx.moms.upsert({
          where: { id: momRow.id },
          create: { ...momRow, claim_id: null },
          update: { ...momRow, claim_id: null },
        });
      }

      const claimRow = claimToRow(claim);
      await tx.claims.upsert({
        where: { id: claimRow.id },
        create: claimRow,
        update: claimRow,
      });

      await tx.expense_line_items.deleteMany({
        where: { claim_id: claim.id },
      });
      if (items.length > 0) {
        await tx.expense_line_items.createMany({
          data: items.map(expenseToRow),
        });
      }

      for (const mom of moms) {
        const momRow = momToRow(mom);
        await tx.moms.upsert({
          where: { id: momRow.id },
          create: momRow,
          update: momRow,
        });
      }
    }));
}

export async function nextClaimNumberFromDb(): Promise<string> {
  const rows = await getDb().$queryRaw<Array<{ val: bigint }>>
    `SELECT nextval('claim_number_seq') AS val`;
  const value = Number(rows[0].val);
  const year = new Date().getFullYear();
  return `REIM-${year}-${String(value).padStart(6, '0')}`;
}

export async function syncClaimNumberSequenceFloor(
  minNextValue: number,
): Promise<void> {
  if (!isDbConfigured()) return;
  await getDb().$queryRaw
    `SELECT setval('claim_number_seq', ${BigInt(minNextValue)}, false)`;
}

function expenseToRow(expense: ExpenseLineItem) {
  return {
    id: expense.id,
    claim_id: expense.claim_id,
    expense_date: expense.expense_date,
    vendor: expense.vendor,
    category: expense.category,
    amount: expense.amount,
    payment_method: expense.payment_method,
    business_purpose: expense.business_purpose,
    receipt_url: expense.receipt_url ?? null,
    receipt_urls: expense.receipt_urls ?? (expense.receipt_url ? [expense.receipt_url] : []),
    or_number: expense.or_number ?? null,
    tin_number: expense.tin_number ?? null,
  };
}

function expenseFromRow(row: ExpenseLineItemRow): ExpenseLineItem {
  return {
    id: row.id,
    claim_id: row.claim_id,
    expense_date: row.expense_date,
    vendor: row.vendor,
    category: row.category,
    amount: Number(row.amount),
    payment_method: row.payment_method,
    business_purpose: row.business_purpose,
    receipt_url: row.receipt_url ?? undefined,
    receipt_urls: row.receipt_urls?.length ? row.receipt_urls : (row.receipt_url ? [row.receipt_url] : []),
    or_number: row.or_number ?? undefined,
    tin_number: row.tin_number ?? undefined,
  };
}

export async function persistExpenseLineItems(
  claimId: string,
  items: ExpenseLineItem[],
): Promise<void> {
  if (!isDbConfigured()) return;
  await trackedWrite('persistExpenseLineItems', () =>
    getDb().$transaction(async (tx) => {
      await tx.expense_line_items.deleteMany({ where: { claim_id: claimId } });
      if (items.length > 0) {
        await tx.expense_line_items.createMany({
          data: items.map(expenseToRow),
        });
      }
    }));
}

function approvalToRow(approval: Approval) {
  return {
    id: approval.id,
    claim_id: approval.claim_id,
    approver_id: approval.approver_id,
    decision: approval.decision as approval_decision,
    comment: approval.comment,
    timestamp: new Date(approval.timestamp),
  };
}

function approvalFromRow(row: ApprovalRow): Approval {
  return {
    id: row.id,
    claim_id: row.claim_id,
    approver_id: row.approver_id,
    decision: row.decision,
    comment: row.comment,
    timestamp: row.timestamp.toISOString(),
  };
}

export async function insertApproval(approval: Approval): Promise<void> {
  if (!isDbConfigured()) return;
  await trackedWrite('insertApproval', () =>
    getDb().approvals.createMany({
      data: [approvalToRow(approval)],
      skipDuplicates: true,
    }));
}

function historyToRow(history: StatusHistory) {
  return {
    id: history.id,
    claim_id: history.claim_id || null,
    cash_advance_id: history.cash_advance_id || null,
    liquidation_id: history.liquidation_id || null,
    delegation_id: history.delegation_id || null,
    user_id: history.user_id || null,
    master_data_key: history.master_data_key || null,
    master_data_id: history.master_data_id || null,
    old_status: history.old_status,
    new_status: history.new_status,
    changed_by: history.changed_by,
    reason: history.reason ?? null,
    timestamp: new Date(history.timestamp),
  };
}

function historyFromRow(row: StatusHistoryRow): StatusHistory {
  return {
    id: row.id,
    claim_id: row.claim_id!,
    old_status: row.old_status,
    new_status: row.new_status,
    changed_by: row.changed_by,
    reason: row.reason ?? undefined,
    timestamp: row.timestamp.toISOString(),
  };
}

export function persistStatusHistoryFireAndForget(
  entry: StatusHistory,
): void {
  const hasScope = entry.claim_id
    || entry.cash_advance_id
    || entry.liquidation_id
    || entry.delegation_id
    || entry.user_id
    || (entry.master_data_key && entry.master_data_id);
  if (!isDbAvailable() || !hasScope) return;

  const write = getDb().status_histories.createMany({
    data: [historyToRow(entry)],
    skipDuplicates: true,
  })
    .then(() => recordDbSuccess())
    .catch((error: unknown) => {
      if (!serverEnv.isProduction) {
        const msg = error instanceof Error ? error.message : String(error);
        if (
          msg.includes('timeout') ||
          msg.includes('connect') ||
          msg.includes('Connection terminated')
        ) {
          globalForDbHealth.dbConnectionFailed = true;
        }
      }
      recordDbFailure('persistStatusHistory', error);
      console.error('[db] Could not persist status history entry:', error);
    });
  trackPersistence(write);
}

export async function clearCoreLoopInDb(): Promise<void> {
  if (!isDbConfigured()) return;
  await getDb().$transaction(async (tx) => {
    await tx.status_histories.deleteMany();
    await tx.expense_line_items.deleteMany();
    await tx.approvals.deleteMany();
    await tx.claims.updateMany({ data: { mom_id: null } });
    await tx.moms.deleteMany();
    await tx.claims.deleteMany();
  });
}

function importBatchToRow(batch: ImportBatch) {
  return {
    id: batch.id,
    admin_id: batch.admin_id,
    filename: batch.filename,
    total_records: batch.total_records,
    imported_at: new Date(batch.imported_at),
  };
}

export async function persistHistoricalImportBatch(
  batch: ImportBatch,
  claimsToInsert: Claim[],
  expensesToInsert: ExpenseLineItem[],
  historyToInsert: StatusHistory[],
): Promise<void> {
  if (!isDbConfigured()) return;
  await getDb().$transaction(async (tx) => {
    await tx.import_batches.create({ data: importBatchToRow(batch) });
    if (claimsToInsert.length > 0) {
      await tx.claims.createMany({ data: claimsToInsert.map(claimToRow) });
    }
    if (expensesToInsert.length > 0) {
      await tx.expense_line_items.createMany({
        data: expensesToInsert.map(expenseToRow),
      });
    }
    if (historyToInsert.length > 0) {
      await tx.status_histories.createMany({
        data: historyToInsert.map(historyToRow),
      });
    }
  });
}

export async function loadCoreLoopFromDb(): Promise<{
  moms: Mom[];
  claims: Claim[];
  expenses: ExpenseLineItem[];
  approvals: Approval[];
  statusHistories: StatusHistory[];
}> {
  if (!isDbConfigured()) {
    return {
      moms: [],
      claims: [],
      expenses: [],
      approvals: [],
      statusHistories: [],
    };
  }
  const db = getDb();
  const [momRows, claimRows, expenseRows, approvalRows, historyRows] =
    await Promise.all([
      db.moms.findMany(),
      db.claims.findMany(),
      db.expense_line_items.findMany(),
      db.approvals.findMany(),
      db.status_histories.findMany({ where: { claim_id: { not: null } } }),
    ]);
  return {
    moms: momRows.map(momFromRow),
    claims: claimRows.map(claimFromRow),
    expenses: expenseRows.map(expenseFromRow),
    approvals: approvalRows.map(approvalFromRow),
    statusHistories: historyRows.map(historyFromRow),
  };
}
