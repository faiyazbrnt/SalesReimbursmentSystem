import { describe, it, expect, beforeEach } from 'vitest';
import { analyticsScopeIncludes, buildAnalyticsRecords, getAnalyticsSummary } from '../src/services/analytics/analytics';
import { User, UserRole, ClaimStatus, CashAdvanceStatus, LiquidationStatus } from '../src/lib/db/serverTypes';
import { state } from '../src/server/state';

describe('Ticket 4: Backend Analytics Scoping for Approvers', () => {
  const approverUser: User = {
    id: 'test-approver',
    name: 'Test Approver',
    email: 'approver@example.com',
    role: UserRole.APPROVER,
    department: 'Sales',
    job_title: 'Sales Director',
    reports_to: null,
  };

  const otherApproverUser: User = {
    id: 'other-approver',
    name: 'Other Approver',
    email: 'other@example.com',
    role: UserRole.APPROVER,
    department: 'Marketing',
    job_title: 'Marketing Director',
    reports_to: null,
  };

  const directReportUser: User = {
    id: 'reportee-1',
    name: 'Direct Report 1',
    email: 'reportee1@example.com',
    role: UserRole.REQUESTOR,
    department: 'Sales',
    job_title: 'Sales Rep',
    reports_to: 'test-approver',
  };

  beforeEach(() => {
    state.users = [approverUser, otherApproverUser, directReportUser];
    state.claims = [];
    state.cashAdvances = [];
    state.liquidations = [];
    state.approvals = [];
    state.statusHistories = [];
    state.delegations = [];
  });

  describe('analyticsScopeIncludes for Approver', () => {
    it('includes claims that are in an approved status and approved by this approver', () => {
      const claimApproved = analyticsScopeIncludes(
        approverUser,
        'Reimbursement',
        ClaimStatus.APPROVED,
        'reportee-1',
        'test-approver',
        'test-approver',
        'claim-101'
      );
      expect(claimApproved).toBe(true);

      const claimCompleted = analyticsScopeIncludes(
        approverUser,
        'Reimbursement',
        ClaimStatus.COMPLETED,
        'reportee-1',
        'test-approver',
        'test-approver',
        'claim-102'
      );
      expect(claimCompleted).toBe(true);
    });

    it('excludes unapproved claims even if from a direct report', () => {
      const claimPending = analyticsScopeIncludes(
        approverUser,
        'Reimbursement',
        ClaimStatus.PENDING_APPROVAL,
        'reportee-1',
        'test-approver',
        'test-approver',
        'claim-103'
      );
      expect(claimPending).toBe(false);

      const claimDraft = analyticsScopeIncludes(
        approverUser,
        'Reimbursement',
        ClaimStatus.DRAFT,
        'reportee-1',
        'test-approver',
        'test-approver',
        'claim-104'
      );
      expect(claimDraft).toBe(false);

      const claimRejected = analyticsScopeIncludes(
        approverUser,
        'Reimbursement',
        ClaimStatus.REJECTED,
        'reportee-1',
        'test-approver',
        'test-approver',
        'claim-105'
      );
      expect(claimRejected).toBe(false);
    });

    it('excludes claims approved by another approver even if requestor is a direct report', () => {
      const otherApproverClaim = analyticsScopeIncludes(
        approverUser,
        'Reimbursement',
        ClaimStatus.APPROVED,
        'reportee-1',
        'other-approver',
        'other-approver',
        'claim-106'
      );
      expect(otherApproverClaim).toBe(false);
    });

    it('excludes claims requested by the approver themselves unless approved by them', () => {
      const ownPendingClaim = analyticsScopeIncludes(
        approverUser,
        'Reimbursement',
        ClaimStatus.PENDING_APPROVAL,
        'test-approver',
        'other-approver',
        'other-approver',
        'claim-107'
      );
      expect(ownPendingClaim).toBe(false);
    });
  });

  describe('buildAnalyticsRecords and getAnalyticsSummary for Approver', () => {
    it('scopes analytics records and summary strictly to approved claims approved by the approver', () => {
      state.claims = [
        {
          id: 'claim-1',
          claim_number: 'REIM-001',
          claim_type: 'Reimbursement',
          status: ClaimStatus.APPROVED,
          requestor_id: 'reportee-1',
          current_approver_id: 'test-approver',
          original_approver_id: 'test-approver',
          total_amount: 800,
          approved_amount: 800,
          paid_amount: 0,
          created_at: '2026-11-01T08:00:00Z',
          approved_at: '2026-11-02T08:00:00Z',
          updated_at: '2026-11-02T08:00:00Z',
        } as any,
        {
          id: 'claim-2',
          claim_number: 'REIM-002',
          claim_type: 'Reimbursement',
          status: ClaimStatus.PENDING_APPROVAL, // Should be excluded
          requestor_id: 'reportee-1',
          current_approver_id: 'test-approver',
          original_approver_id: 'test-approver',
          total_amount: 1500,
          created_at: '2026-11-03T08:00:00Z',
          updated_at: '2026-11-03T08:00:00Z',
        } as any,
        {
          id: 'claim-3',
          claim_number: 'REIM-003',
          claim_type: 'Reimbursement',
          status: ClaimStatus.APPROVED,
          requestor_id: 'reportee-1',
          current_approver_id: 'other-approver', // Should be excluded (other approver)
          original_approver_id: 'other-approver',
          total_amount: 2000,
          approved_amount: 2000,
          paid_amount: 0,
          created_at: '2026-11-04T08:00:00Z',
          approved_at: '2026-11-05T08:00:00Z',
          updated_at: '2026-11-05T08:00:00Z',
        } as any,
      ];

      const records = buildAnalyticsRecords(approverUser);
      expect(records.length).toBe(1);
      expect(records[0].id).toBe('claim-1');
      expect(records[0].approvedAmount).toBe(800);

      const summaryResult = getAnalyticsSummary('test-approver', new URLSearchParams());
      expect(summaryResult.status).toBe(200);
      const summary = summaryResult.body as any;

      expect(summary.metrics.recordCount).toBe(1);
      expect(summary.metrics.approvedAmount).toBe(800);
      expect(summary.records.map((r: any) => r.id)).toEqual(['claim-1']);
    });
  });
});
