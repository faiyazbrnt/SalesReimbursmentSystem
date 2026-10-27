import { PaginatedTable } from '../../../components/ui/PaginatedTable';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { ClaimStatus, Claim, ExpenseLineItem } from '../../../types';
import { formatMoney } from '../../../lib/money';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { useAppContext } from '../../../components/AppContext';
import { useToast } from '../../../components/shared/ToastContext';
import { addCustodianComment, decideAsCustodian, generateClaimCode } from '../../../lib/api';
import { ReceiptAttachmentPreviewModal } from '../../claims/detail/ReceiptAttachmentPreviewModal';

export interface CustodianActionButtonsProps {
  claim: Claim;
  size?: 'sm' | 'md';
}

export function CustodianActionButtons({ claim, size = 'sm' }: CustodianActionButtonsProps) {
  const { lineItems, currentUser, updateClaimStatus, refresh, applyClaimUpdate } = useAppContext();
  const { addToast } = useToast();

  const [activeModal, setActiveModal] = useState<'markReady' | 'release' | 'closeLiq' | 'return' | 'comment' | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [refundMethod, setRefundMethod] = useState('');
  const [refundRef, setRefundRef] = useState('');
  const [error, setError] = useState('');
  const [correctionComment, setCorrectionComment] = useState('');
  const [releaseComment, setReleaseComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewingReceipt, setPreviewingReceipt] = useState<ExpenseLineItem | null>(null);
  const isReimbursement = claim.type === 'Reimbursement' || claim.type === 'Transport Reimbursement';

  const handleAction = (action: 'markReady' | 'release' | 'closeLiq' | 'return' | 'comment') => {
    setPaymentMethod('Cash');
    setPaymentRef('');
    setRefundMethod('Cash');
    setRefundRef('');
    setCorrectionComment('');
    setReleaseComment('');
    setError('');
    setActiveModal(action);
  };

  const handleCorrectionDecision = async () => {
    if (activeModal !== 'return') return;
    if (!correctionComment.trim()) {
      setError('Explain what needs correction.');
      return;
    }

    setIsSubmitting(true);
    try {
      await decideAsCustodian(claim.id, 'Return', correctionComment.trim());
      applyClaimUpdate(claim.id, { status: ClaimStatus.RETURNED });
      void refresh();
      addToast(
        'Claim returned successfully.',
        'success',
      );
      setActiveModal(null);
    } catch (err: any) {
      setError(err?.message || 'The server rejected this decision.');
      addToast(err?.message || 'Decision failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    setError('');
    try {
      const updated: any = await generateClaimCode(claim.id);
      applyClaimUpdate(claim.id, { releaseCode: updated.release_code });
      void refresh();
      addToast('Claim code generated — give it to the requestor.', 'success');
    } catch (err: any) {
      setError(err?.message || 'Could not generate the claim code.');
      addToast(err?.message || 'Could not generate the claim code.', 'error');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleConfirm = async () => {
    if (!activeModal) return;

    if (activeModal === 'markReady' && !claim.releaseCode) {
      setError('Generate the release code first, then give it to the requestor.');
      return;
    }
    if (activeModal === 'markReady' && !paymentMethod) {
      setError('Select a payment method.');
      return;
    }
    if (activeModal === 'release' && !paymentMethod) {
      setError('Select a release method.');
      return;
    }
    if (activeModal === 'closeLiq' && !refundMethod) {
      setError('Select a refund method.');
      return;
    }

    let newStatus: string = claim.status;
    let toastMsg = '';
    let updates: Partial<Claim> = {};

    switch (activeModal) {
      case 'markReady':
        newStatus = ClaimStatus.READY_FOR_CLAIM;
        toastMsg = `Marked ready. Release code ${claim.releaseCode} — make sure the requestor has it.`;
        updates = { paymentMethod };
        break;
      case 'release':
        newStatus = ClaimStatus.RELEASED;
        toastMsg = 'Cash advance released successfully.';
        updates = { releaseReference: paymentRef || undefined, paymentMethod };
        break;
      case 'closeLiq':
        newStatus = ClaimStatus.CLOSED;
        toastMsg = 'Liquidation closed successfully.';
        updates = { releaseReference: refundRef || undefined, paymentMethod: refundMethod };
        break;
    }

    setIsSubmitting(true);
    try {
      await updateClaimStatus(claim.id, newStatus as ClaimStatus, currentUser.id, activeModal === 'markReady' ? releaseComment.trim() : undefined, updates);
      addToast(toastMsg, 'success');
      setActiveModal(null);
    } catch (err: any) {
      setError(err?.message || 'The server rejected this action.');
      addToast(err?.message || 'Action failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
        <Button size={size} variant="outline" onClick={() => handleAction('comment')}>Add Comment</Button>
        {isReimbursement && claim.status === ClaimStatus.APPROVED && (
          <span className="text-body-sm text-outline italic self-center pr-2">Awaiting processing</span>
        )}
        {isReimbursement && claim.status === ClaimStatus.PROCESSING && (
          <Button size={size} className="gap-1.5" onClick={() => handleAction('markReady')}>
            <span className="material-symbols-outlined text-[16px]">fact_check</span> Review
          </Button>
        )}
        {claim.type === 'Cash Advance' && claim.status === ClaimStatus.APPROVED && (
          <Button size={size} onClick={() => handleAction('release')}>Release Funds</Button>
        )}
        {claim.type === 'Liquidation' && claim.status === ClaimStatus.REVIEWED && claim.varianceType === 'RefundDue' && (
          <Button size={size} onClick={() => handleAction('closeLiq')}>Close Liquidation</Button>
        )}
        {((isReimbursement && [ClaimStatus.APPROVED, ClaimStatus.PROCESSING].includes(claim.status)) ||
          (claim.type === 'Liquidation' && claim.status === ClaimStatus.REVIEWED && claim.varianceType === 'RefundDue')) && (
          <Button size={size} variant="outline" className="text-tertiary border-tertiary/50" onClick={() => handleAction('return')}>
            Return
          </Button>
        )}
      </div>

      <ConfirmModal
        isOpen={activeModal === 'comment'} onClose={() => setActiveModal(null)}
        title="Custodian Comment" confirmLabel={isSubmitting ? 'Saving...' : 'Save Comment'} disabled={isSubmitting}
        onConfirm={async () => {
          if (!correctionComment.trim()) { setError('Enter a comment.'); return; }
          setIsSubmitting(true);
          try {
            await addCustodianComment(claim.id, correctionComment.trim());
            await refresh();
            setActiveModal(null);
            addToast('Comment saved.', 'success');
          } catch (error: any) { setError(error?.message || 'Could not save comment.'); }
          finally { setIsSubmitting(false); }
        }}
      >
        <label htmlFor={`custodian-comment-${claim.id}`} className="block text-label-md mb-2">Remarks or feedback <span className="text-error">*</span></label>
        <textarea id={`custodian-comment-${claim.id}`} value={correctionComment} onChange={event => { setCorrectionComment(event.target.value); setError(''); }} rows={4} disabled={isSubmitting} className="w-full rounded-input border border-brand-field-border bg-white px-4 py-2.5" />
        <p className="mt-2 text-sm text-outline">Visible to people who can access this request. Adding a comment does not change its status.</p>
        {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
      </ConfirmModal>

      <ConfirmModal
        isOpen={activeModal === 'return'}
        onClose={() => setActiveModal(null)}
        onConfirm={handleCorrectionDecision}
        title="Return for Revision"
        confirmLabel={isSubmitting ? 'Returning...' : 'Return to Requestor'}
        variant="warning"
        disabled={isSubmitting}
      >
        <div className="space-y-3">
          <p>
            Return <strong>{claim.ref}</strong> without releasing funds. The requestor will see this note and can correct the record.
          </p>
          <div>
            <label className="block text-label-md text-on-surface mb-1">Required correction <span className="text-error">*</span></label>
            <textarea
              value={correctionComment}
              onChange={event => { setCorrectionComment(event.target.value); setError(''); }}
              rows={4}
              placeholder="Describe the missing document, incorrect amount, or required correction..."
              className="w-full bg-white border border-brand-field-border rounded-input px-4 py-2.5 text-body-base focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
              disabled={isSubmitting}
            />
          </div>
          {error && <p className="text-error text-body-sm">{error}</p>}
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={activeModal === 'markReady'}
        onClose={() => { setActiveModal(null); setPreviewingReceipt(null); }}
        onConfirm={handleConfirm}
        title="Review & Mark Ready"
        confirmLabel={isSubmitting ? "Marking ready..." : "Mark Ready for Claim"}
        disabled={isSubmitting}
        closeOnEscape={!previewingReceipt}
        trapFocus={!previewingReceipt}
        modalClassName="max-w-2xl"
      >
        {(() => {
          const items = lineItems.filter(li => li.claimId === claim.id);
          return (
            <div className="space-y-4">
              <p className="text-body-sm text-on-surface-variant">
                Review the submitted expenses and receipts, generate the claim code and give
                it to the requestor, then mark the claim ready for payout.
              </p>
              {items.length === 0 ? (
                <p className="text-body-sm text-outline italic">No expense line items found for this claim.</p>
              ) : (
                <div className="border border-outline-variant rounded-lg overflow-x-auto max-h-56 overflow-y-auto">
                  <PaginatedTable className="w-full min-w-[560px] text-left text-sm">
                    <colgroup>
                      <col className="w-[96px]" />
                      <col />
                      <col className="w-[112px]" />
                      <col className="w-[88px]" />
                    </colgroup>
                    <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant sticky top-0">
                      <tr>
                        <th className="px-3 py-2 whitespace-nowrap">Date</th>
                        <th className="px-3 py-2 whitespace-nowrap">Category / Vendor</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Amount</th>
                        <th className="px-3 py-2 text-center whitespace-nowrap">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-outline-variant">
                      {items.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors bg-white">
                          <td className="px-3 py-2 whitespace-nowrap">{item.expenseDate}</td>
                          <td className="px-3 py-2 break-words">
                            <div className="font-medium text-on-surface">{item.category}</div>
                            <div className="text-outline text-xs">{item.vendor}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono-data whitespace-nowrap">{formatMoney(item.amount)}</td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {(item.receiptUrls?.length || item.receiptUrl) ? (
                              <div className="flex flex-col items-center gap-1">
                                {(item.receiptUrls?.length ? item.receiptUrls : [item.receiptUrl!]).map((url, index) => (
                                  <button key={`${url}-${index}`} type="button" aria-label={`View receipt ${index + 1}`} className="text-primary hover:underline"
                                    onClick={event => { event.stopPropagation(); setPreviewingReceipt({ ...item, receiptUrl: url, receiptFileName: `Receipt ${index + 1}` }); }}>
                                    View {index + 1}
                                  </button>
                                ))}
                              </div>
                            ) : <span className="text-error text-xs">Missing</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </PaginatedTable>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-outline-variant">
                <span className="font-label-md text-on-surface-variant">Claim Total</span>
                <span className="font-mono-data font-bold text-on-surface">{formatMoney(claim.total)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-label-md text-on-surface-variant">Amount to Release</span>
                <span className="font-mono-data font-bold text-primary">{formatMoney(claim.approvedAmount ?? Math.min(claim.total, 1000))}</span>
              </div>
              <div>
                <label className="block text-label-md text-on-surface mb-1" htmlFor={`reimbursement-method-${claim.id}`}>
                  Payment Method
                </label>
                <Input
                  id={`reimbursement-method-${claim.id}`}
                  value="Cash"
                  readOnly
                  aria-describedby={`reimbursement-method-help-${claim.id}`}
                  className="bg-surface-container-low"
                />
                <p id={`reimbursement-method-help-${claim.id}`} className="mt-1 text-body-sm text-on-surface-variant">
                  Custodians release reimbursements in cash only.
                </p>
              </div>
              <div>
                <label className="block text-label-md text-on-surface mb-1" htmlFor={`custodian-comment-${claim.id}`}>Custodian comment (optional)</label>
                <textarea
                  id={`custodian-comment-${claim.id}`}
                  value={releaseComment}
                  onChange={event => setReleaseComment(event.target.value)}
                  rows={3}
                  placeholder="Add a remark or feedback for the requestor..."
                  className="w-full bg-white border border-brand-field-border rounded-input px-4 py-2.5 text-body-base focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-label-md text-on-surface mb-1">Release Code</label>
                {claim.releaseCode ? (
                  <div className="rounded-lg border border-primary/40 bg-primary-container/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono-data text-xl tracking-widest font-bold text-on-surface">{claim.releaseCode}</span>
                      <button
                        type="button"
                        onClick={handleGenerateCode}
                        disabled={generatingCode || isSubmitting}
                        className="text-body-sm text-primary hover:underline disabled:opacity-50"
                      >
                        {generatingCode ? 'Regenerating…' : 'Regenerate'}
                      </button>
                    </div>
                    <p className="text-[12px] text-on-surface-variant mt-1">
                      Give this code to the requestor — they enter it on Payouts to confirm receipt. It is not shown on their screen.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    disabled={generatingCode || isSubmitting}
                    className="w-full p-3 rounded-lg border border-dashed border-outline-variant text-primary font-label-md hover:bg-primary/5 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">key</span>
                    {generatingCode ? 'Generating…' : 'Generate Release Code'}
                  </button>
                )}
                {error && <p className="text-error text-body-sm mt-2 flex items-center"><span className="material-symbols-outlined text-[16px] mr-1">error</span>{error}</p>}
              </div>
            </div>
          );
        })()}
      </ConfirmModal>

      <ReceiptAttachmentPreviewModal
        url={previewingReceipt?.receiptUrl ?? null}
        fileName={previewingReceipt?.receiptFileName}
        onClose={() => setPreviewingReceipt(null)}
      />

      <ConfirmModal
        isOpen={activeModal === 'release'}
        onClose={() => setActiveModal(null)}
        onConfirm={handleConfirm}
        title="Release Cash Advance"
        confirmLabel={isSubmitting ? "Releasing..." : "Confirm Release"}
        disabled={isSubmitting}
      >
        <p className="mb-4 text-body-md text-on-surface-variant">Custodians release funds in cash only. Enter the voucher reference.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-label-md text-on-surface mb-1">Release Method <span className="text-error">*</span></label>
            <Select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); setError(''); }} disabled={isSubmitting}>
              <option value="">Select a release method...</option>
              <option value="Cash">Cash</option>
            </Select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface mb-1">Reference Number</label>
            <Input type="text" placeholder="Reference Number" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} disabled={isSubmitting} />
          </div>
          {error && <p className="text-error text-body-sm flex items-center"><span className="material-symbols-outlined text-[16px] mr-1">error</span>{error}</p>}
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={activeModal === 'closeLiq'}
        onClose={() => setActiveModal(null)}
        onConfirm={handleConfirm}
        title="Close Liquidation"
        confirmLabel={isSubmitting ? "Closing..." : "Close Liquidation"}
        disabled={isSubmitting}
      >
        <p className="mb-4 text-body-md text-on-surface-variant">Confirm the refund of {formatMoney(Math.abs(claim.varianceAmount || 0))} has been physically collected from the requestor, then close this liquidation.</p>
        <div className="space-y-4">
          {claim.paymentMethod && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-container/20 border border-primary/20 text-body-sm text-on-surface">
              <span className="material-symbols-outlined text-[18px] text-primary">info</span>
              Requestor said they'd refund via <strong>{claim.paymentMethod}</strong>. Confirm or change below.
            </div>
          )}
          <div>
            <label className="block text-label-md text-on-surface mb-1">Refund Method <span className="text-error">*</span></label>
            <Select value={refundMethod} onChange={e => { setRefundMethod(e.target.value); setError(''); }} disabled={isSubmitting}>
              <option value="">Select how the refund was collected...</option>
              <option value="Cash">Cash</option>
            </Select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface mb-1">Reference Note (Optional)</label>
            <Input type="text" placeholder="Reference note (optional)" value={refundRef} onChange={e => setRefundRef(e.target.value)} disabled={isSubmitting} />
          </div>
          {error && <p className="text-error text-body-sm flex items-center"><span className="material-symbols-outlined text-[16px] mr-1">error</span>{error}</p>}
        </div>
      </ConfirmModal>
    </>
  );
}
