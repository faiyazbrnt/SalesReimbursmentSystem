import { describe, it, expect, beforeEach } from 'vitest';
import { analyticsScopeIncludes, buildAnalyticsRecords, getAnalyticsSummary } from '../src/services/analytics/analytics';
import { User, UserRole, ClaimStatus, CashAdvanceStatus, LiquidationStatus } from '../src/lib/db/serverTypes';
import { state } from '../src/server/state';
import { getNavItems } from '../src/components/layout/Sidebar';

describe('Ticket 5: Role-Based Access – Migrate Overall Analytics to Custodian Role', () => {
  const custodianUser: User = {
    id: 'test-custodian',
    name: 'Carol Custodian',
    email: 'custodian@example.com',
    role: UserRole.CUSTODIAN,
    department: 'Finance',
    job_title: 'Reimbursement Custodian',
    reports_to: null,
  };

  const adminUser: User = {
    id: 'test-admin',
    name: 'Dave Admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    department: 'IT',
    job_title: 'System Admin',
    reports_to: null,
  };

  const requestorUser1: User = {
    id: 'req-1',
    name: 'Alice Requestor',
    email: 'alice@example.com',
    role: UserRole.REQUESTOR,
    department: 'Sales',
    job_title: 'Sales Exec',
    reports_to: 'app-1',
  };

  const requestorUser2: User = {
    id: 'req-2',
    name: 'Charlie Requestor',
    email: 'charlie@example.com',
    role: UserRole.REQUESTOR,
    department: 'Marketing',
    job_title: 'Marketing Specialist',
    reports_to: 'app-1',
  };

  const approverUser: User = {
    id: 'app-1',
    name: 'Bob Approver',
    email: 'bob@example.com',
    role: UserRole.APPROVER,
    department: 'Sales',
    job_title: 'Sales Director',
    reports_to: null,
  };

  beforeEach(() => {
    state.users = [custodianUser, adminUser, requestorUser1, requestorUser2, approverUser];
    state.claims = [];
    state.cashAdvances = [];
    state.liquidations = [];
    state.approvals = [];
    state.statusHistories = [];
    state.delegations = [];
    state.expenses = [];
    state.moms = [];
  });

  describe('analyticsScopeIncludes for Custodian vs Admin', () => {
    it('provisions Custodian access to all claim types across all statuses organization-wide', () => {
      // Reimbursements in various statuses (including draft, pending, returned, rejected)
      expect(analyticsScopeIncludes(custodianUser, 'Reimbursement', ClaimStatus.DRAFT, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Reimbursement', ClaimStatus.PENDING_APPROVAL, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Reimbursement', ClaimStatus.APPROVED, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Reimbursement', ClaimStatus.PROCESSING, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Reimbursement', ClaimStatus.READY_FOR_CLAIM, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Reimbursement', ClaimStatus.COMPLETED, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Reimbursement', ClaimStatus.RETURNED, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Reimbursement', ClaimStatus.REJECTED, 'req-1')).toBe(true);

      // Transport Reimbursements
      expect(analyticsScopeIncludes(custodianUser, 'Transport Reimbursement', ClaimStatus.PENDING_APPROVAL, 'req-2')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Transport Reimbursement', ClaimStatus.APPROVED, 'req-2')).toBe(true);

      // Cash Advances across statuses
      expect(analyticsScopeIncludes(custodianUser, 'Cash Advance', CashAdvanceStatus.SUBMITTED, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Cash Advance', CashAdvanceStatus.APPROVED, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Cash Advance', CashAdvanceStatus.RELEASED, 'req-1')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Cash Advance', CashAdvanceStatus.LIQUIDATED, 'req-1')).toBe(true);

      // Liquidations across statuses
      expect(analyticsScopeIncludes(custodianUser, 'Liquidation', LiquidationStatus.SUBMITTED, 'req-2')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Liquidation', LiquidationStatus.REVIEWED, 'req-2')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Liquidation', LiquidationStatus.CLOSED, 'req-2')).toBe(true);
      expect(analyticsScopeIncludes(custodianUser, 'Liquidation', LiquidationStatus.RETURNED_FOR_REVISION, 'req-2')).toBe(true);
    });

    it('denies Admin global analytics scope (migrated exclusively to Custodian)', () => {
      expect(analyticsScopeIncludes(adminUser, 'Reimbursement', ClaimStatus.APPROVED, 'req-1')).toBe(false);
      expect(analyticsScopeIncludes(adminUser, 'Reimbursement', ClaimStatus.COMPLETED, 'req-2')).toBe(false);
      expect(analyticsScopeIncludes(adminUser, 'Cash Advance', CashAdvanceStatus.APPROVED, 'req-1')).toBe(false);
      expect(analyticsScopeIncludes(adminUser, 'Liquidation', LiquidationStatus.CLOSED, 'req-2')).toBe(false);
    });
  });

  describe('getAnalyticsSummary endpoint permissions and organization-wide metrics', () => {
    beforeEach(() => {
      state.claims = [
        {
          id: 'claim-1',
          claim_number: 'REIM-001',
          claim_type: 'Reimbursement',
          status: ClaimStatus.APPROVED,
          requestor_id: 'req-1',
          current_approver_id: 'app-1',
          original_approver_id: 'app-1',
          total_amount: 1500,
          approved_amount: 1500,
          paid_amount: 0,
          created_at: '2026-11-01T08:00:00Z',
          approved_at: '2026-11-02T08:00:00Z',
        } as any,
        {
          id: 'claim-2',
          claim_number: 'REIM-002',
          claim_type: 'Reimbursement',
          status: ClaimStatus.PENDING_APPROVAL,
          requestor_id: 'req-2',
          current_approver_id: 'app-1',
          original_approver_id: 'app-1',
          total_amount: 2500,
          approved_amount: 0,
          paid_amount: 0,
          created_at: '2026-11-03T08:00:00Z',
        } as any,
        {
          id: 'claim-3',
          claim_number: 'REIM-003',
          claim_type: 'Reimbursement',
          status: ClaimStatus.COMPLETED,
          requestor_id: 'req-1',
          current_approver_id: 'app-1',
          original_approver_id: 'app-1',
          total_amount: 3000,
          approved_amount: 3000,
          paid_amount: 3000,
          created_at: '2026-11-04T08:00:00Z',
          approved_at: '2026-11-04T10:00:00Z',
          paid_at: '2026-11-05T12:00:00Z',
        } as any,
      ];

      state.cashAdvances = [
        {
          id: 'adv-1',
          advance_number: 'CA-001',
          status: CashAdvanceStatus.RELEASED,
          requestor_id: 'req-2',
          approver_id: 'app-1',
          amount: 5000,
          disbursed_amount: 5000,
          purpose: 'Client Roadshow',
          created_at: '2026-11-05T08:00:00Z',
          approved_at: '2026-11-06T08:00:00Z',
          released_at: '2026-11-07T08:00:00Z',
        } as any,
      ];

      state.liquidations = [
        {
          id: 'liq-1',
          cashAdvanceId: 'adv-1',
          requestorId: 'req-2',
          status: LiquidationStatus.CLOSED,
          totalSpent: 4500,
          varianceAmount: 500,
          varianceType: 'Refund' as any,
          createdAt: '2026-11-08T08:00:00Z',
        } as any,
      ];
    });

    it('provisions Custodian with total system metrics and organization-wide claim volumes', () => {
      const result = getAnalyticsSummary('test-custodian', new URLSearchParams());
      expect(result.status).toBe(200);

      const body = result.body as any;

      // Total system metrics across all records
      expect(body.metrics.recordCount).toBe(5); // 3 claims + 1 advance + 1 liquidation
      expect(body.metrics.claimedAmount).toBe(1500 + 2500 + 3000 + 5000 + 4500); // 16500
      expect(body.metrics.approvedAmount).toBe(1500 + 0 + 3000 + 5000 + 4500); // 14000
      expect(body.metrics.paidAmount).toBe(0 + 0 + 3000 + 5000 + 0); // 8000

      // Organization-wide volume breakdowns
      const byStatusMap = Object.fromEntries(body.breakdowns.byStatus.map((s: any) => [s.name, s.count]));
      expect(byStatusMap[ClaimStatus.APPROVED]).toBe(1);
      expect(byStatusMap[ClaimStatus.PENDING_APPROVAL]).toBe(1);
      expect(byStatusMap[ClaimStatus.COMPLETED]).toBe(1);
      expect(byStatusMap[CashAdvanceStatus.RELEASED]).toBe(1);
      expect(byStatusMap[LiquidationStatus.CLOSED]).toBe(1);

      // Organization-wide requestors and departments represented
      const requestorNames = body.breakdowns.byRequestor.map((r: any) => r.name);
      expect(requestorNames).toContain('Alice Requestor');
      expect(requestorNames).toContain('Charlie Requestor');

      const departments = body.breakdowns.byDepartment.map((d: any) => d.name);
      expect(departments).toContain('Sales');
      expect(departments).toContain('Marketing');

      // Dimensions include full organization values
      expect(body.dimensions.departments).toContain('Sales');
      expect(body.dimensions.departments).toContain('Marketing');
    });

    it('validates that Admin is rejected with 403 Forbidden', () => {
      const result = getAnalyticsSummary('test-admin', new URLSearchParams());
      expect(result.status).toBe(403);
      expect(result.body).toEqual({
        error: 'Forbidden: Organization-wide analytics and reporting have been migrated exclusively to the Custodian role',
      });
    });

    it('validates that unauthenticated requests are rejected with 401 Unauthorized', () => {
      const result = getAnalyticsSummary(null, new URLSearchParams());
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: 'Unauthorized' });
    });

    it('ensures Approver cannot retrieve global analytics (only their approved records)', () => {
      const result = getAnalyticsSummary('app-1', new URLSearchParams());
      expect(result.status).toBe(200);

      const body = result.body as any;
      // Approver only sees claim-1 and claim-3 (which are approved and under app-1)
      // Pending claim-2 is excluded from approver analytics
      expect(body.records.map((r: any) => r.id)).toContain('claim-1');
      expect(body.records.map((r: any) => r.id)).toContain('claim-3');
      expect(body.records.map((r: any) => r.id)).not.toContain('claim-2');
    });
  });

  describe('Sidebar Navigation RBAC Migration', () => {
    it('includes Analytics & Reporting in Custodian navigation', () => {
      const items = getNavItems(UserRole.CUSTODIAN);
      const analyticsItem = items.find(i => i.path === '/custodian/analytics');

      expect(analyticsItem).toBeDefined();
      expect(analyticsItem?.label).toBe('Analytics & Reporting');
      expect(analyticsItem?.icon).toBe('bar_chart');
      expect(analyticsItem?.section).toBe('Insights');
    });

    it('removes Admin Reporting from Admin navigation', () => {
      const items = getNavItems(UserRole.ADMIN);
      const reportItem = items.find(i => i.path === '/admin/reports' || i.label === 'Admin Reporting');

      expect(reportItem).toBeUndefined();

      // System Activity remains under Administration
      const activityItem = items.find(i => i.path === '/admin/activity');
      expect(activityItem).toBeDefined();
      expect(activityItem?.section).toBe('Administration');
    });
  });
});
