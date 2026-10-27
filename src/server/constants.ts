import { ClaimStatus, CashAdvanceStatus, LiquidationStatus } from '../lib/db/serverTypes';

export const REIMBURSEMENT_CAP = 1000;
export const LIQUIDATION_DEADLINE_DAYS = 7;
export const STALE_APPROVER_FALLBACK_DAYS = 7;

export const RELEASE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RELEASE_CODE_VALIDITY_DAYS = 14;
export const RELEASE_CODE_MAX_ATTEMPTS = 5;
export const RELEASE_CODE_LOCKOUT_MINUTES = 15;

export const FINANCIAL_REIMBURSEMENT_STATUSES = new Set<string>([
  ClaimStatus.APPROVED,
  ClaimStatus.PROCESSING,
  ClaimStatus.READY_FOR_CLAIM,
  ClaimStatus.COMPLETED,
]);

export const FINANCIAL_CASH_ADVANCE_STATUSES = new Set<string>([
  CashAdvanceStatus.APPROVED,
  CashAdvanceStatus.RELEASED,
  CashAdvanceStatus.LIQUIDATED,
]);

export const FINANCIAL_LIQUIDATION_STATUSES = new Set<string>([
  LiquidationStatus.REVIEWED,
  LiquidationStatus.CLOSED,
]);

export function isFinancialRecord(
  type: 'Reimbursement' | 'Transport Reimbursement' | 'Cash Advance' | 'Liquidation',
  status: string,
): boolean {
  if (type === 'Cash Advance') return FINANCIAL_CASH_ADVANCE_STATUSES.has(status);
  if (type === 'Liquidation') return FINANCIAL_LIQUIDATION_STATUSES.has(status);
  return FINANCIAL_REIMBURSEMENT_STATUSES.has(status);
}

export function formatPHP(n: number): string {
  return `PHP ${Number(n).toLocaleString('en-PH')}`;
}
