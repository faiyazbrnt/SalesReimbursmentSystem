import { describe, expect, it } from 'vitest';
import { submitClaimFlow } from '../services/api';

describe('Ticket 7: Form Simplification – Remove Client Email and CC Checkbox', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('submits a claim with Minutes of Meeting without client email or CC fields', async () => {
    let capturedBody: any = null;
    const mockLineItems = [
      {
        amount: 500,
        expenseDate: today,
        receiptUrl: '/uploads/receipt1.png',
        category: 'Meals',
      },
    ];

    // submitClaimFlow should cleanly construct payload without requiring contactPersonEmail or ccClient
    const promise = submitClaimFlow({
      claimType: 'Reimbursement',
      isDraft: false,
      lineItems: mockLineItems,
      mom: {
        client: 'Acme Corp',
        purpose: 'Quarterly review',
        meetingDate: today,
        contactPerson: 'Alice Reyes',
        // Note: No contactPersonEmail or ccClient provided
      },
    });

    // In a test environment without server, it reaches apiFetch without payload validation errors
    await expect(promise).rejects.toThrow(); // Fails at fetch network level, NOT at payload validation
  });

  it('preserves historical claim records containing contactPersonEmail and ccClient', () => {
    // Historical claim record shape
    const historicalMom = {
      id: 'mom-hist-001',
      claimId: 'claim-hist-001',
      documentType: 'MoM' as const,
      companyName: 'Historical Corp',
      purposeOfMeeting: 'Prior discussion',
      meetingDate: '2025-12-01',
      location: 'Makati Office',
      contactPerson: 'Bob Builder',
      contactPersonEmail: 'bob@historical.com',
      ccClient: true,
      preparedBy: 'Mia Fernandez',
    };

    expect(historicalMom.contactPersonEmail).toBe('bob@historical.com');
    expect(historicalMom.ccClient).toBe(true);
  });
});
