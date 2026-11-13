import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToastProvider } from '../../../components/shared/ToastContext';
import { MomStep } from './MomStep';
import { ReviewStep } from './ReviewStep';

vi.mock('../../../components/AppContext', () => ({
  useAppContext: () => ({
    fieldDefinitions: [],
    masterData: [],
    currentUser: { id: 'u1', name: 'Alice Reyes', role: 'Requestor', email: 'alice@example.com' },
    companies: [],
    refresh: async () => {},
  }),
}));

describe('Ticket 1: Requestor Name field alignment', () => {
  const mockWizard = {
    currentUser: { id: 'u1', name: 'Alice Reyes', role: 'Requestor', email: 'alice@example.com' },
    documentType: 'MoM' as const,
    setDocumentType: () => {},
    setShowMomPreview: () => {},
    momCore: { client: 'Acme Corp', purpose: 'Q3 Review', meetingDate: '2026-11-13', location: 'Makati' },
    setMomCore: () => {},
    companies: [],
    applyCompanyDefaults: () => {},
    contacts: [{ name: '', designation: '' }],
    setContacts: () => {},
    momData: {},
    setMomData: () => {},
    momErrors: {},
    setMomErrors: () => {},
    refresh: async () => {},
    claimType: 'Reimbursement' as const,
    totalAmount: 500,
    reimbursableAmount: 500,
    approver: { id: 'u2', name: 'Bob Approver' },
    filingDate: '2026-11-13',
    isSubtotalCapExceeded: false,
    subtotalCapMessage: '',
  } as any;

  it('renders Requestor name field inside the form grid aligned with adjacent fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(MomStep, { wizard: mockWizard })
      )
    );

    // Check that Requestor input is rendered with correct id, value, and disabled/readonly
    expect(html).toContain('id="requestor"');
    expect(html).toContain('value="Alice Reyes"');
    expect(html).toContain('Requestor');

    // Check that the grid layout container wraps Requestor and adjacent fields
    expect(html).toContain('grid grid-cols-1 md:grid-cols-2 gap-6');
    expect(html).toContain('id="claim-mom-client"');
    expect(html).toContain('Purpose of Meeting');
    expect(html).toContain('Date of Meeting');
    expect(html).toContain('Location of Meeting');
  });

  it('renders Requestor name in ReviewStep summary aligned alongside Approver', () => {
    const html = renderToStaticMarkup(React.createElement(ReviewStep, { wizard: mockWizard }));

    expect(html).toContain('Alice Reyes');
    expect(html).toContain('Bob Approver');
    expect(html).toContain('Requestor:');
    expect(html).toContain('Approver:');
  });
});
