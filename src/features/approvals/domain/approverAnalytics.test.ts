import { describe, it, expect } from 'vitest';
import {
  isClaimApprovedByApprover,
  filterClaimsApprovedByApprover,
  calculateApproverApprovedSpend,
  getApproverRelevantMembers,
  APPROVED_CLAIM_STATUSES,
  parseIsoWeek,
  getIsoWeekString,
  formatWeekLabel,
  formatMonthLabel,
} from './approverAnalytics';
import { Claim, ClaimStatus, StatusHistory, User } from '../../../types';

describe('Ticket 4: Role-Based Access - Scope Approver Analytics to Approved Claims', () => {
  const approverId = 'approver-1';
  const otherApproverId = 'approver-2';

  const mockUsers: User[] = [
    { id: 'user-1', name: 'Alice Reyes', department: 'Sales', reportsTo: approverId } as User,
    { id: 'user-2', name: 'Bob Cruz', department: 'Marketing', reportsTo: approverId } as User,
    { id: 'user-3', name: 'Charlie Santos', department: 'Finance', reportsTo: 'other-mgr' } as User,
  ];

  const mockApprovedClaim: Claim = {
    id: 'claim-1',
    ref: 'REIM-001',
    requestorId: 'user-1',
    status: ClaimStatus.APPROVED,
    total: 800,
    claimedAmount: 800,
    approvedAmount: 800,
    paidAmount: 0,
    approverId,
    approvedAt: '2026-11-10T10:00:00Z',
    createdAt: '2026-11-08T10:00:00Z',
    type: 'Reimbursement',
    purpose: 'Client Lunch',
  };

  const mockCompletedClaim: Claim = {
    id: 'claim-2',
    ref: 'REIM-002',
    requestorId: 'user-3', // Cross-department, approved via delegation or reassignment
    status: ClaimStatus.COMPLETED,
    total: 1200,
    claimedAmount: 1200,
    approvedAmount: 1000,
    paidAmount: 1000,
    approverId,
    approvedAt: '2026-11-12T14:00:00Z',
    paidAt: '2026-11-13T09:00:00Z',
    completedAt: '2026-11-13T10:00:00Z',
    createdAt: '2026-11-09T10:00:00Z',
    type: 'Reimbursement',
    purpose: 'Client Travel',
  };

  const mockPendingClaim: Claim = {
    id: 'claim-3',
    ref: 'REIM-003',
    requestorId: 'user-1',
    status: ClaimStatus.PENDING_APPROVAL,
    total: 500,
    claimedAmount: 500,
    paidAmount: 0,
    approverId,
    createdAt: '2026-11-13T08:00:00Z',
    type: 'Reimbursement',
    purpose: 'Office Supplies',
  };

  const mockRejectedClaim: Claim = {
    id: 'claim-4',
    ref: 'REIM-004',
    requestorId: 'user-2',
    status: ClaimStatus.REJECTED,
    total: 300,
    claimedAmount: 300,
    paidAmount: 0,
    approverId,
    createdAt: '2026-11-05T08:00:00Z',
    type: 'Reimbursement',
    purpose: 'Snacks',
  };

  const mockOtherApproverClaim: Claim = {
    id: 'claim-5',
    ref: 'REIM-005',
    requestorId: 'user-2', // Direct report, but approved by someone else while approver was away
    status: ClaimStatus.APPROVED,
    total: 600,
    claimedAmount: 600,
    approvedAmount: 600,
    paidAmount: 0,
    approverId: otherApproverId,
    approvedAt: '2026-11-11T11:00:00Z',
    createdAt: '2026-11-09T08:00:00Z',
    type: 'Reimbursement',
    purpose: 'Stationery',
  };

  const mockHistory: StatusHistory[] = [
    {
      id: 'h-1',
      claimId: 'claim-1',
      oldStatus: ClaimStatus.PENDING_APPROVAL,
      newStatus: ClaimStatus.APPROVED,
      changedBy: approverId,
      timestamp: '2026-11-10T10:00:00Z',
    },
    {
      id: 'h-2',
      claimId: 'claim-2',
      oldStatus: ClaimStatus.PENDING_APPROVAL,
      newStatus: ClaimStatus.PROCESSING,
      changedBy: approverId,
      timestamp: '2026-11-12T14:00:00Z',
    },
    {
      id: 'h-4',
      claimId: 'claim-4',
      oldStatus: ClaimStatus.PENDING_APPROVAL,
      newStatus: ClaimStatus.REJECTED,
      changedBy: approverId,
      timestamp: '2026-11-06T10:00:00Z',
    },
    {
      id: 'h-5',
      claimId: 'claim-5',
      oldStatus: ClaimStatus.PENDING_APPROVAL,
      newStatus: ClaimStatus.APPROVED,
      changedBy: otherApproverId,
      timestamp: '2026-11-11T11:00:00Z',
    },
  ];

  it('verifies APPROVED_CLAIM_STATUSES contains all approved lifecycle stages', () => {
    expect(APPROVED_CLAIM_STATUSES).toContain(ClaimStatus.APPROVED);
    expect(APPROVED_CLAIM_STATUSES).toContain(ClaimStatus.PROCESSING);
    expect(APPROVED_CLAIM_STATUSES).toContain(ClaimStatus.READY_FOR_CLAIM);
    expect(APPROVED_CLAIM_STATUSES).toContain(ClaimStatus.RELEASED);
    expect(APPROVED_CLAIM_STATUSES).toContain(ClaimStatus.COMPLETED);
    expect(APPROVED_CLAIM_STATUSES).toContain(ClaimStatus.CLOSED);
    expect(APPROVED_CLAIM_STATUSES).toContain(ClaimStatus.LIQUIDATED);
    expect(APPROVED_CLAIM_STATUSES).not.toContain(ClaimStatus.PENDING_APPROVAL);
    expect(APPROVED_CLAIM_STATUSES).not.toContain(ClaimStatus.REJECTED);
    expect(APPROVED_CLAIM_STATUSES).not.toContain(ClaimStatus.DRAFT);
  });

  describe('isClaimApprovedByApprover', () => {
    it('returns true for a claim approved by the approver', () => {
      expect(isClaimApprovedByApprover(mockApprovedClaim, approverId, mockHistory)).toBe(true);
      expect(isClaimApprovedByApprover(mockCompletedClaim, approverId, mockHistory)).toBe(true);
    });

    it('returns false for pending or rejected claims', () => {
      expect(isClaimApprovedByApprover(mockPendingClaim, approverId, mockHistory)).toBe(false);
      expect(isClaimApprovedByApprover(mockRejectedClaim, approverId, mockHistory)).toBe(false);
    });

    it('returns false for claims approved by a different approver even if from a direct report', () => {
      expect(isClaimApprovedByApprover(mockOtherApproverClaim, approverId, mockHistory)).toBe(false);
    });
  });

  describe('filterClaimsApprovedByApprover', () => {
    it('filters a list to strictly only claims approved by the approver', () => {
      const allClaims = [
        mockApprovedClaim,
        mockCompletedClaim,
        mockPendingClaim,
        mockRejectedClaim,
        mockOtherApproverClaim,
      ];

      const filtered = filterClaimsApprovedByApprover(allClaims, approverId, mockHistory);
      expect(filtered.map(c => c.id)).toEqual(['claim-1', 'claim-2']);
    });
  });

  describe('calculateApproverApprovedSpend', () => {
    it('sums approved amount for claims approved by the approver in the selected month', () => {
      const approvedClaims = [mockApprovedClaim, mockCompletedClaim];
      const spend = calculateApproverApprovedSpend(approvedClaims, '2026-11');
      // mockApprovedClaim: 800 (approvedAmount)
      // mockCompletedClaim: 1000 (paidAmount/approvedAmount)
      expect(spend).toBe(1800);
    });

    it('returns 0 when no claims match the month', () => {
      const approvedClaims = [mockApprovedClaim, mockCompletedClaim];
      const spend = calculateApproverApprovedSpend(approvedClaims, '2026-10');
      expect(spend).toBe(0);
    });

    it('calculates approved spend for weekly rolling timeframe', () => {
      // mockApprovedClaim approved at 2026-11-10T10:00:00Z
      // mockCompletedClaim approved at 2026-11-12T14:00:00Z
      const now = new Date('2026-11-13T12:00:00Z').getTime(); // within 7 days of both
      const approvedClaims = [mockApprovedClaim, mockCompletedClaim];

      const spend = calculateApproverApprovedSpend(approvedClaims, {
        timeframe: 'week',
        now,
      });
      expect(spend).toBe(1800);

      // If evaluated at 2026-11-18, claim-1 (approved 2026-11-10) is older than 7 days
      const futureNow = new Date('2026-11-18T12:00:00Z').getTime();
      const futureSpend = calculateApproverApprovedSpend(approvedClaims, {
        timeframe: 'week',
        now: futureNow,
      });
      expect(futureSpend).toBe(1000); // only claim-2 is within 7 days
    });

    it('calculates approved spend for specific chosen ISO week', () => {
      // mockApprovedClaim approved at 2026-11-10 (Week 46 of 2026)
      // mockCompletedClaim approved at 2026-11-12 (Week 46 of 2026)
      const approvedClaims = [mockApprovedClaim, mockCompletedClaim];

      const spendWeek46 = calculateApproverApprovedSpend(approvedClaims, {
        timeframe: 'week',
        weekValue: '2026-W46',
      });
      expect(spendWeek46).toBe(1800);

      const spendWeek45 = calculateApproverApprovedSpend(approvedClaims, {
        timeframe: 'week',
        weekValue: '2026-W45',
      });
      expect(spendWeek45).toBe(0);
    });

    it('handles ISO week helpers correctly', () => {
      const nov13 = new Date(Date.UTC(2026, 10, 13)); // 2026-11-13
      expect(getIsoWeekString(nov13)).toBe('2026-W46');

      const parsed = parseIsoWeek('2026-W46');
      expect(parsed).not.toBeNull();
      expect(parsed?.start.toISOString().slice(0, 10)).toBe('2026-11-09');
      expect(parsed?.end.toISOString().slice(0, 10)).toBe('2026-11-15');

      expect(formatWeekLabel('2026-W46')).toContain('W46');
      expect(formatMonthLabel('2026-11')).toBe('November 2026');
    });
  });

  describe('getApproverRelevantMembers', () => {
    it('includes direct reports and users whose claims were approved by this approver', () => {
      const approvedClaims = [mockApprovedClaim, mockCompletedClaim];
      const members = getApproverRelevantMembers(mockUsers, approverId, approvedClaims);
      const memberIds = members.map(m => m.id);

      expect(memberIds).toContain('user-1'); // direct report + approved claim
      expect(memberIds).toContain('user-2'); // direct report
      expect(memberIds).toContain('user-3'); // cross-department user with approved claim
    });
  });
});
