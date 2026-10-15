import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../../../components/AppContext';
import { useToast } from '../../../components/shared/ToastContext';
import { useUnsavedChangesPrompt } from '../../../components/shared/UnsavedChangesPrompt';
import { ClaimStatus, ClaimType, MOM, MomDocumentType, DOCUMENT_TYPE_LABEL, FieldDefinition, FieldDefinitionEntity } from '../../../types';
import { MomContact, serializeContacts, joinDesignations } from '@/features/moms';
import { submitClaimFlow, submitCashAdvanceFlow, submitLiquidationFlow, DraftLineItem } from '../../../lib/api';
import { isClaimTypeEnabled } from '../../../lib/featureFlags';
import { validateDynamicFields } from '../../../shared/validation/dynamicFieldValidation';
import {
  getReimbursementDateError,
  getTodayIsoDate,
  REIMBURSEMENT_FILING_WINDOW_DAYS,
  shiftIsoDate,
  validateReimbursementPurchaseDate,
} from '../domain/reimbursementPolicy';

export const TYPE_PARAM_MAP: Record<string, ClaimType> = {
  reimbursement: 'Reimbursement',
  transport: 'Transport Reimbursement',
  advance: 'Cash Advance',
  liquidation: 'Liquidation',
};

export const REIMBURSEMENT_CAP = 1000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function claimFormSnapshot(values: Record<string, unknown>) {
  return JSON.stringify(values);
}

export function useClaimWizard() {
  const navigate = useNavigate();
  const { currentUser, fieldDefinitions, users, claims, companies, masterData, paymentMethods, refresh } = useAppContext();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const rawTypeFromQuery = TYPE_PARAM_MAP[searchParams.get('type') ?? ''];
  const typeFromQuery = rawTypeFromQuery && isClaimTypeEnabled(rawTypeFromQuery) ? rawTypeFromQuery : undefined;
  const reimbursementIntent = searchParams.get('intent') === 'reimbursement';

  const [claimType, setClaimType] = useState<ClaimType>(typeFromQuery ?? 'Reimbursement');
  const [step, setStep] = useState(typeFromQuery ? (typeFromQuery === 'Reimbursement' ? 2 : 1) : 0);
  const [loading, setLoading] = useState(false);
  const [comingSoonType, setComingSoonType] = useState<ClaimType | null>(null);

  useEffect(() => {
    if (rawTypeFromQuery && !isClaimTypeEnabled(rawTypeFromQuery)) {
      setComingSoonType(rawTypeFromQuery);
    }
  }, [rawTypeFromQuery]);

  const [lineItemsLocal, setLineItemsLocal] = useState<DraftLineItem[]>([
    { expenseDate: '', amount: 0, paymentMethod: 'Personal Card', vendor: '', category: 'Meals' }
  ]);
  const [dateValidationAttempted, setDateValidationAttempted] = useState(false);
  const [dateBlockMessage, setDateBlockMessage] = useState('');
  const invalidDateInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const clientEmailInputRef = useRef<HTMLInputElement>(null);

  const [momCore, setMomCore] = useState({
    client: '', purpose: '', meetingDate: '', location: '', contactPersonEmail: '',
    discussion: '', actionItems: '', ccClient: false,
  });

  const [contacts, setContacts] = useState<MomContact[]>([{ name: '', designation: '' }]);
  const [clientEmails, setClientEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState('');
  const [showMomPreview, setShowMomPreview] = useState(false);
  const [previewExporting, setPreviewExporting] = useState<'pdf' | 'word' | null>(null);

  const [cashAdvanceId, setCashAdvanceId] = useState<string>('');
  const [cashAdvanceAmount, setCashAdvanceAmount] = useState<number>(0);
  const [cashAdvancePurpose, setCashAdvancePurpose] = useState('');
  const [refundMethod, setRefundMethod] = useState('');
  const [documentType, setDocumentType] = useState<MomDocumentType>('MoM');
  const [momData, setMomData] = useState<Record<string, any>>({});
  const [momErrors, setMomErrors] = useState<Record<string, string>>({});
  const [claimCustomFields, setClaimCustomFields] = useState<Record<string, string>>({});
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({});
  const [autofilling, setAutofilling] = useState(false);
  const currentFormSnapshot = claimFormSnapshot({
    claimType,
    lineItems: lineItemsLocal.map(item => ({ ...item, receiptFile: item.receiptFile?.name })),
    momCore,
    contacts,
    clientEmails,
    emailDraft,
    cashAdvanceId,
    cashAdvanceAmount,
    cashAdvancePurpose,
    refundMethod,
    documentType,
    momData,
    claimCustomFields,
  });
  const [initialFormSnapshot] = useState(currentFormSnapshot);
  const hasUnsavedChanges = currentFormSnapshot !== initialFormSnapshot;

  const steps = [
    { num: 2, title: DOCUMENT_TYPE_LABEL[documentType] },
    { num: 1, title: 'Details & Items' },
    { num: 4, title: 'Review & Submit' }
  ];

  const stepFlow = claimType === 'Reimbursement' ? [2, 1, 4] : [1, 4];
  const flowPosition = stepFlow.indexOf(step);
  const isReimbursement = claimType === 'Reimbursement' || claimType === 'Transport Reimbursement';
  const filingDate = getTodayIsoDate();
  const earliestEligiblePurchaseDate = shiftIsoDate(filingDate, -REIMBURSEMENT_FILING_WINDOW_DAYS);
  const invalidReimbursementDateIndex = isReimbursement
    ? lineItemsLocal.findIndex(item => !validateReimbursementPurchaseDate(item.expenseDate, filingDate).valid)
    : -1;
  const hasInvalidReimbursementDate = invalidReimbursementDateIndex !== -1;

  const showReimbursementDateError = () => {
    if (!hasInvalidReimbursementDate) return false;
    setDateValidationAttempted(true);
    const message = getReimbursementDateError(
      lineItemsLocal[invalidReimbursementDateIndex]?.expenseDate,
      filingDate,
    );
    setDateBlockMessage(`Expense row ${invalidReimbursementDateIndex + 1}: ${message}`);
    return true;
  };

  const closeDateBlockDialog = () => {
    setDateBlockMessage('');
    window.setTimeout(() => invalidDateInputRefs.current[invalidReimbursementDateIndex]?.focus(), 0);
  };

  const addClientEmail = (raw: string) => {
    const email = raw.trim().replace(/,$/, '');
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setEmailError(`"${email}" doesn't look like a valid email address.`);
      return;
    }
    if (clientEmails.some(e => e.toLowerCase() === email.toLowerCase())) {
      setEmailError(`${email} is already in the list.`);
      setEmailDraft('');
      return;
    }
    setClientEmails(current => [...current, email]);
    setEmailDraft('');
    setEmailError('');
  };

  const removeClientEmail = (email: string) =>
    setClientEmails(current => current.filter(e => e !== email));

  const joinedClientEmails = () => {
    const pending = emailDraft.trim().replace(/,$/, '');
    const all = pending && EMAIL_RE.test(pending) && !clientEmails.includes(pending)
      ? [...clientEmails, pending]
      : clientEmails;
    return all.join(', ');
  };

  const applyCompanyDefaults = (companyName: string) => {
    const company = companies.find(c => c.name === companyName);
    if (!company) return;
    setMomCore(p => ({
      ...p,
      client: companyName,
      location: p.location || company.address || '',
    }));
    if (company.contactPerson) {
      setContacts(current => {
        const [first, ...rest] = current.length ? current : [{ name: '', designation: '' }];
        if (first.name.trim()) return current;
        return [{ ...first, name: company.contactPerson || '' }, ...rest];
      });
    }
  };

  const handleFileUploadForLineItem = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLineItemsLocal(prev => prev.map((li, i) =>
      i === index ? { ...li, receiptFile: file, receiptUrl: URL.createObjectURL(file) } : li
    ));
  };

  const liquidatedCaIds = new Set(
    claims.filter(c => c.type === 'Liquidation' && c.cashAdvanceId).map(c => c.cashAdvanceId)
  );
  const myCashAdvances = claims.filter(c =>
    c.requestorId === currentUser.id &&
    c.type === 'Cash Advance' &&
    c.status === ClaimStatus.RELEASED &&
    !liquidatedCaIds.has(c.id)
  );
  const liquidationBlocked = claimType === 'Liquidation' && myCashAdvances.length === 0;

  const totalAmount = claimType === 'Cash Advance'
    ? Number(cashAdvanceAmount) || 0
    : lineItemsLocal.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const reimbursableAmount = claimType === 'Reimbursement' || claimType === 'Transport Reimbursement'
    ? Math.min(totalAmount, REIMBURSEMENT_CAP)
    : totalAmount;

  let varianceAmount = 0;
  let varianceType: 'Settled' | 'RefundDue' | 'ReimbursementDue' = 'Settled';
  if (claimType === 'Liquidation' && cashAdvanceId) {
    const parentCa = claims.find(c => c.id === cashAdvanceId);
    if (parentCa) {
      varianceAmount = totalAmount - parentCa.total;
      if (varianceAmount > 0) varianceType = 'ReimbursementDue';
      else if (varianceAmount < 0) varianceType = 'RefundDue';
    }
  }

  const handleNext = () => {
    if (step === 2 && momCore.ccClient && joinedClientEmails().trim() === '') {
      addToast('Add at least one client email to send claim status notifications.', 'error');
      window.setTimeout(() => clientEmailInputRef.current?.focus(), 0);
      return;
    }
    if (step === 1 && (claimType === 'Reimbursement' || claimType === 'Transport Reimbursement') && lineItemsLocal.length === 0) {
      addToast('Please add at least one line item', 'error');
      return;
    }
    if (step === 1 && isReimbursement && showReimbursementDateError()) {
      return;
    }
    if (step === 1 && claimType === 'Cash Advance') {
      if (!cashAdvanceAmount || cashAdvanceAmount <= 0) {
        addToast("Please enter the amount you're requesting", 'error');
        return;
      }
      if (!cashAdvancePurpose.trim()) {
        addToast('Please enter a purpose for this Cash Advance', 'error');
        return;
      }
    }
    if (step === 1 && claimType === 'Liquidation') {
      if (!cashAdvanceId) {
        addToast('Please select the Cash Advance to liquidate', 'error');
        return;
      }
      if (lineItemsLocal.length === 0) {
        addToast('Please add at least one expense line item', 'error');
        return;
      }
      if (varianceType === 'RefundDue' && !refundMethod) {
        addToast("Choose how you'll return the refund before continuing.", 'error');
        return;
      }
    }
    if (step === 1 && (claimType === 'Reimbursement' || claimType === 'Transport Reimbursement')) {
      const activeClaimFields = fieldDefinitions.filter(fd =>
        fd.entity === 'claim' && fd.active &&
        (!fd.applicableClaimTypes || fd.applicableClaimTypes.length === 0 || fd.applicableClaimTypes.includes(claimType))
      );
      const { errors: claimFieldErrors, firstError } = validateDynamicFields(activeClaimFields, claimCustomFields);
      if (firstError) {
        setClaimErrors(claimFieldErrors);
        addToast(firstError.message, 'error');
        return;
      }
      setClaimErrors({});
    }
    if (step === 2) {
      if (!momCore.client.trim() || !momCore.purpose.trim() || !momCore.meetingDate) {
        addToast('Client, purpose, and date of meeting are required.', 'error');
        return;
      }
      const activeMomFields = fieldDefinitions.filter(fd => fd.entity === 'mom' && fd.active);
      const { errors: fieldErrors, firstError } = validateDynamicFields(activeMomFields, momData);
      if (firstError) {
        setMomErrors(fieldErrors);
        addToast(firstError.message, 'error');
        return;
      }
      setMomErrors({});
    }
    const nextIndex = flowPosition + 1;
    if (nextIndex < stepFlow.length) setStep(stepFlow[nextIndex]);
  };

  const handleBack = () => {
    const prevIndex = flowPosition - 1;
    setStep(prevIndex >= 0 ? stepFlow[prevIndex] : 0);
  };

  const send = async (isDraft: boolean, leaveAfterSave = true): Promise<boolean> => {
    if (!isDraft && isReimbursement && showReimbursementDateError()) return false;
    if (!isDraft && claimType === 'Reimbursement' && momCore.ccClient && joinedClientEmails().trim() === '') {
      addToast('Add at least one client email to send claim status notifications.', 'error');
      setStep(2);
      window.setTimeout(() => clientEmailInputRef.current?.focus(), 0);
      return false;
    }
    setLoading(true);
    try {
      if (claimType === 'Cash Advance') {
        await submitCashAdvanceFlow({
          amount: Number(cashAdvanceAmount) || 0,
          purpose: cashAdvancePurpose || 'Draft Cash Advance',
          isDraft,
        });
      } else if (claimType === 'Liquidation') {
        if (!isDraft && !cashAdvanceId) {
          addToast('Please select the Cash Advance to liquidate.', 'error');
          setLoading(false);
          return false;
        }
        await submitLiquidationFlow({
          cashAdvanceId: cashAdvanceId || (myCashAdvances[0]?.id || ''),
          lineItems: lineItemsLocal,
          refundMethod: varianceType === 'RefundDue' ? refundMethod : undefined,
          isDraft,
        });
      } else {
        const hasMomData = Object.values(momCore).some(Boolean) || contacts.some(contact => contact.name.trim() || contact.designation.trim()) || Boolean(joinedClientEmails());
        await submitClaimFlow({
          claimType,
          lineItems: lineItemsLocal,
          mom: (claimType === 'Reimbursement' && (!isDraft || hasMomData)) ? {
            ...momCore,
            contactPerson: serializeContacts(contacts),
            contactPersonEmail: joinedClientEmails(),
            documentType,
          } : undefined,
          customFields: claimType === 'Reimbursement'
            ? { ...momData, contact_person_designation: joinDesignations(contacts), ...claimCustomFields }
            : { ...momData, ...claimCustomFields },
          remarks: claimType === 'Transport Reimbursement' ? 'Transport reimbursement' : (momCore.purpose || (isDraft ? 'Draft reimbursement' : '')),
          isDraft,
        });
      }
      addToast(isDraft ? 'Draft saved successfully.' : 'Claim submitted successfully.', 'success');
      if (leaveAfterSave) leaveWithoutPrompt(() => navigate('/claims'));
      refresh().catch((err) => console.warn('[wizard] Background refresh failed:', err));
      return true;
    } catch (err: any) {
      addToast(err?.message || (isDraft ? 'Could not save draft.' : 'Could not submit claim.'), 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const today = () => getTodayIsoDate();

  const sampleFieldValue = (fd: FieldDefinition): string => {
    if (fd.default_value) return fd.default_value;
    if (fd.input_type === 'dropdown') {
      const options = fd.master_data_entity
        ? masterData.filter(m => m.type === fd.master_data_entity && m.active).map(m => m.name)
        : fd.options || [];
      if (options.length > 0) return options[0];
      if (fd.allow_other) return 'Other';
      return '';
    }
    if (fd.input_type === 'number') return '100';
    if (fd.input_type === 'date') return today();
    return `${fd.label} (demo)`;
  };

  const fillCustomFields = (entity: FieldDefinitionEntity): Record<string, string> => {
    const out: Record<string, string> = {};
    fieldDefinitions
      .filter(fd => fd.entity === entity && fd.active)
      .filter(fd => entity !== 'claim' || !fd.applicableClaimTypes || fd.applicableClaimTypes.length === 0 || fd.applicableClaimTypes.includes(claimType))
      .forEach(fd => {
        if (fd.required || fd.default_value) {
          const v = sampleFieldValue(fd);
          if (v) {
            out[fd.key] = v;
            if (v === 'Other' && fd.allow_other) {
              out[`${fd.key}_other`] = 'General Discussion';
            }
          }
        }
      });
    return out;
  };

  const makeReceiptBlob = (): Promise<Blob> => new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 520;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('no canvas context')); return; }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('DEMO RECEIPT', 28, 56);
    ctx.fillStyle = '#475569';
    ctx.font = '14px sans-serif';
    ctx.fillText('Sample receipt — autofilled for demo', 28, 86);
    ctx.fillText(`Date: ${today()}`, 28, 130);
    ctx.fillText('Vendor: Cafe Manila', 28, 156);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('TOTAL: PHP 850.00', 28, 200);
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });

  const handleAutofillTestData = async () => {
    setAutofilling(true);
    try {
      const blob = await makeReceiptBlob();
      const mockReceipt = (name: string) => new File([blob], name, { type: 'image/png' });

      if (claimType === 'Cash Advance') {
        setCashAdvanceAmount(5000);
        setCashAdvancePurpose('Client site visit — transportation and meals advance');
      } else if (claimType === 'Liquidation') {
        if (!cashAdvanceId && myCashAdvances.length > 0) setCashAdvanceId(myCashAdvances[0].id);
        setLineItemsLocal([
          { expenseDate: today(), amount: 1200, paymentMethod: 'Personal Card', vendor: 'Grand Hotel', category: 'Transportation', businessPurpose: 'Accommodation during client visit', receiptFile: mockReceipt('receipt_1.png'), receiptUrl: URL.createObjectURL(mockReceipt('receipt_1.png')) },
        ]);
        setClaimCustomFields(fillCustomFields('claim'));
      } else if (claimType === 'Transport Reimbursement') {
        setLineItemsLocal([
          { expenseDate: today(), amount: 850, paymentMethod: 'Personal Card', vendor: 'Grab', category: 'Transportation', businessPurpose: 'Business transport', orNumber: 'OR-DEMO-001', receiptFile: mockReceipt('transport_receipt.png'), receiptUrl: URL.createObjectURL(mockReceipt('transport_receipt.png')) },
        ]);
        setClaimCustomFields(fillCustomFields('claim'));
      } else {
        setLineItemsLocal([
          { expenseDate: today(), amount: 850, paymentMethod: 'Personal Card', vendor: 'Cafe Manila', category: 'Meals', businessPurpose: 'Client lunch meeting', receiptFile: mockReceipt('receipt_1.png'), receiptUrl: URL.createObjectURL(mockReceipt('receipt_1.png')) },
        ]);
        setClaimCustomFields(fillCustomFields('claim'));
        if (companies.length > 0) {
          applyCompanyDefaults(companies[0].name);
        } else {
          setMomCore(p => ({ ...p, client: p.client || 'Acme Corporation' }));
        }
        setMomCore(p => ({
          ...p,
          purpose: p.purpose || 'Quarterly account review',
          location: p.location || 'Makati City, Philippines',
          discussion: p.discussion || 'Reviewed pipeline, agreed next steps and follow-up schedule.',
          actionItems: p.actionItems || 'Send the revised proposal and confirm the next meeting date.',
          meetingDate: p.meetingDate || today(),
        }));
        setContacts(prev => (prev.length && prev[0].name.trim()) ? prev : [{ name: 'Jane Dela Cruz', designation: '' }]);
        setClientEmails(prev => prev.length ? prev : ['jane@client.com']);
        setMomData(p => ({ ...p, ...fillCustomFields('mom') }));
      }
      addToast('Form filled with demo data.', 'success');
    } catch {
      addToast('Could not generate the demo receipt for autofill.', 'error');
    } finally {
      setAutofilling(false);
    }
  };

  const approver = users.find(u => u.id === currentUser.reportsTo);

  const previewMom: MOM = {
    id: 'preview',
    claimId: '',
    documentType,
    companyName: momCore.client,
    purposeOfMeeting: momCore.purpose,
    meetingDate: momCore.meetingDate,
    location: momCore.location,
    contactPerson: serializeContacts(contacts),
    contactPersonEmail: joinedClientEmails(),
    description: momCore.discussion,
    actionItems: momCore.actionItems,
    preparedBy: currentUser.name,
    typeOfAccount: momData['type_of_account'],
    category: momData['category'] === 'Other' && momData['category_other']
      ? `Other (${momData['category_other']})`
      : (momData['category'] || undefined),
    customFields: momData,
  };

  const { requestLeave, leaveWithoutPrompt, unsavedChangesDialog } = useUnsavedChangesPrompt({
    isDirty: hasUnsavedChanges,
    onSaveDraft: () => send(true, false),
    formName: `this ${claimType.toLowerCase()}`,
  });

  return {
    claimType, setClaimType,
    step, setStep,
    steps, stepFlow, flowPosition,
    reimbursementIntent,
    loading,
    comingSoonType, setComingSoonType,
    lineItemsLocal, setLineItemsLocal,
    dateValidationAttempted,
    dateBlockMessage,
    invalidDateInputRefs,
    clientEmailInputRef,
    closeDateBlockDialog,
    momCore, setMomCore,
    contacts, setContacts,
    clientEmails,
    emailDraft, setEmailDraft,
    emailError,
    addClientEmail, removeClientEmail,
    showMomPreview, setShowMomPreview,
    previewExporting, setPreviewExporting,
    previewMom,
    cashAdvanceId, setCashAdvanceId,
    cashAdvanceAmount, setCashAdvanceAmount,
    cashAdvancePurpose, setCashAdvancePurpose,
    refundMethod, setRefundMethod,
    documentType, setDocumentType,
    momData, setMomData,
    momErrors, setMomErrors,
    claimCustomFields, setClaimCustomFields,
    claimErrors, setClaimErrors,
    autofilling,
    totalAmount,
    reimbursableAmount,
    varianceAmount,
    varianceType,
    earliestEligiblePurchaseDate,
    filingDate,
    isReimbursement,
    hasInvalidReimbursementDate,
    liquidationBlocked,
    myCashAdvances,
    approver,
    handleNext,
    handleBack,
    handleSaveDraft: () => send(true),
    handleSubmit: () => send(false),
    handleAutofillTestData,
    handleFileUploadForLineItem,
    applyCompanyDefaults,
    navigate,
    requestLeave,
    unsavedChangesDialog,
    companies,
    claims,
    setEmailError,
    paymentMethods,
  };
}
