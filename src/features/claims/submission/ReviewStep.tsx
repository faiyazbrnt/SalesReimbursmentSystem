import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { formatDate } from '../../../lib/date';
import { formatMoney } from '../../../lib/money';
import { REIMBURSEMENT_CAP, useClaimWizard } from './useClaimWizard';

export function ReviewStep({ wizard }: { wizard: ReturnType<typeof useClaimWizard> }) {
  const {
    claimType,
    totalAmount,
    reimbursableAmount,
    approver,
    filingDate,
    lineItemsLocal,
    cashAdvancePurpose,
    handleBack,
  } = wizard;

  return (
    <Card className="max-w-3xl mx-auto px-4 py-8 text-center sm:px-8 sm:py-12">
      <span aria-hidden="true" className="material-symbols-outlined text-[48px] text-primary mb-4">fact_check</span>
      <h4 className="font-headline-md text-on-surface mb-2">Ready to Submit</h4>
      <p className="text-on-surface-variant mb-6">Review your {claimType} before submission.</p>
      <div className="bg-surface-container p-6 rounded-lg text-left mx-auto w-full max-w-md">
        <div className="flex justify-between mb-2"><span className="text-on-surface-variant">Type:</span><span className="font-bold">{claimType}</span></div>
        <div className="flex justify-between mb-2"><span className="text-on-surface-variant">Claimed Amount:</span><span className="font-mono-data font-bold">{formatMoney(totalAmount)}</span></div>
        {(claimType === 'Reimbursement' || claimType === 'Transport Reimbursement') && (
          <div className="flex justify-between mb-2">
            <span className="text-on-surface-variant">Maximum Reimbursable:</span>
            <span className="font-mono-data font-bold text-primary">{formatMoney(reimbursableAmount)}</span>
          </div>
        )}
        {claimType === 'Cash Advance' && (
          <div className="flex justify-between mb-2 gap-4">
            <span className="text-on-surface-variant">Purpose:</span>
            <span className="text-right font-semibold break-words">{cashAdvancePurpose.trim() || 'Not entered'}</span>
          </div>
        )}
        <div className="flex justify-between mb-2"><span className="text-on-surface-variant">Date Filed:</span><span className="font-mono-data font-bold">{filingDate}</span></div>
        <div className="flex justify-between"><span className="text-on-surface-variant">Approver:</span><span className="font-bold">{approver?.name || 'Assigned Approver'}</span></div>
        {totalAmount > REIMBURSEMENT_CAP && (claimType === 'Reimbursement' || claimType === 'Transport Reimbursement') && (
          <p className="text-body-sm text-tertiary mt-4 pt-4 border-t border-outline-variant">
            You may file the full amount, but current policy limits reimbursement to {formatMoney(REIMBURSEMENT_CAP)} per claim.
          </p>
        )}
      </div>

      {claimType !== 'Cash Advance' && (
        <section aria-labelledby="review-expenses-heading" className="mx-auto mt-8 max-w-2xl text-left">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h5 id="review-expenses-heading" className="font-label-md font-semibold text-on-surface">
              Expense details ({lineItemsLocal.length})
            </h5>
            <Button type="button" size="sm" variant="ghost" onClick={handleBack} className="gap-1">
              Edit expenses <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit</span>
            </Button>
          </div>

          {lineItemsLocal.length === 0 ? (
            <p className="rounded-lg border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
              No expense items have been added. Go back to add an expense before submitting.
            </p>
          ) : (
            <ol className="divide-y divide-outline-variant rounded-lg border border-outline-variant bg-surface-container-lowest">
              {lineItemsLocal.map((item, index) => {
                const hasReceipt = Boolean(item.receiptFile || item.receiptUrl);
                const receiptRequired = claimType !== 'Transport Reimbursement';

                return (
                  <li key={index} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <h6 className="font-semibold text-on-surface">Expense {index + 1}</h6>
                      <p className="shrink-0 font-mono-data font-bold text-on-surface">{formatMoney(Number(item.amount) || 0)}</p>
                    </div>
                    <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium text-on-surface-variant">Purchase date</dt>
                        <dd className="mt-0.5 text-sm text-on-surface">{formatDate(item.expenseDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-on-surface-variant">Category</dt>
                        <dd className="mt-0.5 text-sm text-on-surface">{item.category?.trim() || 'Not selected'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-on-surface-variant">Vendor / Supplier</dt>
                        <dd className="mt-0.5 break-words text-sm text-on-surface">{item.vendor?.trim() || 'Not entered'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-on-surface-variant">Payment method</dt>
                        <dd className="mt-0.5 text-sm text-on-surface">{item.paymentMethod?.trim() || 'Not selected'}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-medium text-on-surface-variant">Business purpose</dt>
                        <dd className="mt-0.5 break-words text-sm text-on-surface">{item.businessPurpose?.trim() || 'Not entered'}</dd>
                      </div>
                      {item.orNumber?.trim() && (
                        <div>
                          <dt className="text-xs font-medium text-on-surface-variant">OR number</dt>
                          <dd className="mt-0.5 break-words text-sm text-on-surface">{item.orNumber}</dd>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-medium text-on-surface-variant">Receipt</dt>
                        <dd className={`mt-0.5 flex items-center gap-1.5 text-sm ${hasReceipt ? 'text-success' : receiptRequired ? 'text-error' : 'text-on-surface-variant'}`}>
                          <span aria-hidden="true" className="material-symbols-outlined text-[17px]">
                            {hasReceipt ? 'check_circle' : receiptRequired ? 'error' : 'info'}
                          </span>
                          {hasReceipt
                            ? `Attached${item.receiptFile?.name ? `: ${item.receiptFile.name}` : ''}`
                            : receiptRequired ? 'Required receipt not attached' : 'No receipt attached (optional)'}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </Card>
  );
}
