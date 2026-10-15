import { Card, CardContent } from '../../../components/ui/Card';
import { Claim, FieldDefinition } from '../../../types';
import { formatMoney } from '../../../lib/money';
import { formatDateTime } from '../../../lib/date';

export function ClaimSummaryCard({
  claim,
  fieldDefinitions,
}: {
  claim: Claim;
  fieldDefinitions: FieldDefinition[];
}) {
  return (
    <>
      {claim.customFields && Object.keys(claim.customFields).length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-primary">feed</span>
              <h3 className="font-headline-md text-on-surface">Claim Details</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(claim.customFields).map(([key, value]) => {
                const fd = fieldDefinitions.find(f => f.key === key && f.entity === 'claim');
                return (
                  <div key={key}>
                    <p className="text-label-md text-outline mb-1">{fd ? fd.label : key}</p>
                    <p className="font-body-base text-on-surface">{value}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {(claim.type === 'Reimbursement' || claim.type === 'Transport Reimbursement') && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-primary">payments</span>
              <h3 className="font-headline-md text-on-surface">Reimbursement Summary</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              <div>
                <p className="font-label-sm text-outline uppercase">Request ID</p>
                <p className="font-mono-data text-on-surface mt-1 break-words">{claim.ref}</p>
              </div>
              <div>
                <p className="font-label-sm text-outline uppercase">Claimed Amount</p>
                <p className="font-headline-md text-on-surface mt-1">{formatMoney(claim.claimedAmount)}</p>
              </div>
              <div>
                <p className="font-label-sm text-outline uppercase">Reimbursable Amount</p>
                <p className="font-headline-md text-primary mt-1">{formatMoney(claim.approvedAmount ?? Math.min(claim.claimedAmount, 1000))}</p>
                {claim.claimedAmount > 1000 && <p className="text-xs text-tertiary mt-1">Capped at ₱1,000.00</p>}
              </div>
              <div>
                <p className="font-label-sm text-outline uppercase">Date Filed</p>
                <p className="font-body-base text-on-surface mt-1">{formatDateTime(claim.submittedAt || claim.createdAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {claim.type === 'Liquidation' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
              <h3 className="font-headline-md text-on-surface">Liquidation Details</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="font-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Related Cash Advance</p>
                <p className="font-mono-data text-on-surface bg-surface-container-low px-2 py-1 rounded inline-block">{claim.cashAdvanceId}</p>
              </div>
              <div>
                <p className="font-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Variance Amount</p>
                <p className={`font-body-lg font-bold ${claim.varianceType === 'RefundDue' ? 'text-error' : claim.varianceType === 'ReimbursementDue' ? 'text-primary' : 'text-green-600'}`}>
                  {formatMoney(Math.abs(claim.varianceAmount || 0))}
                  <span className="block text-sm font-normal text-on-surface-variant mt-1">{claim.varianceType}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
