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

/**
 * Computes the total approved spend for an approver's approved claims,
 * optionally constrained to a specific YYYY-MM month string.
 */
export function calculateApproverApprovedSpend(
  approvedClaims: Claim[],
  monthValue?: string
): number {
  return approvedClaims
    .filter(claim => {
      if (!monthValue) return true;
      const spendDate = claim.approvedAt || claim.paidAt || claim.completedAt || claim.createdAt;
      return spendDate?.slice(0, 7) === monthValue;
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
