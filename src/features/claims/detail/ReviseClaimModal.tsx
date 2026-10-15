import { PaginatedTable } from '../../../components/ui/PaginatedTable';
import { useState, useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button, cn } from '../../../components/ui/Button';
import { Claim, StatusHistory, ClaimStatus, MOM } from '../../../types';
import { DraftLineItem } from '../../../lib/api';

export function ReviseClaimModal({
  isOpen,
  onClose,
  claim,
  history,
  reviseLineItems,
  setReviseLineItems,
  submittingRevision,
  onResubmit,
  availableMoms,
  selectedMomId,
  setSelectedMomId,
}: {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim;
  history: StatusHistory[];
  reviseLineItems: DraftLineItem[];
  setReviseLineItems: Dispatch<SetStateAction<DraftLineItem[]>>;
  submittingRevision: boolean;
  onResubmit: () => void;
  availableMoms?: MOM[];
  selectedMomId?: string;
  setSelectedMomId?: Dispatch<SetStateAction<string>>;
}) {
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
    setReviseLineItems(p => p.map((li, i) => i === targetIdx ? {
      expenseDate: new Date().toISOString().split('T')[0],
      amount: 0,
      paymentMethod: 'Personal Card',
      vendor: '',
      businessPurpose: '',
      orNumber: '',
      receiptFile: undefined,
      receiptUrl: undefined,
      category: 'Meals',
    } : li));
    setOpenMenuIdx(null);
  };

  const handleDeleteRow = (targetIdx: number) => {
    setReviseLineItems(p => {
      if (p.length <= 1) {
        return [{
          expenseDate: new Date().toISOString().split('T')[0],
          amount: 0,
          paymentMethod: 'Personal Card',
          vendor: '',
          businessPurpose: '',
          orNumber: '',
          receiptFile: undefined,
          receiptUrl: undefined,
          category: 'Meals',
        }];
      }
      return p.filter((_, i) => i !== targetIdx);
    });
    setOpenMenuIdx(null);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen onClose={onClose} titleId="revise-claim-title" className="max-w-3xl">
      <div className="bg-surface-container-lowest rounded-xl w-full p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-outline-variant pb-3">
          <h3 id="revise-claim-title" className="font-headline-sm text-on-surface">
            {claim.status === ClaimStatus.DRAFT ? `Continue & Submit Draft ${claim.ref}` : `Revise & Resubmit ${claim.ref}`}
          </h3>
          <button aria-label="Close claim revision" onClick={onClose} className="text-outline hover:text-on-surface">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>

        {claim.status !== ClaimStatus.DRAFT && history[0]?.comment && (
          <div className="p-3 bg-error-container/20 border border-error/20 rounded-lg">
            <p className="text-body-sm font-medium text-error mb-1">Approver's note:</p>
            <p className="text-body-sm text-on-surface-variant italic">"{history[0].comment}"</p>
          </div>
        )}

        {claim.type === 'Reimbursement' && !claim.client && availableMoms && availableMoms.length > 0 && setSelectedMomId && (
          <div className="p-3 bg-surface-container rounded-lg space-y-1.5 border border-brand-border">
            <label className="font-label-sm text-on-surface font-semibold">Minutes of Meeting (MOM)</label>
            <select
              value={selectedMomId || ''}
              onChange={e => setSelectedMomId(e.target.value)}
              className="w-full bg-white border border-brand-field-border rounded-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">-- Select an existing Minutes of Meeting --</option>
              {availableMoms.map(m => (
                <option key={m.id} value={m.id}>
                  {m.companyName || m.summary || 'Meeting'} - {m.purposeOfMeeting} ({m.meetingDate})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white">
          <div className="overflow-x-auto">
            <PaginatedTable className="w-full text-left min-w-[700px]">
            <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Purpose</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Receipt</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-outline-variant">
              {reviseLineItems.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2">
                    <select
                      className="w-full py-1 px-2 text-xs border border-outline-variant rounded"
                      value={item.category || ''}
                      onChange={e => setReviseLineItems(p => p.map((li, i) => i === idx ? { ...li, category: e.target.value } : li))}
                    >
                      <option value="">Select Category</option>
                      <option>Meals</option>
                      <option>Supplies</option>
                      <option>Lodging</option>
                      <option>Transportation</option>
                      <option>Utilities</option>
                      <option>Entertainment</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full py-1 px-2 text-xs border border-outline-variant rounded"
                      value={item.vendor || ''}
                      onChange={e => setReviseLineItems(p => p.map((li, i) => i === idx ? { ...li, vendor: e.target.value } : li))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full py-1 px-2 text-xs border border-outline-variant rounded"
                      value={item.businessPurpose || ''}
                      onChange={e => setReviseLineItems(p => p.map((li, i) => i === idx ? { ...li, businessPurpose: e.target.value } : li))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      className="w-full py-1 px-2 text-xs text-right font-mono-data border border-outline-variant rounded"
                      value={item.amount || ''}
                      onChange={e => setReviseLineItems(p => p.map((li, i) => i === idx ? { ...li, amount: Number(e.target.value) } : li))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {item.receiptFile ? (
                      <span className="text-xs text-primary truncate max-w-[100px] inline-block">{item.receiptFile.name}</span>
                    ) : item.receiptUrl ? (
                      <span className="text-xs text-outline">Existing receipt</span>
                    ) : (
                      <span className="text-xs text-error">No receipt</span>
                    )}
                    <label className="ml-2 cursor-pointer text-xs text-primary hover:underline">
                      {item.receiptUrl || item.receiptFile ? 'Replace' : 'Attach'}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setReviseLineItems(p => p.map((li, i) => i === idx ? { ...li, receiptFile: file, receiptUrl: URL.createObjectURL(file) } : li));
                        }}
                      />
                    </label>
                  </td>
                  <td className="px-3 py-2 relative">
                    <div className="relative inline-block text-left" ref={openMenuIdx === idx ? menuContainerRef : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenMenuIdx(prev => prev === idx ? null : idx)}
                        className={cn(
                          "p-1 rounded text-error hover:bg-error-container/20 hover:opacity-100 transition-colors flex items-center justify-center",
                          openMenuIdx === idx && "bg-error-container/30"
                        )}
                        title="Row actions"
                        aria-label={`Row actions for line ${idx + 1}`}
                        aria-expanded={openMenuIdx === idx}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete_outline</span>
                      </button>

                      {openMenuIdx === idx && (
                        <div className="absolute right-0 bottom-full mb-1 z-30 w-48 rounded-lg bg-surface-container-high border border-outline-variant shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100">
                          <div className="px-3 py-1 border-b border-outline-variant/50">
                            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Line Item {idx + 1}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleClearRowData(idx)}
                            className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container-highest flex items-center gap-2 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px] text-outline">backspace</span>
                            <div>
                              <span className="font-medium block leading-tight">Clear inputs only</span>
                              <span className="text-[10px] text-on-surface-variant block">Reset fields, keep row</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(idx)}
                            className="w-full text-left px-3 py-1.5 text-xs text-error hover:bg-error-container/20 flex items-center gap-2 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px] text-error">delete</span>
                            <div>
                              <span className="font-medium block leading-tight">Delete row</span>
                              <span className="text-[10px] text-error/80 block">Remove from table</span>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </PaginatedTable>
        </div>
      </div>

        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => setReviseLineItems(p => [...p, { expenseDate: new Date().toISOString().split('T')[0], amount: 0, paymentMethod: 'Personal Card', vendor: '', category: 'Meals' }])}
        >
          <span className="material-symbols-outlined text-[16px]">add</span> Add Row
        </Button>

        <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
          <Button variant="ghost" onClick={onClose} disabled={submittingRevision}>Cancel</Button>
          <Button className="gap-2" onClick={onResubmit} disabled={submittingRevision}>
            {submittingRevision ? <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> : null}
            {claim.status === ClaimStatus.DRAFT ? 'Submit for Approval' : 'Resubmit for Approval'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
