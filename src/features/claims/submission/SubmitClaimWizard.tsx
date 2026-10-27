import { Input, Label } from '../../../components/ui/Input';
import { Button, cn } from '../../../components/ui/Button';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { MomClientPreviewModal } from '@/features/moms';
import { exportMomPdf, exportMomWord } from '@/features/moms';
import { REIMBURSEMENT_FILING_WINDOW_DAYS } from '../domain/reimbursementPolicy';
import { useClaimWizard } from './useClaimWizard';
import { ClaimTypeStep } from './ClaimTypeStep';
import { LineItemsStep } from './LineItemsStep';
import { MomStep } from './MomStep';
import { ReviewStep } from './ReviewStep';

export function SubmitClaimWizard() {
  const wizard = useClaimWizard();
  const {
    currentUser,
    step,
    claimType,
    steps,
    stepFlow,
    flowPosition,
    handleAutofillTestData,
    autofilling,
    liquidationBlocked,
    handleBack,
    handleNext,
    handleSaveDraft,
    handleSubmit,
    loading,
    hasInvalidReimbursementDate,
    dateBlockMessage,
    closeDateBlockDialog,
    showMomPreview,
    setShowMomPreview,
    previewMom,
    previewExporting,
    setPreviewExporting,
    unsavedChangesDialog,
  } = wizard;

  if (step === 0) {
    return <>
      <ClaimTypeStep wizard={wizard} />
      {unsavedChangesDialog}
    </>;
  }

  return (
    <div className="max-w-[1200px] mx-auto animate-in fade-in duration-500 pb-12 px-6">
      <div className="mb-10">
        <div className="flex items-center gap-2 text-on-surface-variant mb-2">
          <span className="font-label-sm uppercase tracking-wider">Claims Management</span>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          <span className="font-label-sm uppercase tracking-wider text-primary">New {claimType}</span>
        </div>
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="font-headline-lg text-on-surface">Submit {claimType}</h2>
            <p className="font-body-base text-on-surface-variant md:hidden">
              Step {flowPosition + 1} of {stepFlow.length}: {steps.find(s => s.num === step)?.title}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" className="gap-2" onClick={handleAutofillTestData} disabled={autofilling}>
              <span className="material-symbols-outlined text-[16px]">bolt</span>
              {autofilling ? 'Filling…' : 'Autofill'}
            </Button>
            <div className="text-right hidden sm:block">
              <span className="font-label-sm text-primary uppercase">Draft mode</span>
            </div>
          </div>
        </div>

        <div className="mb-6 max-w-sm"><Label required htmlFor="requestor">Requestor</Label><Input id="requestor" required readOnly value={currentUser.name} /></div>
        {/* Stepper */}
        <div className={cn(
          "hidden md:flex relative items-center justify-between w-full mx-auto pt-6",
          stepFlow.length <= 2 ? "max-w-sm" : "max-w-4xl"
        )}>
          <div className="absolute top-[44px] left-0 w-full h-[2px] bg-outline-variant -z-10"></div>
          <div
            className="absolute top-[44px] left-0 h-[2px] bg-primary -z-10 transition-all duration-500"
            style={{ width: stepFlow.length > 1 ? `${(flowPosition / (stepFlow.length - 1)) * 100}%` : '0%' }}
          ></div>

          {steps.filter(s => stepFlow.includes(s.num)).map((s, idx) => {
            const isActive = step === s.num;
            const isCompleted = flowPosition > idx;
            return (
              <div key={s.num} className="relative z-10 flex flex-col items-center">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold text-label-md transition-colors",
                  isCompleted ? "bg-primary text-on-primary shadow-sm" :
                  isActive ? "bg-primary-container text-on-primary-container ring-4 ring-primary-container/20 border-2 border-primary" :
                  "bg-surface-container-highest text-on-surface-variant border-2 border-outline-variant"
                )}>
                  {isCompleted ? <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 700" }}>check</span> : idx + 1}
                </div>
                <span className={cn(
                  "absolute -bottom-8 font-label-sm whitespace-nowrap",
                  isActive ? "block text-primary font-bold" : "hidden sm:block",
                  isCompleted && !isActive ? "text-on-surface font-bold" : "text-on-surface-variant"
                )}>
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 md:mt-16 pb-24 md:pb-0">
        {step === 1 && <LineItemsStep wizard={wizard} />}
        {step === 2 && <MomStep wizard={wizard} />}
        {step === 4 && <ReviewStep wizard={wizard} />}
      </div>

      {/* Navigation Footer */}
      <div className="fixed md:static bottom-0 left-0 w-full md:w-auto bg-surface z-40 p-4 md:p-0 md:mt-8 flex justify-between items-center border-t border-brand-border md:pt-8 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] md:shadow-none">
        <Button variant="outline" className="gap-2" onClick={handleBack}>
          <span className="material-symbols-outlined">arrow_back</span> Back
        </Button>
        <div className="flex gap-4">
          {step > 0 && !liquidationBlocked && (
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={loading}
              className="inline-flex items-center gap-1.5 border-dashed"
            >
              <span className="material-symbols-outlined text-[18px]">drafts</span>
              <span>Save Draft</span>
            </Button>
          )}
          {step > 0 && step < 4 && !liquidationBlocked ? (
            <Button className="gap-2 px-8" onClick={handleNext}>
              Next Step <span className="material-symbols-outlined hidden sm:inline-block">arrow_forward</span>
            </Button>
          ) : step === 4 ? (
            <Button className="gap-2 px-8" onClick={handleSubmit} disabled={loading || hasInvalidReimbursementDate}>
              {loading ? <span className="material-symbols-outlined animate-spin">sync</span> : null} Submit <span className="hidden sm:inline-block ml-1">{claimType}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Date Validation Alert Modal */}
      <ConfirmModal
        isOpen={Boolean(dateBlockMessage)}
        onClose={closeDateBlockDialog}
        onConfirm={closeDateBlockDialog}
        title="Claim outside the filing window"
        confirmLabel="Review purchase date"
        variant="warning"
        showCancel={false}
      >
        <p>{dateBlockMessage}</p>
        <p className="mt-3">
          Reimbursement receipts must be dated within {REIMBURSEMENT_FILING_WINDOW_DAYS} days of the filing date. Update the purchase date before continuing.
        </p>
      </ConfirmModal>

      {/* MoM Preview Modal */}
      {showMomPreview && (
        <MomClientPreviewModal
          mom={previewMom}
          onClose={() => setShowMomPreview(false)}
          footer={
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={previewExporting !== null}
                  onClick={async () => {
                    setPreviewExporting('pdf');
                    try { await exportMomPdf(previewMom, 'client'); } finally { setPreviewExporting(null); }
                  }}
                >
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={previewExporting !== null}
                  onClick={() => { setPreviewExporting('word'); try { exportMomWord(previewMom, 'client'); } finally { setPreviewExporting(null); } }}
                >
                  <span className="material-symbols-outlined text-[16px]">description</span> Word
                </Button>
              </div>
              <p className="text-xs text-outline">Submit the claim to send this copy to the client.</p>
            </>
          }
        />
      )}
      {unsavedChangesDialog}
    </div>
  );
}
