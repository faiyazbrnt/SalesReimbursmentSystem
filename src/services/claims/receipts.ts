import { UserRole } from '../../lib/db/serverTypes';
import { state } from '../../server/state';
import { isFinancialRecord } from '../../server/constants';

type ReceiptRecord = {
  id: string;
  sourceId: string;
  parentId: string;
  parentType: 'Claim' | 'Liquidation';
  parentNumber: string;
  receipt_url: string;
  receipt_urls: string[];
  or_number: string;
  vendor: string;
  amount: number;
  expense_date: string;
  category: string;
  business_purpose: string;
  requestor_name: string;
  requestor_department: string;
};

export function listReceipts(userId: string | null): { status: number; body: ReceiptRecord[] | { error: string } } {
  const user = state.users.find((candidate) =>
    candidate.id === userId
    || candidate.entra_object_id === userId
    || candidate.user_principal_name === userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.APPROVER) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  const receipts: ReceiptRecord[] = [];
  for (const expense of state.expenses) {
    const claim = state.claims.find((candidate) => candidate.id === expense.claim_id);
    if (user.role === UserRole.APPROVER && (!claim || !isFinancialRecord(claim.claim_type || 'Reimbursement', claim.status))) continue;
    const requestor = claim ? state.users.find((candidate) => candidate.id === claim.requestor_id) : undefined;
    receipts.push({
      id: `exp-${expense.id}`,
      sourceId: expense.id,
      parentId: claim?.id || '',
      parentType: 'Claim',
      parentNumber: claim ? (claim.claim_number || `REIM-${claim.id.substring(0, 6)}`) : 'Unknown',
      receipt_url: expense.receipt_url || '',
      receipt_urls: expense.receipt_urls?.length ? expense.receipt_urls : (expense.receipt_url ? [expense.receipt_url] : []),
      or_number: expense.or_number || '',
      vendor: expense.vendor || 'Unknown Vendor',
      amount: expense.amount,
      expense_date: expense.expense_date,
      category: expense.category,
      business_purpose: expense.business_purpose || '',
      requestor_name: requestor?.name || 'Unknown',
      requestor_department: requestor?.department || 'Unknown',
    });
  }

  for (const item of state.liquidationLineItems) {
    const liquidation = state.liquidations.find((candidate) => candidate.id === item.liquidationId);
    if (user.role === UserRole.APPROVER && (!liquidation || !isFinancialRecord('Liquidation', liquidation.status))) continue;
    const requestor = liquidation ? state.users.find((candidate) => candidate.id === liquidation.requestorId) : undefined;
    receipts.push({
      id: `liq-${item.id}`,
      sourceId: item.id,
      parentId: liquidation?.id || '',
      parentType: 'Liquidation',
      parentNumber: liquidation ? `LIQ-${liquidation.id.substring(0, 6)}` : 'Unknown',
      receipt_url: item.receipt_url || '',
      receipt_urls: item.receipt_url ? [item.receipt_url] : [],
      or_number: item.or_number || '',
      vendor: item.vendor || 'Unknown Vendor',
      amount: item.amount,
      expense_date: item.expense_date,
      category: item.category,
      business_purpose: item.business_purpose || '',
      requestor_name: requestor?.name || 'Unknown',
      requestor_department: requestor?.department || 'Unknown',
    });
  }

  receipts.sort((left, right) => new Date(right.expense_date).getTime() - new Date(left.expense_date).getTime());
  return { status: 200, body: receipts };
}
