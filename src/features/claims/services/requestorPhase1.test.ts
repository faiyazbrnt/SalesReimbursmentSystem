import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, uploadFile } from '../../../lib/api/client';
import { submitClaimFlow } from './api';
import { MinutesSource } from '../../../types';
import { getTodayIsoDate } from '../schema';

vi.mock('../../../lib/api/client', () => ({ apiFetch: vi.fn(), uploadFile: vi.fn() }));
const receipt = () => new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' });
const line = () => ({ category: 'Others', otherCategory: 'Parking', tinNumber: '123-456-789', amount: 100, expenseDate: getTodayIsoDate(), receiptFiles: [receipt(), receipt()] });
const mom = { client: 'Recognized client', purpose: 'Review', meetingDate: getTodayIsoDate(), source: MinutesSource.UPLOADED, fileUrl: '/uploads/mom.pdf', fileName: 'minutes.pdf' };

describe('Requestor Phase 1 submission', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(uploadFile).mockResolvedValue({ url: '/uploads/receipt.pdf', filename: 'receipt.pdf' }); vi.mocked(apiFetch).mockResolvedValue({ id: 'claim' }); });
  it('sends every receipt, vendor TIN, Others description, and the uploaded MOM', async () => {
    await submitClaimFlow({ claimType: 'Reimbursement', lineItems: [line()], mom });
    expect(uploadFile).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body));
    expect(body.mom).toMatchObject({ file_url: mom.fileUrl, file_name: mom.fileName, minutes_source: 'Uploaded' });
    expect(body.line_items[0]).toMatchObject({ category: 'Others', other_category: 'Parking', tin_number: '123-456-789', receipt_urls: ['/uploads/receipt.pdf', '/uploads/receipt.pdf'] });
    expect(body.mom.discussion).toBe('');
    expect(body.mom.action_items).toBe('');
  });
  it('blocks incomplete Others and missing TIN before uploading', async () => {
    await expect(submitClaimFlow({ claimType: 'Reimbursement', lineItems: [{ ...line(), otherCategory: '' }], mom })).rejects.toThrow('specify the expense category');
    await expect(submitClaimFlow({ claimType: 'Reimbursement', lineItems: [{ ...line(), tinNumber: '' }], mom })).rejects.toThrow('TIN number is required');
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it('does not save fabricated receipt URLs when a draft upload fails', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('Storage unavailable'));
    await expect(submitClaimFlow({ claimType: 'Reimbursement', lineItems: [line()], mom, isDraft: true })).rejects.toThrow('Storage unavailable');
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it('does not persist temporary preview URLs ahead of uploaded receipts', async () => {
    await submitClaimFlow({ claimType: 'Reimbursement', lineItems: [{ ...line(), receiptUrl: 'blob:temporary-preview', receiptUrls: ['blob:temporary-preview', 'data:image/png;base64,preview'] }], mom });
    const body = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body));
    expect(body.line_items[0].receipt_url).toBe('/uploads/receipt.pdf');
    expect(body.line_items[0].receipt_urls).toEqual(['/uploads/receipt.pdf', '/uploads/receipt.pdf']);
  });

});
