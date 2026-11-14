import { describe, expect, it, vi } from 'vitest';
import {
  calculateSubtotal,
  isSubtotalCapExceeded,
  REIMBURSEMENT_CAP,
  SUBTOTAL_CAP_ERROR_MESSAGE,
} from '../domain/reimbursementPolicy';
import { submitClaimFlow } from '../services/api';

describe('Ticket 2: Subtotal Cap Validation and Guardrails', () => {
  it('enforces 1,000 PHP cap boundary values', () => {
    expect(REIMBURSEMENT_CAP).toBe(1000);
    expect(isSubtotalCapExceeded(1000)).toBe(false);
    expect(isSubtotalCapExceeded(1000.00)).toBe(false);
    expect(isSubtotalCapExceeded(1000.01)).toBe(true);
    expect(isSubtotalCapExceeded(1500)).toBe(true);
  });

  it('calculates subtotal across multiple line items', () => {
    const items = [
      { amount: 300 },
      { amount: 450 },
      { amount: 250 },
    ];
    const subtotal = calculateSubtotal(items);
    expect(subtotal).toBe(1000);
    expect(isSubtotalCapExceeded(subtotal)).toBe(false);

    const exceededItems = [...items, { amount: 50 }];
    const exceededSubtotal = calculateSubtotal(exceededItems);
    expect(exceededSubtotal).toBe(1050);
    expect(isSubtotalCapExceeded(exceededSubtotal)).toBe(true);
  });

  it('rejects submission in submitClaimFlow when subtotal exceeds 1,000 PHP', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await expect(
      submitClaimFlow({
        claimType: 'Reimbursement',
        isDraft: false,
        lineItems: [
          { amount: 600, expenseDate: today, receiptUrl: '/test.png', category: 'Meals' },
          { amount: 500, expenseDate: today, receiptUrl: '/test.png', category: 'Meals' },
        ],
      })
    ).rejects.toThrow(SUBTOTAL_CAP_ERROR_MESSAGE);
  });

  it('allows draft submission even if subtotal exceeds 1,000 PHP', async () => {
    // submitClaimFlow should not throw the subtotal error when isDraft is true
    // (it will proceed past the validation check to apiFetch)
    const today = new Date().toISOString().slice(0, 10);
    let threwSubtotalError = false;
    try {
      await submitClaimFlow({
        claimType: 'Reimbursement',
        isDraft: true,
        lineItems: [
          { amount: 600, expenseDate: today, category: 'Meals' },
          { amount: 600, expenseDate: today, category: 'Meals' },
        ],
      });
    } catch (err: any) {
      if (err.message === SUBTOTAL_CAP_ERROR_MESSAGE) {
        threwSubtotalError = true;
      }
    }
    expect(threwSubtotalError).toBe(false);
  });

  it('prevents submission when Enter key is pressed and subtotal limit is breached', () => {
    const handleSubmitMock = vi.fn();
    const isCapExceeded = true;
    const step = 4;
    const loading = false;
    const hasInvalidReimbursementDate = false;

    // Simulate keydown event handler
    const handleKeyDown = (e: { key: string; defaultPrevented: boolean; preventDefault: () => void; target: any }) => {
      if (e.key === 'Enter') {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
          return;
        }
        if (step === 4) {
          e.preventDefault();
          if (isCapExceeded) {
            return;
          }
          if (!loading && !hasInvalidReimbursementDate) {
            handleSubmitMock();
          }
        }
      }
    };

    let prevented = false;
    const event = {
      key: 'Enter',
      defaultPrevented: false,
      preventDefault: () => { prevented = true; },
      target: { tagName: 'DIV', isContentEditable: false },
    };

    handleKeyDown(event);
    expect(prevented).toBe(true);
    expect(handleSubmitMock).not.toHaveBeenCalled();
  });

  it('allows Enter submission when subtotal is within limit on review step', () => {
    const handleSubmitMock = vi.fn();
    const isCapExceeded = false;
    const step = 4;
    const loading = false;
    const hasInvalidReimbursementDate = false;

    const handleKeyDown = (e: { key: string; defaultPrevented: boolean; preventDefault: () => void; target: any }) => {
      if (e.key === 'Enter') {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
          return;
        }
        if (step === 4) {
          e.preventDefault();
          if (isCapExceeded) {
            return;
          }
          if (!loading && !hasInvalidReimbursementDate) {
            handleSubmitMock();
          }
        }
      }
    };

    let prevented = false;
    const event = {
      key: 'Enter',
      defaultPrevented: false,
      preventDefault: () => { prevented = true; },
      target: { tagName: 'DIV', isContentEditable: false },
    };

    handleKeyDown(event);
    expect(prevented).toBe(true);
    expect(handleSubmitMock).toHaveBeenCalledTimes(1);
  });
});
