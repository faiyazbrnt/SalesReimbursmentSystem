import { PaginatedTable } from '../../../components/ui/PaginatedTable';
import { CardHeader } from '../../../components/ui/Card';
import { Claim, ExpenseLineItem } from '../../../types';
import { formatMoney } from '../../../lib/money';

export function ClaimLineItemsTable({
  claim,
  items,
  onSelectReceipt,
}: {
  claim: Claim;
  items: ExpenseLineItem[];
  onSelectReceipt: (item: ExpenseLineItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-white">
      <CardHeader className="bg-white border-b border-outline-variant">
        <h3 className="font-headline-md text-slate-900 font-bold">Expense Line Items</h3>
        <div className="bg-primary-fixed text-on-primary-fixed px-3 py-1 rounded-full font-label-md">
          Total: {formatMoney(claim.total)}
        </div>
      </CardHeader>
      <div className="overflow-x-auto hidden md:block">
        <PaginatedTable paginate={items.length > 8} className="w-full text-left">
          <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
            <tr>
              <th className="px-4 py-3">Date of Purchase</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Vendor / Purpose</th>
              <th className="px-4 py-3">OR Number</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-center">Receipt</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-outline-variant">
            {items.map(item => {
              const hasReceipt = Boolean(item.receiptUrl);
              return (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors bg-white">
                  <td className="px-4 py-3 font-mono-data text-xs">
                    {item.expenseDate}
                    {Math.floor((Date.now() - new Date(`${item.expenseDate}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24)) > 30 && (
                      <span className="block text-[11px] text-tertiary mt-1">Receipt over 30 days old</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p className="font-bold text-on-surface">{item.vendor || 'N/A'}</p>
                    <p className="text-on-surface-variant text-[12px]">{item.businessPurpose}</p>
                  </td>
                  <td className="px-4 py-3 font-mono-data text-xs text-on-surface-variant">{item.orNumber || '—'}</td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{item.paymentMethod || 'Personal Card'}</td>
                  <td className="px-4 py-3 font-mono-data text-right font-bold text-xs">{formatMoney(item.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    {hasReceipt ? (
                      <button 
                        onClick={() => onSelectReceipt(item)}
                        className="text-primary hover:text-primary-container p-1 rounded hover:bg-primary/10 transition-colors"
                        title="View Receipt Attachment"
                      >
                        <span className="material-symbols-outlined text-[20px]">attachment</span>
                      </button>
                    ) : (
                      <span className="material-symbols-outlined text-[20px] text-outline/30 cursor-not-allowed" title="No Receipt Attached">
                        attachment
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-on-surface-variant">
                  No line items found.
                </td>
              </tr>
            )}
          </tbody>
        </PaginatedTable>
      </div>

      {/* Mobile View */}
      <div className="md:hidden divide-y divide-outline-variant">
        {items.map(item => {
          const hasReceipt = Boolean(item.receiptUrl);
          return (
            <div key={item.id} className="p-4 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {item.category}
                </span>
                <span className="font-mono-data text-xs text-outline">{item.expenseDate}</span>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="font-bold text-on-surface">{item.vendor || 'N/A'}</p>
                  <p className="text-on-surface-variant text-xs">{item.businessPurpose}</p>
                </div>
                <span className="font-mono-data font-bold">{formatMoney(item.amount)}</span>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/30">
                <span className="text-xs text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">payment</span>
                  {item.paymentMethod || 'Personal Card'}
                </span>
                {hasReceipt ? (
                  <button 
                    onClick={() => onSelectReceipt(item)}
                    className="text-primary flex items-center gap-1 text-xs font-semibold hover:underline"
                  >
                    <span className="material-symbols-outlined text-[16px]">attachment</span>
                    View Receipt
                  </button>
                ) : (
                  <span className="text-outline/50 flex items-center gap-1 text-xs">
                    <span className="material-symbols-outlined text-[16px]">attachment_off</span>
                    No Receipt
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="p-8 text-center text-on-surface-variant">
            No line items found.
          </div>
        )}
      </div>
    </div>
  );
}
