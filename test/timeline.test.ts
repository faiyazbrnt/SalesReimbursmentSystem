import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Timeline, TimelineEvent } from '../src/components/ui/Timeline';
import { ClaimTimeline } from '../src/features/claims/detail/ClaimTimeline';
import { ClaimProgressTracker } from '../src/features/claims/components/ClaimProgressTracker';
import { StatusHistory, User, ClaimStatus, Claim, UserRole } from '../src/types';

describe('Timeline component', () => {
  const sampleEvents: TimelineEvent[] = [
    {
      id: 'evt-3',
      actor: 'Finance Disbursement',
      action: 'Awaiting Release',
      timestamp: 'Estimated Sep 14, 2026, 10:00 AM',
      status: 'pending',
    },
    {
      id: 'evt-2',
      actor: 'Noah Villanueva',
      action: 'Approved',
      timestamp: 'Sep 13, 2026, 2:45 PM',
      note: 'Approved after verifying client transport receipts.',
      status: 'completed',
    },
    {
      id: 'evt-1',
      actor: 'Maria Santos',
      action: 'Submitted Claim',
      timestamp: 'Sep 13, 2026, 9:15 AM',
      status: 'completed',
    },
  ];

  it('renders title and counter badge accurately', () => {
    const html = renderToStaticMarkup(
      React.createElement(Timeline, {
        title: 'Claim Audit Trail',
        events: sampleEvents,
      })
    );

    expect(html).toContain('Claim Audit Trail');
    expect(html).toContain('3 events');
  });

  it('renders completed events with checkmark and actor details', () => {
    const html = renderToStaticMarkup(
      React.createElement(Timeline, { events: sampleEvents })
    );

    expect(html).toContain('Noah Villanueva');
    expect(html).toContain('Approved');
    expect(html).toContain('Sep 13, 2026, 2:45 PM');
    expect(html).toContain('Approved after verifying client transport receipts.');
    expect(html).toContain('title="Completed"');
  });

  it('renders pending events with arrow icon', () => {
    const html = renderToStaticMarkup(
      React.createElement(Timeline, { events: sampleEvents })
    );

    expect(html).toContain('Finance Disbursement');
    expect(html).toContain('Awaiting Release');
    expect(html).toContain('title="Pending"');
  });

  it('renders empty state when events list is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(Timeline, { events: [] })
    );

    expect(html).toContain('No activity recorded yet.');
    expect(html).toContain('0 events');
  });
});

describe('ClaimTimeline adapter', () => {
  const mockUsers: Array<Pick<User, 'id' | 'name'>> = [
    {
      id: 'usr-1',
      name: 'Alice Reyes',
    },
    {
      id: 'usr-2',
      name: 'Bob Approver',
    },
  ];

  const mockHistory: StatusHistory[] = [
    {
      id: 'hist-2',
      claimId: 'claim-1',
      oldStatus: ClaimStatus.SUBMITTED,
      newStatus: ClaimStatus.APPROVED,
      changedBy: 'usr-2',
      timestamp: '2026-09-13T14:45:00.000Z',
      comment: 'Verified and approved',
    },
    {
      id: 'hist-1',
      claimId: 'claim-1',
      oldStatus: ClaimStatus.DRAFT,
      newStatus: ClaimStatus.SUBMITTED,
      changedBy: 'usr-1',
      timestamp: '2026-09-13T09:15:00.000Z',
    },
  ];

  it('maps StatusHistory and User correctly to Timeline events', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClaimTimeline, {
        history: mockHistory,
        users: mockUsers,
      })
    );

    expect(html).toContain('Bob Approver');
    expect(html).toContain('Approved');
    expect(html).toContain('Verified and approved');
    expect(html).toContain('Alice Reyes');
    expect(html).toContain('Submitted');
    expect(html).toContain('2 events');
  });

  it('formats rejected step with "by [name]" and auto ends subsequent steps', () => {
    const historyWithRejection: StatusHistory[] = [
      {
        id: 'hist-1',
        claimId: 'claim-1',
        oldStatus: ClaimStatus.DRAFT,
        newStatus: ClaimStatus.SUBMITTED,
        changedBy: 'usr-1',
        timestamp: '2026-09-13T09:15:00.000Z',
      },
      {
        id: 'hist-2',
        claimId: 'claim-1',
        oldStatus: ClaimStatus.SUBMITTED,
        newStatus: ClaimStatus.REJECTED,
        changedBy: 'usr-2',
        timestamp: '2026-09-13T10:00:00.000Z',
        comment: 'Missing proof of payment',
      },
      {
        id: 'hist-3',
        claimId: 'claim-1',
        oldStatus: ClaimStatus.REJECTED,
        newStatus: ClaimStatus.APPROVED,
        changedBy: 'usr-2',
        timestamp: '2026-09-13T11:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(ClaimTimeline, {
        history: historyWithRejection,
        users: mockUsers,
      })
    );

    expect(html).toContain('STEP 2 - REJECTED');
    expect(html).toContain('by Bob Approver');
    expect(html).toContain('Missing proof of payment');
    // Ensure subsequent steps are truncated (auto-ends)
    expect(html).toContain('2 events');
    expect(html).not.toContain('STEP 3');
  });

  it('renders upcoming next steps in the reimbursement workflow', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClaimTimeline, {
        history: mockHistory,
        users: mockUsers,
      })
    );

    expect(html).toContain('STEP 1 - Submitted');
    expect(html).toContain('STEP 2 - Approved');
    expect(html).toContain('STEP 3 - Processing');
    expect(html).toContain('STEP 4 - Ready for Claim');
    expect(html).toContain('STEP 5 - Completed');
  });

  it('renders workflow steps for Cash Advance with next steps', () => {
    const caClaim: Claim = {
      id: 'ca-1',
      ref: 'CADV-001',
      requestorId: 'usr-1',
      status: ClaimStatus.SUBMITTED,
      type: 'Cash Advance',
      purpose: 'Travel',
      total: 5000,
      claimedAmount: 5000,
      paidAmount: 0,
      createdAt: '2026-09-13T09:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      React.createElement(ClaimTimeline, {
        claim: caClaim,
        history: [mockHistory[1]],
        users: mockUsers,
      })
    );

    expect(html).toContain('STEP 1 - Submitted');
    expect(html).toContain('STEP 2 - Approved');
    expect(html).toContain('STEP 3 - Released');
    expect(html).toContain('STEP 4 - Liquidated');
  });
});

describe('ClaimProgressTracker component', () => {
  const mockUsers: User[] = [
    {
      id: 'usr-1',
      name: 'Alice Reyes',
      email: 'alice@example.com',
      role: UserRole.REQUESTOR,
      department: 'Sales',
      jobTitle: 'Sales Specialist',
      employmentStatus: 'Active',
      canApproveReimbursements: false,
    },
    {
      id: 'usr-2',
      name: 'Bob Approver',
      email: 'bob@example.com',
      role: UserRole.APPROVER,
      department: 'Sales',
      jobTitle: 'Sales Manager',
      employmentStatus: 'Active',
      canApproveReimbursements: true,
    },
  ];

  const mockClaim: Claim = {
    id: 'claim-132',
    ref: 'REIM-2026-000132',
    requestorId: 'usr-1',
    approverId: 'usr-2',
    status: ClaimStatus.PENDING_APPROVAL,
    type: 'Reimbursement',
    purpose: 'Reimbursement for sales meeting with Internal / Partner team.',
    total: 25000,
    claimedAmount: 25000,
    paidAmount: 0,
    createdAt: '2026-09-13T09:00:00.000Z',
  };

  it('renders empty fallback when claim is undefined', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ClaimProgressTracker, {
          claim: undefined,
          users: mockUsers,
        })
      )
    );

    expect(html).toContain('No claims yet to track.');
  });

  it('renders progress stepper with reference, purpose, and currently with details', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ClaimProgressTracker, {
          claim: mockClaim,
          users: mockUsers,
        })
      )
    );

    expect(html).toContain('Most Recent Claim');
    expect(html).toContain('REIM-2026-000132');
    expect(html).toContain('Reimbursement for sales meeting with Internal / Partner team.');
    expect(html).toContain('Currently with:');
    expect(html).toContain('Awaiting Bob Approver');
    expect(html).toContain('View activity');
    expect(html).toContain('Submitted');
    expect(html).toContain('Approved');
    expect(html).toContain('Processing');
    expect(html).toContain('Ready for Claim');
    expect(html).toContain('Completed');
  });

  it('renders branched error state for rejected claims', () => {
    const rejectedClaim: Claim = {
      ...mockClaim,
      status: ClaimStatus.REJECTED,
    };

    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ClaimProgressTracker, {
          claim: rejectedClaim,
          users: mockUsers,
        })
      )
    );

    expect(html).toContain('Rejected');
    expect(html).toContain('This request was rejected and cannot be processed further.');
  });
});
