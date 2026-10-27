import { canAccessClaim, canAccessCashAdvance, canAccessLiquidation } from '../../server/services/authorization';
import {
  User, UserRole, ClaimStatus, CashAdvanceStatus, LiquidationStatus, StatusHistory
} from '../../lib/db/serverTypes';
import { state } from '../../server/state';
import { config } from '../../server/config';
import { isActiveDelegateFor } from '../../server/services/delegations';
import { isFinancialRecord, REIMBURSEMENT_CAP } from '../../server/constants';

type Result<T> = { status: number; body: T };
function userFor(id: string | null) { return state.users.find((user) => user.id === id || user.entra_object_id === id || user.user_principal_name === id); }

export type AnalyticsDateBasis = 'submitted' | 'expense' | 'approved' | 'paid' | 'completed';
export type AnalyticsRecord = {
  id: string;
  ref: string;
  type: 'Reimbursement' | 'Transport Reimbursement' | 'Cash Advance' | 'Liquidation';
  status: string;
  requestorId: string;
  requestorName: string;
  department: string;
  purpose: string;
  client?: string;
  claimedAmount: number;
  approvedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  completedAt?: string;
  categories: string[];
  paymentMethods: string[];
  lineItems: Array<{ category: string; amount: number; paymentMethod: string; expenseDate: string }>;
};

const sortedEntityHistory = (
  entityId: string,
  key: 'claim_id' | 'cash_advance_id' | 'liquidation_id'
) => state.statusHistories
  .filter(h => h[key] === entityId)
  .slice()
  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

const eventTimestamp = (history: StatusHistory[], statuses: string[]) =>
  history.find(h => statuses.includes(h.new_status))?.timestamp;

const normalizeAnalyticsStatus = (status: string) =>
  status === ClaimStatus.RETURNED || status === LiquidationStatus.RETURNED_FOR_REVISION
    ? 'Returned for Revision'
    : status;

const analyticsScopeIncludes = (
  user: User,
  type: AnalyticsRecord['type'],
  status: string,
  requestorId: string,
  approverId?: string,
  originalApproverId?: string
) => {
  if (user.role === UserRole.ADMIN) return true;
  if (user.role === UserRole.REQUESTOR) return requestorId === user.id;
  if (user.role === UserRole.APPROVER) {
    const isReportee = state.users.some(candidate => candidate.id === requestorId && candidate.reports_to === user.id);
    return isFinancialRecord(type, status) || requestorId === user.id
      || approverId === user.id
      || originalApproverId === user.id
      || isReportee
      || isActiveDelegateFor(user.id, approverId);
  }
  if (user.role === UserRole.CUSTODIAN) {
    if (requestorId === user.id) return true;
    if (type === 'Reimbursement' || type === 'Transport Reimbursement') {
      return [ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED].includes(status as ClaimStatus);
    }
    if (type === 'Cash Advance') {
      return [CashAdvanceStatus.APPROVED, CashAdvanceStatus.RELEASED, CashAdvanceStatus.LIQUIDATED].includes(status as CashAdvanceStatus);
    }
    return [LiquidationStatus.SUBMITTED, LiquidationStatus.REVIEWED, LiquidationStatus.CLOSED].includes(status as LiquidationStatus);
  }
  return false;
};

export const buildAnalyticsRecords = (user: User): AnalyticsRecord[] => {
  const reimbursementRecords: AnalyticsRecord[] = state.claims
    .filter(claim => analyticsScopeIncludes(
      user,
      'Reimbursement',
      claim.status,
      claim.requestor_id,
      claim.current_approver_id,
      claim.original_approver_id
    ))
    .map(claim => {
      const history = sortedEntityHistory(claim.id, 'claim_id');
      const requestor = state.users.find(candidate => candidate.id === claim.requestor_id);
      const mom = state.moms.find(candidate => candidate.id === claim.mom_id);
      const items = state.expenses.filter(item => item.claim_id === claim.id);
      const claimedAmount = Number(claim.total_amount) || 0;
      const approvedAmount = Number(claim.approved_amount)
        || (config.demoMode && [ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED].includes(claim.status)
          ? Math.min(claimedAmount, REIMBURSEMENT_CAP)
          : 0);
      const paidAmount = Number(claim.paid_amount)
        || (config.demoMode && [ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED].includes(claim.status) ? approvedAmount : 0);
      return {
        id: claim.id,
        ref: claim.claim_number || `REIM-${claim.id.slice(0, 6)}`,
        type: claim.claim_type === 'Transport Reimbursement' ? 'Transport Reimbursement' : 'Reimbursement',
        status: normalizeAnalyticsStatus(claim.status),
        requestorId: claim.requestor_id,
        requestorName: requestor?.name || 'Unknown',
        department: requestor?.department || 'Unknown',
        purpose: claim.remarks || mom?.purpose || claim.expense_category || 'Reimbursement',
        client: mom?.client,
        claimedAmount,
        approvedAmount,
        paidAmount,
        outstandingAmount: Math.max(approvedAmount - paidAmount, 0),
        createdAt: claim.created_at,
        submittedAt: eventTimestamp(history, [ClaimStatus.PENDING_APPROVAL]),
        approvedAt: claim.approved_at || eventTimestamp(history, [ClaimStatus.APPROVED, ClaimStatus.PROCESSING]),
        paidAt: claim.paid_at || eventTimestamp(history, [ClaimStatus.READY_FOR_CLAIM]),
        completedAt: eventTimestamp(history, [ClaimStatus.COMPLETED]),
        categories: Array.from(new Set(items.map(item => item.category).filter(Boolean))),
        paymentMethods: Array.from(new Set([
          claim.payment_method,
          ...items.map(item => item.payment_method),
        ].filter((value): value is string => Boolean(value)))),
        lineItems: items.map(item => ({
          category: item.category,
          amount: Number(item.amount) || 0,
          paymentMethod: item.payment_method,
          expenseDate: item.expense_date,
        })),
      };
    });

  const advanceRecords: AnalyticsRecord[] = state.cashAdvances
    .filter(advance => analyticsScopeIncludes(
      user,
      'Cash Advance',
      advance.status,
      advance.requestorId,
      advance.approverId
    ))
    .map(advance => {
      const history = sortedEntityHistory(advance.id, 'cash_advance_id');
      const requestor = state.users.find(candidate => candidate.id === advance.requestorId);
      const mom = advance.momId ? state.moms.find(candidate => candidate.id === advance.momId) : undefined;
      const claimedAmount = Number(advance.amount) || 0;
      const approvedAmount = [CashAdvanceStatus.APPROVED, CashAdvanceStatus.RELEASED, CashAdvanceStatus.LIQUIDATED].includes(advance.status)
        ? claimedAmount
        : 0;
      const paidAmount = Number(advance.paidAmount)
        || ([CashAdvanceStatus.RELEASED, CashAdvanceStatus.LIQUIDATED].includes(advance.status) ? claimedAmount : 0);
      return {
        id: advance.id,
        ref: `CADV-${advance.id.slice(0, 6)}`,
        type: 'Cash Advance',
        status: normalizeAnalyticsStatus(advance.status),
        requestorId: advance.requestorId,
        requestorName: requestor?.name || 'Unknown',
        department: requestor?.department || 'Unknown',
        purpose: advance.purpose,
        client: mom?.client,
        claimedAmount,
        approvedAmount,
        paidAmount,
        outstandingAmount: Math.max(approvedAmount - paidAmount, 0),
        createdAt: advance.createdAt,
        submittedAt: eventTimestamp(history, [CashAdvanceStatus.SUBMITTED]),
        approvedAt: advance.approvedAt || eventTimestamp(history, [CashAdvanceStatus.APPROVED]),
        paidAt: advance.releaseDate || eventTimestamp(history, [CashAdvanceStatus.RELEASED]),
        completedAt: eventTimestamp(history, [CashAdvanceStatus.LIQUIDATED]),
        categories: [],
        paymentMethods: advance.releaseMethod ? [advance.releaseMethod] : [],
        lineItems: [],
      };
    });

  const liquidationRecords: AnalyticsRecord[] = state.liquidations
    .filter(liquidation => {
      const advance = state.cashAdvances.find(candidate => candidate.id === liquidation.cashAdvanceId);
      return analyticsScopeIncludes(
        user,
        'Liquidation',
        liquidation.status,
        liquidation.requestorId,
        advance?.approverId
      );
    })
    .map(liquidation => {
      const history = sortedEntityHistory(liquidation.id, 'liquidation_id');
      const requestor = state.users.find(candidate => candidate.id === liquidation.requestorId);
      const advance = state.cashAdvances.find(candidate => candidate.id === liquidation.cashAdvanceId);
      const mom = advance?.momId ? state.moms.find(candidate => candidate.id === advance.momId) : undefined;
      const items = state.liquidationLineItems.filter(item => item.liquidationId === liquidation.id);
      const claimedAmount = Number(liquidation.totalSpent) || 0;
      const approvedAmount = [LiquidationStatus.REVIEWED, LiquidationStatus.CLOSED].includes(liquidation.status)
        ? claimedAmount
        : 0;
      return {
        id: liquidation.id,
        ref: `LIQ-${liquidation.id.slice(0, 6)}`,
        type: 'Liquidation',
        status: normalizeAnalyticsStatus(liquidation.status),
        requestorId: liquidation.requestorId,
        requestorName: requestor?.name || 'Unknown',
        department: requestor?.department || 'Unknown',
        purpose: advance?.purpose || 'Liquidation',
        client: mom?.client,
        claimedAmount,
        approvedAmount,
        paidAmount: 0,
        outstandingAmount: 0,
        createdAt: liquidation.createdAt,
        submittedAt: eventTimestamp(history, [LiquidationStatus.SUBMITTED]),
        approvedAt: eventTimestamp(history, [LiquidationStatus.REVIEWED, LiquidationStatus.CLOSED]),
        completedAt: eventTimestamp(history, [LiquidationStatus.CLOSED]),
        categories: Array.from(new Set(items.map(item => item.category).filter(Boolean))),
        paymentMethods: Array.from(new Set([
          liquidation.refundMethod,
          ...items.map(item => item.payment_method),
        ].filter((value): value is string => Boolean(value)))),
        lineItems: items.map(item => ({
          category: item.category,
          amount: Number(item.amount) || 0,
          paymentMethod: item.payment_method,
          expenseDate: item.expense_date,
        })),
      };
    });

  return [...reimbursementRecords, ...advanceRecords, ...liquidationRecords].filter(record => {
    if (user.role !== UserRole.CUSTODIAN) return true;
    if (record.type === 'Cash Advance') return canAccessCashAdvance(user, state.cashAdvances.find(item => item.id === record.id)!);
    if (record.type === 'Liquidation') return canAccessLiquidation(user, state.liquidations.find(item => item.id === record.id)!);
    return canAccessClaim(user, state.claims.find(item => item.id === record.id)!);
  });
};

export function getAnalyticsSummary(userId: string | null, queryParams: URLSearchParams): Result<unknown> {
  const user = userFor(userId);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };

  const scopedRecords = buildAnalyticsRecords(user).filter(record => queryParams.get('scope') !== 'financial' || isFinancialRecord(record.type, record.status));
  const {
    dateBasis = 'submitted',
    dateFrom,
    dateTo,
    type,
    status,
    department,
    requestorId,
    client,
    category,
    paymentMethod,
    search,
  } = Object.fromEntries(queryParams.entries()) as Record<string, string | undefined>;
  const basis = (['submitted', 'expense', 'approved', 'paid', 'completed'].includes(dateBasis)
    ? dateBasis
    : 'submitted') as AnalyticsDateBasis;

  const dateForRecord = (record: AnalyticsRecord): string | undefined => {
    if (basis === 'expense') {
      const dates = record.lineItems.map(item => item.expenseDate).filter(Boolean).sort();
      return dates[0];
    }
    if (basis === 'approved') return record.approvedAt;
    if (basis === 'paid') return record.paidAt;
    if (basis === 'completed') return record.completedAt;
    return record.submittedAt;
  };

  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : undefined;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : undefined;
  const query = search?.trim().toLowerCase();
  const filteredRecords = scopedRecords.filter(record => {
    if (type && record.type !== type) return false;
    if (status && record.status !== status) return false;
    if (department && record.department !== department) return false;
    if (requestorId && record.requestorId !== requestorId) return false;
    if (client && record.client !== client) return false;
    if (category && !record.categories.includes(category)) return false;
    if (paymentMethod && !record.paymentMethods.includes(paymentMethod)) return false;
    if (query && ![
      record.ref,
      record.requestorName,
      record.department,
      record.purpose,
      record.client,
    ].some(value => value?.toLowerCase().includes(query))) return false;
    if (fromTime !== undefined || toTime !== undefined) {
      const date = dateForRecord(record);
      if (!date) return false;
      const time = new Date(date).getTime();
      if (!Number.isFinite(time)) return false;
      if (fromTime !== undefined && time < fromTime) return false;
      if (toTime !== undefined && time > toTime) return false;
    }
    return true;
  }).sort((a, b) =>
    new Date(dateForRecord(b) || b.createdAt).getTime() - new Date(dateForRecord(a) || a.createdAt).getTime()
  );

  const sumBy = (selector: (record: AnalyticsRecord) => number) =>
    filteredRecords.reduce((total, record) => total + selector(record), 0);
  const aggregateBy = (selector: (record: AnalyticsRecord) => string) => {
    const groups = new Map<string, { name: string; count: number; claimedAmount: number; approvedAmount: number; paidAmount: number }>();
    filteredRecords.forEach(record => {
      const name = selector(record) || 'Unknown';
      const group = groups.get(name) || { name, count: 0, claimedAmount: 0, approvedAmount: 0, paidAmount: 0 };
      group.count += 1;
      group.claimedAmount += record.claimedAmount;
      group.approvedAmount += record.approvedAmount;
      group.paidAmount += record.paidAmount;
      groups.set(name, group);
    });
    return Array.from(groups.values()).sort((a, b) => b.claimedAmount - a.claimedAmount);
  };

  const categoryTotals = new Map<string, { name: string; count: number; amount: number }>();
  filteredRecords.forEach(record => {
    record.lineItems
      .filter(item => !category || item.category === category)
      .forEach(item => {
        const group = categoryTotals.get(item.category) || { name: item.category, count: 0, amount: 0 };
        group.count += 1;
        group.amount += item.amount;
        categoryTotals.set(item.category, group);
      });
  });

  const approvalDurations = filteredRecords
    .filter(record => record.submittedAt && record.approvedAt)
    .map(record => new Date(record.approvedAt!).getTime() - new Date(record.submittedAt!).getTime())
    .filter(duration => duration >= 0);

  const uniqueSorted = (values: Array<string | undefined>) =>
    Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));

  return { status: 200, body: {
    appliedFilters: { dateBasis: basis, dateFrom, dateTo, type, status, department, requestorId, client, category, paymentMethod, search },
    metrics: {
      recordCount: filteredRecords.length,
      lineItemCount: filteredRecords.reduce((total, record) => total + record.lineItems.length, 0),
      claimedAmount: sumBy(record => record.claimedAmount),
      approvedAmount: sumBy(record => record.approvedAmount),
      paidAmount: sumBy(record => record.paidAmount),
      outstandingAmount: sumBy(record => record.outstandingAmount),
      avgApprovalTurnaroundDays: approvalDurations.length
        ? approvalDurations.reduce((total, duration) => total + duration, 0) / approvalDurations.length / (1000 * 60 * 60 * 24)
        : null,
    },
    breakdowns: {
      byStatus: aggregateBy(record => record.status),
      byType: aggregateBy(record => record.type),
      byRequestor: aggregateBy(record => record.requestorName),
      byDepartment: aggregateBy(record => record.department),
      byCategory: Array.from(categoryTotals.values()).sort((a, b) => b.amount - a.amount),
    },
    dimensions: {
      types: uniqueSorted(scopedRecords.map(record => record.type)),
      statuses: uniqueSorted(scopedRecords.map(record => record.status)),
      departments: uniqueSorted(scopedRecords.map(record => record.department)),
      requestors: Array.from(new Map(scopedRecords.map(record => [
        record.requestorId,
        { id: record.requestorId, name: record.requestorName },
      ])).values()).sort((a, b) => a.name.localeCompare(b.name)),
      clients: uniqueSorted(scopedRecords.map(record => record.client)),
      categories: uniqueSorted(scopedRecords.flatMap(record => record.categories)),
      paymentMethods: uniqueSorted(scopedRecords.flatMap(record => record.paymentMethods)),
    },
    records: filteredRecords.map(({ lineItems: _lineItems, categories, paymentMethods, ...record }) => ({
      ...record,
      categories,
      paymentMethods,
    })),
  } };
}
