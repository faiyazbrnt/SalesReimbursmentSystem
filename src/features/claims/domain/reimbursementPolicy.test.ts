import { describe, expect, it } from 'vitest';
import {
  calculateSubtotal,
  getReimbursementDateError,
  isSubtotalCapExceeded,
  REIMBURSEMENT_CAP,
  shiftIsoDate,
  SUBTOTAL_CAP_ERROR_MESSAGE,
  validateReimbursementPurchaseDate,
} from './reimbursementPolicy';

describe('reimbursement filing window', () => {
  const filingDate = '2026-07-31';

  it('allows a purchase made exactly 30 calendar days before filing', () => {
    expect(validateReimbursementPurchaseDate('2026-07-01', filingDate)).toEqual({
      valid: true,
      ageDays: 30,
    });
  });

  it('rejects a purchase made 31 days before filing', () => {
    expect(validateReimbursementPurchaseDate('2026-06-30', filingDate)).toEqual({
      valid: false,
      reason: 'expired',
      ageDays: 31,
    });
  });

  it('rejects missing and future purchase dates', () => {
    expect(getReimbursementDateError('', filingDate)).toBe('Enter the receipt purchase date.');
    expect(validateReimbursementPurchaseDate('2026-08-01', filingDate)).toMatchObject({
      valid: false,
      reason: 'future',
    });
  });

  it('shifts ISO dates across month boundaries', () => {
    expect(shiftIsoDate(filingDate, -30)).toBe('2026-07-01');
  });
});

describe('reimbursement 1,000 PHP subtotal cap policy', () => {
  it('correctly calculates subtotal from line items', () => {
    expect(calculateSubtotal([{ amount: 250 }, { amount: 350 }, { amount: 400 }])).toBe(1000);
    expect(calculateSubtotal([])).toBe(0);
    expect(calculateSubtotal([{ amount: undefined as any }, { amount: 500 }])).toBe(500);
  });

  it('allows subtotal up to exactly 1,000 PHP', () => {
    expect(isSubtotalCapExceeded(0)).toBe(false);
    expect(isSubtotalCapExceeded(500)).toBe(false);
    expect(isSubtotalCapExceeded(999.99)).toBe(false);
    expect(isSubtotalCapExceeded(1000)).toBe(false);
    expect(isSubtotalCapExceeded(REIMBURSEMENT_CAP)).toBe(false);
  });

  it('detects when subtotal exceeds 1,000 PHP', () => {
    expect(isSubtotalCapExceeded(1000.01)).toBe(true);
    expect(isSubtotalCapExceeded(1001)).toBe(true);
    expect(isSubtotalCapExceeded(2500)).toBe(true);
  });

  it('provides the expected validation message', () => {
    expect(SUBTOTAL_CAP_ERROR_MESSAGE).toBe('Maximum subtotal limit of ₱1,000 per claim exceeded');
  });
});
