import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/Button';
import { formatMoney } from '../../../lib/money';
import { REIMBURSEMENT_CAP, useClaimWizard } from './useClaimWizard';

export function ReviewStep({ wizard }: { wizard: ReturnType<typeof useClaimWizard> }) {
  const {
    currentUser,
    claimType,
    totalAmount,
    reimbursableAmount,
    approver,
    filingDate,
    isSubtotalCapExceeded,
    subtotalCapMessage,
  } = wizard;

  return (
    <Card className="max-w-3xl mx-auto text-center py-12">
      <span className="material-symbols-outlined text-[48px] text-primary mb-4">fact_check</span>
      <h4 className="font-headline-md text-on-surface mb-2">Ready to Submit</h4>
      <p className="text-on-surface-variant mb-6">Review your {claimType} before submission.</p>
      <div className="bg-surface-container p-6 rounded-lg text-left inline-block w-full max-w-md">
        <div className="flex justify-between mb-2"><span className="text-on-surface-variant">Type:</span><span className="font-bold">{claimType}</span></div>
        <div className="flex justify-between mb-2">
          <span className="text-on-surface-variant">Subtotal:</span>
          <span className={cn("font-mono-data font-bold", isSubtotalCapExceeded && "text-error")}>
            {formatMoney(totalAmount)}
          </span>
        </div>
        {(claimType === 'Reimbursement' || claimType === 'Transport Reimbursement') && (
          <div className="flex justify-between mb-2">
            <span className="text-on-surface-variant">Policy Limit:</span>
            <span className="font-mono-data font-bold text-primary">{formatMoney(REIMBURSEMENT_CAP)}</span>
          </div>
        )}
        <div className="flex justify-between mb-2"><span className="text-on-surface-variant">Date Filed:</span><span className="font-mono-data font-bold">{filingDate}</span></div>
        <div className="flex justify-between mb-2"><span className="text-on-surface-variant">Requestor:</span><span className="font-bold">{currentUser?.name || 'Requestor'}</span></div>
        <div className="flex justify-between"><span className="text-on-surface-variant">Approver:</span><span className="font-bold">{approver?.name || 'Assigned Approver'}</span></div>

        {isSubtotalCapExceeded && (
          <div className="mt-4 pt-4 border-t border-error/20 flex items-start gap-2.5 text-error text-left bg-error/10 p-3.5 rounded-lg" role="alert">
            <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">error</span>
            <div className="text-body-sm">
              <span className="font-semibold block">{subtotalCapMessage}</span>
              <span className="text-on-surface-variant text-xs mt-0.5 block">
                Single claim submissions cannot exceed {formatMoney(REIMBURSEMENT_CAP)}. Please go back and adjust your expenses before submitting.
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
