import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ApproverActionButtons } from '@/features/approvals';
import { CustodianActionButtons } from '@/features/disbursements';
import { useAppContext } from '../../../components/AppContext';
import { useToast } from '../../../components/shared/ToastContext';
import { confirmReceipt, resubmitClaimFlow, deleteClaim, DraftLineItem } from '../../../lib/api';
import { apiFetch } from '../../../lib/api/client';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { UserRole, ClaimStatus, ExpenseLineItem } from '../../../types';
import { isCustodianProcessingClaim } from '../domain/claimWorkflow';
import { exportClaimPdf, exportClaimWord } from '../../../lib/claimExport';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';
import { ConfirmReceiptModal } from './ConfirmReceiptModal';
import { ReviseClaimModal } from './ReviseClaimModal';
import { ClaimSummaryCard } from './ClaimSummaryCard';
import { ClaimLineItemsTable } from './ClaimLineItemsTable';
import { ClaimMomSection } from './ClaimMomSection';
import { ClaimTimeline } from './ClaimTimeline';

export function ClaimDetailView() {
  const { addToast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, claims, lineItems, moms, users, statusHistory, fieldDefinitions, refresh, applyClaimUpdate } = useAppContext();
  const [activeReceipt, setActiveReceipt] = useState<ExpenseLineItem | null>(null);
  const [confirmingReceipt, setConfirmingReceipt] = useState(false);
  const [receiptCode, setReceiptCode] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const receiptCodeRef = useRef<HTMLInputElement>(null);
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const [revising, setRevising] = useState(false);
  const [reviseLineItems, setReviseLineItems] = useState<DraftLineItem[]>([]);
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'word' | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportMenuOpen(false);
      }
    };
    if (exportMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportMenuOpen]);

  const claim = claims.find(c => c.id === id) || (id ? undefined : claims[0]);
  const items = claim ? lineItems.filter(li => li.claimId === claim.id) : [];
  const mom = claim ? moms.find(m => m.claimId === claim.id) : undefined;
  const history = claim
    ? statusHistory
        .filter(h => h.claimId === claim.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : [];
  const requestorName = claim
    ? users.find(user => user.id === claim.requestorId)?.name || 'Unknown requestor'
    : 'Unknown requestor';

  const handleExport = async (format: 'pdf' | 'word') => {
    if (!claim) return;
    setExportMenuOpen(false);
    setExporting(format);
    try {
      if (format === 'pdf') {
        await exportClaimPdf(claim, items, mom, requestorName);
      } else {
        exportClaimWord(claim, items, mom, requestorName);
      }
      addToast(`Claim exported as ${format === 'pdf' ? 'PDF' : 'Word'}.`, 'success');
    } catch (error: any) {
      addToast(error?.message || 'Could not export this claim.', 'error');
    } finally {
      setExporting(null);
    }
  };

  const isApprover = Boolean(
    claim &&
    currentUser.role === UserRole.APPROVER &&
    (claim.status === ClaimStatus.PENDING_APPROVAL || claim.status === ClaimStatus.SUBMITTED) &&
    currentUser.id !== claim.requestorId
  );

  const isCustodian = Boolean(claim && currentUser.role === UserRole.CUSTODIAN && isCustodianProcessingClaim(claim));
  const canConfirmReceipt = Boolean(claim && currentUser.id === claim.requestorId && claim.status === ClaimStatus.READY_FOR_CLAIM);
  const isDraft = Boolean(claim && currentUser.id === claim.requestorId && claim.status === ClaimStatus.DRAFT);
  const canEditAndSubmit = Boolean(
    claim &&
    currentUser.id === claim.requestorId &&
    (claim.status === ClaimStatus.RETURNED || claim.status === ClaimStatus.DRAFT) &&
    (claim.type === 'Reimbursement' || claim.type === 'Transport Reimbursement')
  );
  const canSubmitCashAdvance = Boolean(
    claim &&
    currentUser.id === claim.requestorId &&
    claim.status === ClaimStatus.DRAFT &&
    claim.type === 'Cash Advance'
  );
  const canSubmitLiquidation = Boolean(
    claim &&
    currentUser.id === claim.requestorId &&
    claim.status === ClaimStatus.DRAFT &&
    claim.type === 'Liquidation'
  );

  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);

  const handleDeleteDraft = async () => {
    if (!claim) return;
    setDeletingDraft(true);
    try {
      await deleteClaim(claim.id);
      await refresh();
      addToast('Record deleted successfully.', 'success');
      navigate('/claims');
    } catch (err: any) {
      addToast(err?.message || 'Could not discard draft.', 'error');
      setDeletingDraft(false);
    }
  };

  const handleSubmitCashAdvance = async () => {
    if (!claim) return;
    setSubmittingRevision(true);
    try {
      await apiFetch(`/api/cash-advances/${claim.id}/submit`, { method: 'POST' });
      applyClaimUpdate(claim.id, { status: ClaimStatus.SUBMITTED });
      void refresh();
      addToast('Claim submitted successfully.', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Could not submit cash advance.', 'error');
    } finally {
      setSubmittingRevision(false);
    }
  };

  const handleSubmitLiquidation = async () => {
    if (!claim) return;
    setSubmittingRevision(true);
    try {
      await apiFetch(`/api/liquidations/${claim.id}/submit`, { method: 'POST' });
      applyClaimUpdate(claim.id, { status: ClaimStatus.SUBMITTED });
      void refresh();
      addToast('Claim submitted successfully.', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Could not submit liquidation.', 'error');
    } finally {
      setSubmittingRevision(false);
    }
  };

  const availableMoms = claim
    ? moms.filter(m => m.requestorId === currentUser.id && (!m.claimId || m.claimId === claim.id))
    : [];
  const [selectedMomId, setSelectedMomId] = useState(mom?.id || '');

  const openRevise = () => {
    if (!claim) return;
    setReviseLineItems(items.length > 0 ? items.map(li => ({
      category: li.category,
      amount: li.amount,
      vendor: li.vendor,
      businessPurpose: li.businessPurpose,
      expenseDate: li.expenseDate,
      paymentMethod: li.paymentMethod,
      receiptUrl: li.receiptUrl,
      orNumber: li.orNumber,
    })) : [{
      category: 'Meals',
      amount: 0,
      vendor: '',
      businessPurpose: '',
      expenseDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'Personal Card',
      receiptUrl: undefined,
      orNumber: '',
    }]);
    setSelectedMomId(mom?.id || '');
    setRevising(true);
  };

  const handleResubmit = async () => {
    if (!claim) return;
    if (reviseLineItems.length === 0) {
      addToast('Add at least one expense line item.', 'error');
      return;
    }
    const activeMomId = mom?.id || selectedMomId;
    if (claim.type === 'Reimbursement' && !activeMomId) {
      addToast('Please select or attach a completed Minutes of Meeting before submitting.', 'error');
      return;
    }
    setSubmittingRevision(true);
    try {
      await resubmitClaimFlow({
        claimId: claim.id,
        momId: activeMomId,
        claimType: claim.type === 'Transport Reimbursement' ? 'Transport Reimbursement' : 'Reimbursement',
        lineItems: reviseLineItems,
        remarks: claim.purpose,
      });
      applyClaimUpdate(claim.id, { status: ClaimStatus.PENDING_APPROVAL });
      void refresh();
      addToast(claim.status === ClaimStatus.DRAFT ? 'Claim submitted successfully.' : 'Claim resubmitted successfully.', 'success');
      setRevising(false);
    } catch (err: any) {
      addToast(err?.message || 'Could not resubmit the claim.', 'error');
    } finally {
      setSubmittingRevision(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!claim) return;
    if (!receiptCode.trim()) {
      setReceiptError('Enter the release code from your custodian.');
      return;
    }
    setSubmittingReceipt(true);
    setReceiptError('');
    try {
      await confirmReceipt(claim.id, receiptCode.trim());
      applyClaimUpdate(claim.id, { status: ClaimStatus.COMPLETED });
      void refresh();
      addToast('Receipt confirmed successfully.', 'success');
      setConfirmingReceipt(false);
      setReceiptCode('');
    } catch (err: any) {
      setReceiptError(err?.message || 'Could not confirm receipt.');
    } finally {
      setSubmittingReceipt(false);
    }
  };

  if (!claim) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-300">
        <span className="material-symbols-outlined text-[48px] text-outline mb-2">search_off</span>
        <h2 className="font-headline-sm text-on-surface">Claim Not Found</h2>
        <p className="text-body-sm text-outline mt-1 max-w-md">
          The requested claim could not be found or may still be loading.
        </p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate('/claims')}>
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Claims
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div className="min-w-0">
          <nav className="flex gap-2 text-on-surface-variant font-label-sm mb-2">
            <button type="button" className="cursor-pointer hover:text-primary" onClick={() => navigate(-1)}>Claims</button>
            <span>/</span>
            <span className="text-on-surface font-semibold">{claim.ref}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-display text-on-surface break-words">{claim.purpose}</h1>
            <StatusBadge status={claim.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div ref={exportMenuRef} className="relative">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setExportMenuOpen(prev => !prev)}
              disabled={exporting !== null}
              aria-expanded={exportMenuOpen}
              aria-haspopup="true"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                {exporting ? 'sync' : 'download'}
              </span>
              <span>{exporting ? (exporting === 'pdf' ? 'Exporting PDF…' : 'Exporting Word…') : 'Export'}</span>
              <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${exportMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true">
                expand_more
              </span>
            </Button>
            {exportMenuOpen && (
              <div
                className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={exporting !== null}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50"
                  onClick={() => handleExport('pdf')}
                >
                  <span className="material-symbols-outlined text-[18px] text-error" aria-hidden="true">picture_as_pdf</span>
                  <div>
                    <span className="font-medium block leading-tight">Export as PDF</span>
                    <span className="text-[11px] text-outline block">.pdf document</span>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={exporting !== null}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50"
                  onClick={() => handleExport('word')}
                >
                  <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">description</span>
                  <div>
                    <span className="font-medium block leading-tight">Export as Word</span>
                    <span className="text-[11px] text-outline block">.docx document</span>
                  </div>
                </button>
              </div>
            )}
          </div>
          {isApprover && <ApproverActionButtons claim={claim} size="md" />}
          {isCustodian && <CustodianActionButtons claim={claim} size="md" />}
          {canConfirmReceipt && (
            <Button className="gap-2" onClick={() => { setReceiptCode(''); setReceiptError(''); setConfirmingReceipt(true); }}>
              <span className="material-symbols-outlined text-[18px]">check_circle</span> Confirm Receipt
            </Button>
          )}
          {canEditAndSubmit && (
            <Button className="gap-2" onClick={openRevise}>
              <span className="material-symbols-outlined text-[18px]">
                {claim.status === ClaimStatus.DRAFT ? 'edit_note' : 'edit_note'}
              </span>
              {claim.status === ClaimStatus.DRAFT ? 'Continue & Submit Draft' : 'Revise & Resubmit'}
            </Button>
          )}
          {canSubmitCashAdvance && (
            <Button className="gap-2" onClick={handleSubmitCashAdvance} disabled={submittingRevision}>
              {submittingRevision ? <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> : <span className="material-symbols-outlined text-[18px]">send</span>}
              Submit for Approval
            </Button>
          )}
          {canSubmitLiquidation && (
            <Button className="gap-2" onClick={handleSubmitLiquidation} disabled={submittingRevision}>
              {submittingRevision ? <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> : <span className="material-symbols-outlined text-[18px]">send</span>}
              Submit Liquidation
            </Button>
          )}
          {isDraft && (
            <Button
              variant="outline"
              className="gap-2 text-error border-error/30 hover:bg-error/10"
              onClick={() => setConfirmDeleteDraft(true)}
              disabled={deletingDraft}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Discard Draft
            </Button>
          )}
        </div>
      </div>

      {isDraft && (
        <Card className="border-amber-400 bg-amber-500/10">
          <CardContent className="p-4 sm:p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">drafts</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-on-surface">This request is saved as a Draft</h3>
              <p className="text-body-sm text-outline">
                You can review and edit line items, receipts, and submit this request whenever you're ready.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-8">
        <ClaimSummaryCard claim={claim} fieldDefinitions={fieldDefinitions} />
        {canConfirmReceipt && claim.releaseCode && (
          <Card className="border-primary/30 bg-primary-container/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary">key</span>
                <h3 className="font-headline-md text-on-surface">Ready for Release</h3>
              </div>
              <p className="text-body-sm text-on-surface-variant mb-4">
                The custodian has released your payout. Enter the release code they gave you
                (in person or by message) to confirm receipt and complete this claim.
              </p>
              <Button className="w-full gap-2" onClick={() => { setReceiptCode(''); setReceiptError(''); setConfirmingReceipt(true); }}>
                <span className="material-symbols-outlined text-[18px]">check_circle</span> Enter Code to Confirm
              </Button>
            </CardContent>
          </Card>
        )}
        <ClaimLineItemsTable claim={claim} items={items} onSelectReceipt={setActiveReceipt} />
        <ClaimTimeline claim={claim} history={history} users={users} />
        {mom && <ClaimMomSection mom={mom} claim={claim} />}
      </div>

      <ReceiptPreviewModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />

      <ConfirmReceiptModal
        isOpen={confirmingReceipt}
        onClose={() => setConfirmingReceipt(false)}
        claim={claim}
        receiptCode={receiptCode}
        setReceiptCode={setReceiptCode}
        receiptError={receiptError}
        setReceiptError={setReceiptError}
        receiptCodeRef={receiptCodeRef}
        submittingReceipt={submittingReceipt}
        onConfirm={handleConfirmReceipt}
      />

      <ReviseClaimModal
        isOpen={revising}
        onClose={() => setRevising(false)}
        claim={claim}
        history={history}
        reviseLineItems={reviseLineItems}
        setReviseLineItems={setReviseLineItems}
        submittingRevision={submittingRevision}
        onResubmit={handleResubmit}
        availableMoms={availableMoms}
        selectedMomId={selectedMomId}
        setSelectedMomId={setSelectedMomId}
      />

      <ConfirmModal
        isOpen={confirmDeleteDraft}
        onClose={() => setConfirmDeleteDraft(false)}
        onConfirm={handleDeleteDraft}
        title="Discard Draft Request"
        confirmLabel={deletingDraft ? 'Discarding…' : 'Discard Draft'}
        variant="error"
      >
        <p>Are you sure you want to discard this draft? This request and its drafted items will be permanently removed.</p>
      </ConfirmModal>
    </div>
  );
}
