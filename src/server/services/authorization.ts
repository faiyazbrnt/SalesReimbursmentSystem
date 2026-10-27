import { isCashTransactionMethod } from '../../lib/custodianPolicy';
import { User, UserRole, Claim, Mom, Liquidation, ClaimStatus, DelegationStatus, CashAdvance, CashAdvanceStatus, LiquidationStatus } from '../../lib/db/serverTypes';
import { state } from '../state';
import { isFinancialRecord } from '../constants';

export function isActiveDelegateFor(delegateId: string, approverId: string | undefined | null): boolean {
  return !!approverId && state.delegations.some(d =>
    d.delegate_id === delegateId && d.approver_id === approverId && d.status === DelegationStatus.ACTIVE
  );
}

export function canAccessClaim(user: User, claim: Claim): boolean {
  if (user.role === UserRole.ADMIN) return true;
  if (user.role === UserRole.REQUESTOR) return claim.requestor_id === user.id;
  if (user.role === UserRole.APPROVER) {
    return isFinancialRecord(claim.claim_type || 'Reimbursement', claim.status) || claim.current_approver_id === user.id || claim.original_approver_id === user.id ||
      claim.requestor_id === user.id || isActiveDelegateFor(user.id, claim.current_approver_id);
  }
  if (user.role === UserRole.CUSTODIAN) {
    return isCashTransactionMethod(claim.payment_method) && ([ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED].includes(claim.status)
      || claim.requestor_id === user.id);
  }
  return false;
}

export function canAccessMom(user: User, mom: Mom): boolean {
  if (user.role === UserRole.CUSTODIAN) return false;
  if (user.role === UserRole.ADMIN) return true;

  if (user.role === UserRole.REQUESTOR) return mom.requestor_id === user.id;
  if (user.role === UserRole.APPROVER) {
    const reporteeIds = state.users.filter(u => u.reports_to === user.id).map(u => u.id);
    const linkedClaim = state.claims.find(c => c.id === mom.claim_id || c.mom_id === mom.id);
    return Boolean(linkedClaim && isFinancialRecord(linkedClaim.claim_type || 'Reimbursement', linkedClaim.status)) || mom.requestor_id === user.id || !!(mom.claim_id && mom.requestor_id && reporteeIds.includes(mom.requestor_id));
  }
  return false;
}

export function canAccessLiquidation(user: User, l: Liquidation): boolean {
  if (user.role === UserRole.REQUESTOR) return l.requestorId === user.id;
  if (user.role === UserRole.APPROVER) {
    const reporteeIds = state.users.filter(u => u.reports_to === user.id).map(u => u.id);
    const relatedCa = state.cashAdvances.find(c => c.id === l.cashAdvanceId);
    return isFinancialRecord('Liquidation', l.status) || l.requestorId === user.id || relatedCa?.approverId === user.id ||
      reporteeIds.includes(l.requestorId) || isActiveDelegateFor(user.id, relatedCa?.approverId);
  }
  if (user.role === UserRole.CUSTODIAN) {
    const advance = state.cashAdvances.find(c => c.id === l.cashAdvanceId);
    return [LiquidationStatus.REVIEWED, LiquidationStatus.CLOSED].includes(l.status) && isCashTransactionMethod(l.refundMethod) && isCashTransactionMethod(advance?.releaseMethod);
  }
  return user.role === UserRole.ADMIN;
}

export function canAccessCashAdvance(user: User, advance: CashAdvance): boolean {
  if (user.role === UserRole.CUSTODIAN) return isCashTransactionMethod(advance.releaseMethod) && [CashAdvanceStatus.APPROVED, CashAdvanceStatus.RELEASED, CashAdvanceStatus.LIQUIDATED].includes(advance.status);
  if (user.role === UserRole.ADMIN) return true;
  if (user.role === UserRole.REQUESTOR) return advance.requestorId === user.id;
  return user.role === UserRole.APPROVER && (isFinancialRecord('Cash Advance', advance.status) || advance.requestorId === user.id || advance.approverId === user.id || state.users.some(u => u.id === advance.requestorId && u.reports_to === user.id) || isActiveDelegateFor(user.id, advance.approverId));
}

export function findUploadAccessCheck(uploadUrlPath: string): ((user: User) => boolean) | null {
  const claim = state.claims.find(c => c.receipt_url === uploadUrlPath);
  if (claim) return (user) => canAccessClaim(user, claim);

  const expense = state.expenses.find(e => e.receipt_url === uploadUrlPath || e.receipt_urls?.includes(uploadUrlPath));
  if (expense) {
    const parentClaim = state.claims.find(c => c.id === expense.claim_id);
    if (parentClaim) return (user) => canAccessClaim(user, parentClaim);
  }

  const mom = state.moms.find(m => m.file_url === uploadUrlPath);
  if (mom) return (user) => canAccessMom(user, mom);

  const liqItem = state.liquidationLineItems.find(li => li.receipt_url === uploadUrlPath);
  if (liqItem) {
    const parentLiquidation = state.liquidations.find(l => l.id === liqItem.liquidationId);
    if (parentLiquidation) return (user) => canAccessLiquidation(user, parentLiquidation);
  }

  return null;
}
