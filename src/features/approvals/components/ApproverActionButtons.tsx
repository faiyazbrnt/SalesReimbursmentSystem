import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ClaimStatus, Claim } from '../../../types';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { useAppContext } from '../../../components/AppContext';
import { useToast } from '../../../components/shared/ToastContext';
import { Portal } from '../../../components/shared/Portal';

export interface ApproverActionButtonsProps {
  claim: Claim;
  size?: 'sm' | 'md';
  compact?: boolean;
}

// Approve/Return/Reject for a claim awaiting this approver's decision. Shared
// by ApprovalQueue (row actions) and ClaimDetail (full-context review) so the
// decision rules (per-type button visibility, required reason text) live in
// exactly one place.
export function ApproverActionButtons({ claim, size = 'sm', compact = false }: ApproverActionButtonsProps) {
  const { currentUser, updateClaimStatus } = useAppContext();
  const { addToast } = useToast();

  const [activeModal, setActiveModal] = useState<'approve' | 'reject' | 'return' | null>(null);
  const [comment, setComment] = useState('');
  const [reviewMeetingDate, setReviewMeetingDate] = useState('');
  const [reviewMeetingTime, setReviewMeetingTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, maxHeight: 0 });

  const updateMenuPosition = () => {
    const trigger = actionButtonRef.current;
    if (!trigger) return;

    const triggerBounds = trigger.getBoundingClientRect();
    const menuHeight = actionMenuRef.current?.getBoundingClientRect().height || 132;
    const viewportPadding = 8;
    const menuWidth = 160;
    const spaceBelow = window.innerHeight - triggerBounds.bottom - viewportPadding;
    const spaceAbove = triggerBounds.top - viewportPadding;
    const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(0, openUpward ? spaceAbove : spaceBelow);

    setMenuPosition({
      top: openUpward
        ? Math.max(viewportPadding, triggerBounds.top - Math.min(menuHeight, maxHeight))
        : triggerBounds.bottom + viewportPadding,
      left: Math.min(
        Math.max(viewportPadding, triggerBounds.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding,
      ),
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!isMenuOpen) return;
    updateMenuPosition();
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!actionButtonRef.current?.contains(target) && !actionMenuRef.current?.contains(target)) {
        setIsMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        actionButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isMenuOpen]);

  const handleAction = (action: 'approve' | 'reject' | 'return') => {
    setIsMenuOpen(false);
    setComment('');
    setReviewMeetingDate('');
    setReviewMeetingTime('');
    setActiveModal(action);
  };

  const handleConfirm = async () => {
    if (!activeModal) return;
    if ((reviewMeetingDate && !reviewMeetingTime) || (!reviewMeetingDate && reviewMeetingTime)) {
      addToast('Choose both a review meeting date and time, or leave both blank.', 'error');
      return;
    }

    let newStatus: ClaimStatus;
    let toastMsg = '';
    let toastType: 'success' | 'error' | 'info' = 'success';

    switch (activeModal) {
      case 'approve':
        newStatus = ClaimStatus.APPROVED;
        toastMsg = 'Claim approved successfully.';
        break;
      case 'reject':
        newStatus = ClaimStatus.REJECTED;
        toastMsg = 'Claim rejected successfully.';
        toastType = 'success';
        break;
      case 'return':
        newStatus = ClaimStatus.RETURNED;
        toastMsg = 'Claim returned successfully.';
        toastType = 'success';
        break;
    }

    setIsSubmitting(true);
    try {
      await updateClaimStatus(claim.id, newStatus, currentUser.id, comment, {
        reviewMeetingDate: reviewMeetingDate || undefined,
        reviewMeetingTime: reviewMeetingTime || undefined,
      });
      addToast(toastMsg, toastType);
      setActiveModal(null);
    } catch (err: any) {
      addToast(err?.message || 'Could not action this claim.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isConfirmDisabled = (activeModal === 'reject' || activeModal === 'return') && comment.trim() === '';
  const reviewMeetingFields = (
    <div className="mt-4 pt-4 border-t border-outline-variant">
      <p className="font-label-md text-on-surface mb-1">Optional Review Meeting</p>
      <p className="text-body-sm text-outline mb-3">Schedule time with the requestor to discuss this decision.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-label-sm text-on-surface mb-1">Date</label>
          <Input type="date" value={reviewMeetingDate} onChange={event => setReviewMeetingDate(event.target.value)} disabled={isSubmitting} />
        </div>
        <div>
          <label className="block text-label-sm text-on-surface mb-1">Time</label>
          <Input type="time" value={reviewMeetingTime} onChange={event => setReviewMeetingTime(event.target.value)} disabled={isSubmitting} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
        {compact ? (
          <>
            <button
              ref={actionButtonRef}
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-primary px-3 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen(open => !open)}
            >
              Actions
              <span aria-hidden="true" className="material-symbols-outlined text-[17px]">expand_more</span>
            </button>
            {isMenuOpen && (
              <Portal>
                <div
                  ref={actionMenuRef}
                  role="menu"
                  className="fixed z-[60] w-40 overflow-y-auto rounded-lg border border-outline-variant bg-white p-1.5 text-left shadow-lg"
                  style={{ top: menuPosition.top, left: menuPosition.left, maxHeight: menuPosition.maxHeight }}
                  onClick={event => event.stopPropagation()}
                >
                  <button role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-green-600 hover:bg-green-50" onClick={() => handleAction('approve')}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check_circle</span>Approve
                  </button>
                  {claim.type !== 'Cash Advance' && (
                    <button role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-tertiary hover:bg-tertiary/10" onClick={() => handleAction('return')}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">undo</span>Return
                    </button>
                  )}
                  {claim.type !== 'Liquidation' && (
                    <button role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-error hover:bg-error/10" onClick={() => handleAction('reject')}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">cancel</span>Reject
                    </button>
                  )}
                </div>
              </Portal>
            )}
          </>
        ) : (
          <>
            <Button size={size} variant="success-outline" onClick={() => handleAction('approve')}>Approve</Button>
            {claim.type !== 'Cash Advance' && (
              <Button size={size} variant="outline" className="text-tertiary border-tertiary hover:bg-tertiary/10" onClick={() => handleAction('return')}>Return</Button>
            )}
            {claim.type !== 'Liquidation' && (
              <Button size={size} variant="outline" className="text-error border-error hover:bg-error/10" onClick={() => handleAction('reject')}>Reject</Button>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={activeModal === 'approve'}
        onClose={() => setActiveModal(null)}
        onConfirm={handleConfirm}
        title="Approve Claim"
        confirmLabel={isSubmitting ? "Approving..." : "Approve"}
        disabled={isSubmitting}
        variant="success"
      >
        <p className="mb-4">Are you sure you want to approve this claim? It will be forwarded to the custodian for processing.</p>
        <div>
          <label className="block text-label-md text-on-surface mb-1">Comment (Optional)</label>
          <textarea
            className="w-full p-3 rounded-lg border border-outline-variant bg-surface text-on-surface focus:outline-primary resize-none"
            rows={3}
            placeholder="Add any notes..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={activeModal === 'return'}
        onClose={() => setActiveModal(null)}
        onConfirm={handleConfirm}
        title="Return for Revision"
        confirmLabel={isSubmitting ? "Returning..." : "Return to Requestor"}
        variant="warning"
        disabled={isConfirmDisabled || isSubmitting}
      >
        <p className="mb-4">Return this claim to the requestor for corrections. They will be notified to resubmit.</p>
        <div>
          <label className="block text-label-md text-on-surface mb-1">Reason for Return <span className="text-error">*</span></label>
          <textarea
            className="w-full p-3 rounded-lg border border-outline-variant bg-surface text-on-surface focus:outline-primary resize-none"
            rows={3}
            placeholder="Please explain what needs to be fixed..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isSubmitting}
          />
          {isConfirmDisabled && (
            <p className="text-error text-body-sm mt-1">A reason is required to return a claim.</p>
          )}
        </div>
        {reviewMeetingFields}
      </ConfirmModal>

      <ConfirmModal
        isOpen={activeModal === 'reject'}
        onClose={() => setActiveModal(null)}
        onConfirm={handleConfirm}
        title="Reject Claim"
        confirmLabel={isSubmitting ? "Rejecting..." : "Reject Claim"}
        variant="error"
        disabled={isConfirmDisabled || isSubmitting}
      >
        <p className="mb-4 text-error">Rejecting a claim is final. The requestor will have to create a new claim if they wish to try again.</p>
        <div>
          <label className="block text-label-md text-on-surface mb-1">Reason for Rejection <span className="text-error">*</span></label>
          <textarea
            className="w-full p-3 rounded-lg border border-outline-variant bg-surface text-on-surface focus:outline-primary resize-none"
            rows={3}
            placeholder="Please explain why this claim is rejected..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isSubmitting}
          />
          {isConfirmDisabled && (
            <p className="text-error text-body-sm mt-1">A reason is required to reject a claim.</p>
          )}
        </div>
        {reviewMeetingFields}
      </ConfirmModal>
    </>
  );
}
