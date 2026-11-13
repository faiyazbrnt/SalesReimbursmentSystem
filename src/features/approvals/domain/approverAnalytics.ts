import { Claim, ClaimStatus, StatusHistory, User } from '../../../types';

export const APPROVED_CLAIM_STATUSES: ClaimStatus[] = [
  ClaimStatus.APPROVED,
  ClaimStatus.PROCESSING,
  ClaimStatus.READY_FOR_CLAIM,
  ClaimStatus.RELEASED,
  ClaimStatus.COMPLETED,
  ClaimStatus.CLOSED,
  ClaimStatus.LIQUIDATED,
];

/**
 * Checks whether a given claim was approved by the specified approver.
 * Requires an approved lifecycle status and either a matching approval
 * record in status history or current approver ownership.
 */
export function isClaimApprovedByApprover(
  claim: Claim,
  approverId: string,
  statusHistory: StatusHistory[] = []
): boolean {
  const isApprovedStatus =
    APPROVED_CLAIM_STATUSES.includes(claim.status) || Boolean(claim.approvedAt);

  if (!isApprovedStatus) return false;

  const hasApprovalInHistory = statusHistory.some(
    h =>
      h.claimId === claim.id &&
      h.changedBy === approverId &&
      (h.newStatus === ClaimStatus.APPROVED || h.newStatus === ClaimStatus.PROCESSING)
  );

  const isAssignedApprover = claim.approverId === approverId;

  return hasApprovalInHistory || isAssignedApprover;
}

/**
 * Filters a list of claims to include only those approved by the specified approver.
 */
export function filterClaimsApprovedByApprover(
  claims: Claim[],
  approverId: string,
  statusHistory: StatusHistory[] = []
): Claim[] {
  return claims.filter(c => isClaimApprovedByApprover(c, approverId, statusHistory));
}

export interface ApproverApprovedSpendOptions {
  timeframe?: 'week' | 'month';
  weekValue?: string; // e.g. "2026-W46"
  monthValue?: string; // e.g. "2026-11"
  now?: number;
}

/**
 * Parses an ISO week string (e.g. "2026-W46") into its start (Monday 00:00:00)
 * and end (Sunday 23:59:59.999) timestamps in UTC.
 */
export function parseIsoWeek(weekStr: string): { start: Date; end: Date } | null {
  const match = weekStr?.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  if (week < 1 || week > 53) return null;

  // Jan 4 is always in week 1 per ISO 8601
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monWeek1 = new Date(jan4.getTime() - (jan4Day - 1) * 24 * 60 * 60 * 1000);
  const start = new Date(monWeek1.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/**
 * Returns the ISO week string (e.g. "2026-W46") for a given date.
 */
export function getIsoWeekString(date: Date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNr);
  const year = target.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monWeek1 = new Date(jan4.getTime() - (jan4Day - 1) * 24 * 60 * 60 * 1000);
  const weekNo = Math.ceil(((target.getTime() - monWeek1.getTime()) / (24 * 60 * 60 * 1000) + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Formats an ISO week string (e.g. "2026-W46") into a human-readable label: "W46 (Nov 9–15)".
 */
export function formatWeekLabel(weekStr: string): string {
  const parsed = parseIsoWeek(weekStr);
  if (!parsed) return weekStr || 'Selected Week';
  const startMonth = parsed.start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const endMonth = parsed.end.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const startDay = parsed.start.getUTCDate();
  const endDay = parsed.end.getUTCDate();
  const match = weekStr.match(/^(\d{4})-W(\d{2})$/);
  const weekNum = match ? parseInt(match[2], 10) : '';

  if (startMonth === endMonth) {
    return `W${weekNum} (${startMonth} ${startDay}–${endDay})`;
  }
  return `W${weekNum} (${startMonth} ${startDay} – ${endMonth} ${endDay})`;
}

/**
 * Formats a month string (e.g. "2026-11") into a human-readable label: "November 2026".
 */
export function formatMonthLabel(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr || 'Selected Month';
  const [year, month] = monthStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
}

/**
 * Computes the total approved spend for an approver's approved claims,
 * filtered by either weekly rolling 7 days or a specific YYYY-MM month string.
 */
export function calculateApproverApprovedSpend(
  approvedClaims: Claim[],
  optionsOrMonth?: string | ApproverApprovedSpendOptions
): number {
  const options: ApproverApprovedSpendOptions =
    typeof optionsOrMonth === 'string'
      ? { timeframe: 'month', monthValue: optionsOrMonth }
      : optionsOrMonth || {};

  const { timeframe = 'month', weekValue, monthValue, now = Date.now() } = options;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weekRange = timeframe === 'week' && weekValue ? parseIsoWeek(weekValue) : null;

  return approvedClaims
    .filter(claim => {
      const spendDate = claim.approvedAt || claim.paidAt || claim.completedAt || claim.createdAt;
      if (!spendDate) return false;

      if (timeframe === 'week') {
        const time = new Date(spendDate).getTime();
        if (isNaN(time)) return false;
        if (weekRange) {
          return time >= weekRange.start.getTime() && time <= weekRange.end.getTime();
        }
        return time >= oneWeekAgo && time <= now;
      }

      if (monthValue) {
        return spendDate.slice(0, 7) === monthValue;
      }

      return true;
    })
    .reduce((sum, claim) => {
      if (claim.status === ClaimStatus.APPROVED) {
        return sum + (claim.approvedAmount ?? claim.total);
      }
      return sum + (claim.paidAmount || claim.approvedAmount || claim.total);
    }, 0);
}

/**
 * Returns members relevant to the approver's view: direct reports
 * and any user who has at least one claim approved by this approver.
 */
export function getApproverRelevantMembers(
  users: User[],
  approverId: string,
  approvedClaims: Claim[]
): User[] {
  const approvedRequestorIds = new Set(approvedClaims.map(c => c.requestorId));
  return users.filter(user => user.reportsTo === approverId || approvedRequestorIds.has(user.id));
}
