import { useState, useRef, useEffect } from 'react';
import { Button, cn } from '../../../components/ui/Button';
import { Input, Select, Label } from '../../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../../components/ui/Card';
import { DynamicFieldRenderer } from '@/features/admin';
import { EXPENSE_CATEGORIES } from '../../../lib/expenseCategories';
import { formatMoney } from '../../../lib/money';
import {
  getReimbursementDateError,
  validateReimbursementPurchaseDate,
} from '../domain/reimbursementPolicy';
import { useClaimWizard } from './useClaimWizard';
import { ReceiptAttachmentPreviewModal } from '../detail/ReceiptAttachmentPreviewModal';

export function LineItemsStep({ wizard }: { wizard: ReturnType<typeof useClaimWizard> }) {
  const [previewReceipt, setPreviewReceipt] = useState<{ url: string; fileName?: string; fileType?: string } | null>(null);
  const {
    claimType,
    lineItemsLocal,
    setLineItemsLocal,
    liquidationBlocked,
    myCashAdvances,
    cashAdvanceId,
    setCashAdvanceId,
    cashAdvanceAmount,
    setCashAdvanceAmount,
    cashAdvancePurpose,
    setCashAdvancePurpose,
    claimCustomFields,
    setClaimCustomFields,
    claimErrors,
    setClaimErrors,
    isReimbursement,
    earliestEligiblePurchaseDate,
    filingDate,
    dateValidationAttempted,
    invalidDateInputRefs,
    handleFileUploadForLineItem,
    claims,
    varianceAmount,
    varianceType,
    refundMethod,
    setRefundMethod,
    paymentMethods,
    totalAmount,
  } = wizard;

  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenuIdx(null);
      }
    };
    if (openMenuIdx !== null) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [openMenuIdx]);

  const handleClearRowData = (targetIdx: number) => {
    setLineItemsLocal(p => p.map((li, i) => i === targetIdx ? {
      expenseDate: '',
      amount: 0,
      paymentMethod: 'Personal Card',
      vendor: '',
      businessPurpose: '',
      orNumber: '',
      receiptFile: undefined,
      receiptUrl: undefined,
      category: claimType === 'Transport Reimbursement' ? 'Transportation' : 'Meals',
    } : li));
    setOpenMenuIdx(null);
  };

  const handleDeleteRow = (targetIdx: number) => {
    setLineItemsLocal(p => {
      if (p.length <= 1) {
        // If this is the only row, keep the single row but clear its data
        return [{
          expenseDate: '',
          amount: 0,
          paymentMethod: 'Personal Card',
          vendor: '',
          businessPurpose: '',
          orNumber: '',
          receiptFile: undefined,
          receiptUrl: undefined,
          category: claimType === 'Transport Reimbursement' ? 'Transportation' : 'Meals',
        }];
      }
      return p.filter((_, i) => i !== targetIdx);
    });
    setOpenMenuIdx(null);
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="font-headline-md text-on-surface">{claimType} Details</h3>
        <div className="flex items-center gap-2">
          {claimType !== 'Cash Advance' && !liquidationBlocked && (
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setLineItemsLocal(p => [...p, {
                expenseDate: '',
                amount: 0,
                paymentMethod: 'Personal Card',
                vendor: '',
                category: claimType === 'Transport Reimbursement' ? 'Transportation' : 'Meals',
              }])}
            >
              <span className="material-symbols-outlined text-[18px]">add</span> Add Row
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {claimType === 'Liquidation' && (
          myCashAdvances.length === 0 ? (
            <div className="mb-6 p-6 rounded-lg border border-outline-variant bg-surface-container-low text-center">
              <span className="material-symbols-outlined text-[36px] text-outline mb-2">check_circle</span>
              <p className="font-label-md text-on-surface mb-1">No cash advances to liquidate</p>
              <p className="text-body-sm text-outline">
                You have no released cash advances awaiting liquidation. Any advance you've already
                started liquidating won't appear here.
              </p>
            </div>
          ) : (
            <div className="mb-6 max-w-md">
              <Label required>Select Cash Advance to Liquidate</Label>
              <Select value={cashAdvanceId} onChange={e => setCashAdvanceId(e.target.value)}>
                <option value="">-- Select --</option>
                {myCashAdvances.map(ca => <option key={ca.id} value={ca.id}>{ca.ref} - {formatMoney(ca.total)} ({ca.purpose})</option>)}
              </Select>
            </div>
          )
        )}

        {claimType === 'Cash Advance' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mb-6">
            <div>
              <Label required>Requested Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">₱</span>
                <Input type="number" value={cashAdvanceAmount || ''} onChange={e => setCashAdvanceAmount(Number(e.target.value))} className="pl-6" />
              </div>
            </div>
            <div>
              <Label required>Purpose</Label>
              <Input value={cashAdvancePurpose} onChange={e => setCashAdvancePurpose(e.target.value)} placeholder="What is this advance for?" />
            </div>
          </div>
        )}

        {claimType !== 'Cash Advance' && !liquidationBlocked && (
          <div className="mb-6">
            <DynamicFieldRenderer
              entity="claim"
              claimType={claimType}
              values={claimCustomFields}
              onChange={(key, value) => {
                setClaimCustomFields(p => ({ ...p, [key]: value }));
                if (claimErrors[key] || (key.endsWith('_other') && claimErrors[key.replace('_other', '')])) {
                  setClaimErrors(p => {
                    const next = { ...p };
                    delete next[key];
                    if (key.endsWith('_other')) delete next[key.replace('_other', '')];
                    return next;
                  });
                }
              }}
              errors={claimErrors}
            />
          </div>
        )}

        {claimType !== 'Cash Advance' && !liquidationBlocked && (
          <div className="space-y-6">
            {isReimbursement && (
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <span className="material-symbols-outlined text-primary text-[20px]">event_available</span>
                <div>
                  <p className="text-sm font-semibold text-on-surface">30-day filing window</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Receipt purchases must be dated from {earliestEligiblePurchaseDate} through {filingDate}. Older receipts cannot proceed to review.
                  </p>
                </div>
              </div>
            )}


            {/* List of Line Item Cards */}
            <div className="space-y-5">
              {lineItemsLocal.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-outline-variant bg-white shadow-xs hover:border-primary/30 transition-all overflow-visible relative"
                >
                  {/* Card Header */}
                  <div className="px-5 py-3.5 bg-surface-container-low/60 border-b border-outline-variant flex justify-between items-center rounded-t-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-on-surface">
                          Expense Item #{idx + 1}
                        </span>
                        {item.category && (
                          <span className="text-xs bg-surface-container px-2 py-0.5 rounded-md text-on-surface-variant font-medium">
                            {item.category}
                          </span>
                        )}
                        {Number(item.amount) > 0 && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md font-mono-data font-bold">
                            {formatMoney(Number(item.amount))}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="relative inline-block text-left" ref={openMenuIdx === idx ? menuContainerRef : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenMenuIdx(prev => prev === idx ? null : idx)}
                        className={cn(
                          "w-8 h-8 rounded-md text-outline hover:text-error hover:bg-error-container/20 transition-all flex items-center justify-center border border-transparent hover:border-error/20 active:scale-95",
                          openMenuIdx === idx && "bg-error-container/30 text-error border-error/20 ring-2 ring-error/10"
                        )}
                        title="Item options"
                        aria-label={`Options for item ${idx + 1}`}
                        aria-expanded={openMenuIdx === idx}
                      >
                        <span className="material-symbols-outlined text-[18px]">more_vert</span>
                      </button>

                      {openMenuIdx === idx && (
                        <div className="absolute right-0 top-full mt-1.5 z-40 w-52 rounded-lg bg-surface-container-high border border-outline-variant shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100">
                          <div className="px-3 py-1.5 border-b border-outline-variant/50">
                            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Item #{idx + 1} Actions</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleClearRowData(idx)}
                            className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-surface-container-highest flex items-center gap-2 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px] text-outline">backspace</span>
                            <div>
                              <span className="font-medium block">Clear inputs only</span>
                              <span className="text-[10px] text-on-surface-variant block">Reset fields, keep item</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(idx)}
                            className="w-full text-left px-3 py-2 text-xs text-error hover:bg-error-container/20 flex items-center gap-2 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px] text-error">delete</span>
                            <div>
                              <span className="font-medium block">Delete item</span>
                              <span className="text-[10px] text-error/80 block">Remove from request</span>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Content: Form inputs aligned in a clean responsive grid */}
                  <div className="p-5 sm:p-6 space-y-4">
                    {/* Row 1: Date, Category, Vendor, Payment Method */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <Label required className="text-xs font-semibold mb-1.5">Date of Purchase</Label>
                        <Input
                          ref={element => { invalidDateInputRefs.current[idx] = element; }}
                          id={`expense-date-${idx}`}
                          type="date"
                          value={item.expenseDate || ''}
                          max={isReimbursement ? filingDate : undefined}
                          aria-invalid={dateValidationAttempted && isReimbursement && !validateReimbursementPurchaseDate(item.expenseDate, filingDate).valid}
                          aria-describedby={
                            dateValidationAttempted && isReimbursement && getReimbursementDateError(item.expenseDate, filingDate)
                              ? `expense-date-error-${idx}`
                              : undefined
                          }
                          onChange={e => setLineItemsLocal(prev => prev.map((li, i) => i === idx ? { ...li, expenseDate: e.target.value } : li))}
                          className={cn(
                            "h-10 text-sm font-medium transition-all duration-150 cursor-pointer hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20",
                            dateValidationAttempted && isReimbursement && !validateReimbursementPurchaseDate(item.expenseDate, filingDate).valid && "border-error focus:ring-error text-error",
                          )}
                        />
                        {dateValidationAttempted && isReimbursement && getReimbursementDateError(item.expenseDate, filingDate) && (
                          <p id={`expense-date-error-${idx}`} className="text-error text-xs mt-1.5 flex items-center gap-1 leading-tight">
                            <span aria-hidden="true" className="material-symbols-outlined text-[14px] shrink-0">error</span>
                            <span>{getReimbursementDateError(item.expenseDate, filingDate)}</span>
                          </p>
                        )}
                      </div>

                      <div>
                        <Label required className="text-xs font-semibold mb-1.5">Category</Label>
                        <Select
                          disabled={claimType === 'Transport Reimbursement'}
                          className="h-10 text-sm font-medium transition-all duration-150 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                          value={item.category || ''}
                          onChange={e => setLineItemsLocal(prev => prev.map((li, i) => i === idx ? { ...li, category: e.target.value } : li))}
                        >
                          <option value="">Select Category</option>
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </div>

                      <div>
                        <Label required className="text-xs font-semibold mb-1.5">Vendor / Supplier</Label>
                        <Input
                          type="text"
                          value={item.vendor || ''}
                          onChange={e => setLineItemsLocal(prev => prev.map((li, i) => i === idx ? { ...li, vendor: e.target.value } : li))}
                          className="h-10 text-sm transition-all duration-150 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="e.g. Cafe Manila"
                          title={item.vendor || 'Vendor'}
                        />
                      </div>

                      <div>
                        <Label required className="text-xs font-semibold mb-1.5">Payment Method</Label>
                        <Select
                          className="h-10 text-sm font-medium transition-all duration-150 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                          value={item.paymentMethod || 'Personal Card'}
                          onChange={e => setLineItemsLocal(prev => prev.map((li, i) => i === idx ? { ...li, paymentMethod: e.target.value } : li))}
                        >
                          <option>Personal Card</option>
                          <option>Company Card</option>
                          <option>Cash</option>
                          <option>Bank Transfer</option>
                        </Select>
                      </div>
                    </div>

                    {/* Row 2: Purpose (spans 2), OR Number, Amount */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="sm:col-span-2">
                        <Label required className="text-xs font-semibold mb-1.5">Business Purpose</Label>
                        <Input
                          type="text"
                          value={item.businessPurpose || ''}
                          onChange={e => setLineItemsLocal(prev => prev.map((li, i) => i === idx ? { ...li, businessPurpose: e.target.value } : li))}
                          className="h-10 text-sm transition-all duration-150 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="What was this expense for? (e.g. Client lunch meeting)"
                          title={item.businessPurpose || 'Business purpose'}
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold mb-1.5">OR Number (Optional)</Label>
                        <Input
                          type="text"
                          value={item.orNumber || ''}
                          onChange={e => setLineItemsLocal(prev => prev.map((li, i) => i === idx ? { ...li, orNumber: e.target.value } : li))}
                          className="h-10 text-sm transition-all duration-150 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="Official receipt no."
                          title={item.orNumber || 'Official receipt no.'}
                        />
                      </div>

                      <div>
                        <Label required className="text-xs font-semibold mb-1.5">Amount</Label>
                        <div className="relative group/amount">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within/amount:text-primary font-semibold text-sm pointer-events-none transition-colors">₱</span>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.amount || ''}
                            onChange={e => setLineItemsLocal(prev => prev.map((li, i) => i === idx ? { ...li, amount: Number(e.target.value) } : li))}
                            className="h-10 pl-7 pr-3 text-right font-mono-data text-sm font-semibold transition-all duration-150 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Receipt Attachment Card */}
                    <div className="pt-1">
                      <Label className="text-xs font-semibold mb-1.5">
                        Receipt / OR Attachment {claimType !== 'Transport Reimbursement' && <span className="text-outline text-[11px] font-normal">(Required for submission)</span>}
                      </Label>
                      {item.receiptFile ? (
                        <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 p-3 rounded-lg hover:border-primary/40 transition-all">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined text-[24px] text-primary shrink-0">receipt</span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-on-surface truncate">{item.receiptFile.name}</p>
                              <p className="text-[11px] text-on-surface-variant font-mono-data">
                                {(item.receiptFile.size / 1024).toFixed(1)} KB • Attached
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.receiptUrl && (
                              <button
                                type="button"
                                className="text-xs font-semibold text-primary hover:underline px-2 py-1"
                                onClick={() => setPreviewReceipt({ url: item.receiptUrl!, fileName: item.receiptFile?.name, fileType: item.receiptFile?.type })}
                              >
                                View Receipt
                              </button>
                            )}
                            <label className="cursor-pointer text-xs font-semibold text-primary hover:underline px-2 py-1">
                              Replace
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={e => handleFileUploadForLineItem(idx, e)}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setLineItemsLocal(prev => prev.map((li, i) =>
                                i === idx ? { ...li, receiptFile: undefined, receiptUrl: undefined } : li
                              ))}
                              className="text-outline hover:text-error p-1.5 rounded-md hover:bg-error-container/20 transition-colors"
                              title="Remove attachment"
                              aria-label={`Remove receipt for item ${idx + 1}`}
                            >
                              <span className="material-symbols-outlined text-[18px] block">delete</span>
                            </button>
                          </div>
                        </div>
                      ) : item.receiptUrl ? (
                        <div className="flex items-center justify-between gap-3 bg-surface-container-low border border-outline-variant p-3 rounded-lg">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined text-[24px] text-primary shrink-0">check_circle</span>
                            <div>
                              <p className="text-xs font-semibold text-on-surface">Existing Receipt Attached</p>
                              <p className="text-[11px] text-on-surface-variant">Saved with this claim</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              className="text-xs font-semibold text-primary hover:underline px-2 py-1"
                              onClick={() => setPreviewReceipt({
                                url: item.receiptUrl!,
                                fileName: item.vendor ? `Receipt - ${item.vendor}` : 'Existing Receipt',
                              })}
                            >
                              View Receipt
                            </button>
                            <label className="cursor-pointer text-xs font-semibold text-primary hover:underline px-2 py-1">
                              Replace
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={e => handleFileUploadForLineItem(idx, e)}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="group flex items-center justify-center gap-2 w-full p-3.5 border-2 border-dashed border-outline-variant/80 hover:border-primary/60 bg-surface-container-low/30 hover:bg-primary/[0.03] rounded-lg cursor-pointer transition-all duration-150 select-none">
                          <span className="material-symbols-outlined text-[22px] text-primary group-hover:scale-110 transition-transform">cloud_upload</span>
                          <span className="text-xs font-semibold text-primary">Click to attach Receipt / Proof of Payment</span>
                          <span className="text-[11px] text-on-surface-variant hidden sm:inline">(Image or PDF up to 10MB)</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={e => handleFileUploadForLineItem(idx, e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Item Card Button */}
              <button
                type="button"
                onClick={() => setLineItemsLocal(p => [...p, {
                  expenseDate: '',
                  amount: 0,
                  paymentMethod: 'Personal Card',
                  vendor: '',
                  businessPurpose: '',
                  category: claimType === 'Transport Reimbursement' ? 'Transportation' : 'Meals',
                }])}
                className="w-full py-3.5 px-6 rounded-xl border-2 border-dashed border-outline-variant/80 hover:border-primary hover:bg-primary/[0.03] flex items-center justify-center gap-2 text-primary font-semibold text-sm transition-all shadow-2xs hover:shadow-xs active:scale-[0.99] cursor-pointer group"
              >
                <span className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform duration-200">add_circle</span>
                <span>Add Another Expense Record</span>
              </button>
            </div>
          </div>
        )}

        {!liquidationBlocked && (
          <div className="mt-6 flex justify-end gap-8 bg-surface-container-low p-6 rounded-lg">
            {claimType !== 'Cash Advance' && (
              <div className="text-right">
                <span className="font-label-sm text-on-surface-variant uppercase">Total Items</span>
                <p className="font-headline-md">{lineItemsLocal.length}</p>
              </div>
            )}
            {claimType === 'Liquidation' && cashAdvanceId && (
              <div className="text-right">
                <span className="font-label-sm text-on-surface-variant uppercase">Advance</span>
                <p className="font-headline-md">{formatMoney(claims.find((c: any) => c.id === cashAdvanceId)?.total || 0)}</p>
              </div>
            )}
            <div className="text-right bg-primary-container text-on-primary-container px-6 py-3 rounded-lg">
              <span className="font-label-sm uppercase opacity-80">{claimType === 'Liquidation' ? varianceType : 'Total Amount'}</span>
              <p className="text-[28px] font-bold leading-none mt-1">{formatMoney(claimType === 'Liquidation' ? Math.abs(varianceAmount) : totalAmount)}</p>
            </div>
          </div>
        )}

        {claimType === 'Liquidation' && varianceType === 'RefundDue' && (
          <div className="mt-4 p-5 rounded-lg border border-tertiary/40 bg-tertiary-container/20">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-tertiary mt-0.5">undo</span>
              <div className="flex-1">
                <p className="font-label-md text-on-surface">
                  You need to return {formatMoney(Math.abs(varianceAmount))} to the company.
                </p>
                <p className="text-body-sm text-outline mt-0.5 mb-3">
                  How will you pay this refund back? The custodian confirms it when they collect.
                </p>
                <div className="max-w-xs">
                  <label className="block text-label-sm text-on-surface mb-1">Refund Method <span className="text-error">*</span></label>
                  <Select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                    <option value="">Select how you'll refund…</option>
                    {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <ReceiptAttachmentPreviewModal
        url={previewReceipt?.url || null}
        fileName={previewReceipt?.fileName}
        fileType={previewReceipt?.fileType}
        onClose={() => setPreviewReceipt(null)}
      />
    </Card>
  );
}
