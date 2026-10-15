import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from './Modal';

interface UnsavedChangesPromptOptions {
  isDirty: boolean;
  onSaveDraft: () => Promise<boolean>;
  formName: string;
}

/** In-app navigation uses this dialog; tab close/refresh uses the browser prompt. */
export function useUnsavedChangesPrompt({ isDirty, onSaveDraft, formName }: UnsavedChangesPromptOptions) {
  const allowNavigation = useRef(false);
  const savingRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [saveError, setSaveError] = useState('');
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty && !allowNavigation.current && (
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search
    ),
  );
  const leaveWithoutPrompt = useCallback((leave: () => void) => {
    allowNavigation.current = true;
    leave();
  }, []);
  const requestLeave = useCallback((leave: () => void) => {
    if (!isDirty) { leave(); return; }
    setPendingLeave(() => leave);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigation.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const closeDialog = () => {
    if (savingRef.current) return;
    setPendingLeave(null);
    setSaveError('');
    if (blocker.state === 'blocked') blocker.reset();
  };
  const discardAndLeave = () => {
    const leave = pendingLeave;
    setPendingLeave(null);
    if (blocker.state === 'blocked') {
      allowNavigation.current = true;
      blocker.proceed();
    } else if (leave) {
      leaveWithoutPrompt(leave);
    }
  };
  const saveDraftAndLeave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingDraft(true);
    setSaveError('');
    try {
      if (await onSaveDraft()) discardAndLeave();
      else setSaveError('Draft could not be saved. Please try again or go back to continue editing.');
    } catch {
      setSaveError('Draft could not be saved. Please try again or go back to continue editing.');
    } finally {
      savingRef.current = false;
      setSavingDraft(false);
    }
  };

  return {
    requestLeave,
    leaveWithoutPrompt,
    unsavedChangesDialog: (
      <Modal isOpen={Boolean(pendingLeave) || blocker.state === 'blocked'} onClose={closeDialog}
        closeOnBackdrop={false} closeOnEscape={!savingDraft} titleId={titleId} descriptionId={descriptionId}>
        <Card className="shadow-lg">
          <div className="p-6">
            <h2 id={titleId} className="font-headline-md text-on-surface mb-3">Leave {formName}?</h2>
            <p id={descriptionId} className="text-body-md text-on-surface-variant">
              You have unsaved changes. Leave without saving, save a draft, or go back to continue editing.
            </p>
            {saveError && <p role="alert" className="mt-3 text-sm text-error">{saveError}</p>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={discardAndLeave} disabled={savingDraft}>Yes</Button>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={closeDialog} disabled={savingDraft}>Back</Button>
                <Button type="button" onClick={saveDraftAndLeave} disabled={savingDraft}>
                  {savingDraft ? 'Saving Draft...' : 'Save as Draft'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </Modal>
    ),
  };
}
