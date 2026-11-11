import type { DraftLineItem } from '../../claims/services/api';
import { parseContacts, serializeContacts, type MomContact } from '../domain/contacts';

export type ExtractionContext = 'claim' | 'mom';
export interface ExtractionField {
  key: string;
  label: string;
  inputType: 'text' | 'number' | 'date' | 'textarea' | 'dropdown';
  options?: string[];
}
export interface FieldSuggestion extends ExtractionField {
  value: string;
  evidence: string;
  warning?: string;
}
export const EXPENSE_FIELDS = [
  ['expenseDate', 'Expense date'], ['vendor', 'Vendor / supplier'],
  ['amount', 'Amount (PHP)'], ['category', 'Category'], ['otherCategory', 'Specify expense'],
  ['businessPurpose', 'Business purpose'], ['paymentMethod', 'Payment method'],
  ['orNumber', 'OR number'], ['tinNumber', 'TIN number'],
] as const;
export type ExpenseKey = typeof EXPENSE_FIELDS[number][0];
export interface ExpenseSuggestion {
  values: Partial<Record<ExpenseKey, string>>;
  evidence: string;
  warnings: string[];
}
export interface DocumentSuggestions {
  fields: FieldSuggestion[];
  expenses: ExpenseSuggestion[];
  warnings: string[];
}
export interface AppliedSuggestions {
  values: Record<string, string>;
  expenses: DraftLineItem[];
}
export const CORE_EXTRACTION_FIELDS: ExtractionField[] = [
  { key: 'documentType', label: 'Document type', inputType: 'dropdown', options: ['MoM', 'LOA'] },
  { key: 'client', label: 'Client / company', inputType: 'dropdown' },
  { key: 'purpose', label: 'Purpose of meeting / agreement', inputType: 'text' },
  { key: 'meetingDate', label: 'Meeting date', inputType: 'date' },
  { key: 'location', label: 'Location', inputType: 'text' },
  { key: 'contacts', label: 'Client contacts (Name (Designation), …)', inputType: 'text' },
  { key: 'clientEmails', label: 'Client emails (comma separated)', inputType: 'text' },
];

export function reviewValues(
  core: { client: string; purpose: string; meetingDate: string; location: string },
  documentType: string, contacts: MomContact[], emails: string[],
  momFields: Record<string, unknown>, claimFields: Record<string, unknown> = {},
): Record<string, string> {
  return { client: core.client, purpose: core.purpose, meetingDate: core.meetingDate, location: core.location,
    documentType, contacts: serializeContacts(contacts), clientEmails: emails.join(', '),
    ...Object.fromEntries(Object.entries(momFields).map(([k, v]) => [`custom:mom:${k}`, String(v ?? '')])),
    ...Object.fromEntries(Object.entries(claimFields).map(([k, v]) => [`custom:claim:${k}`, String(v ?? '')])),
  };
}

export function splitAppliedValues(values: Record<string, string>) {
  const core: Partial<{ client: string; purpose: string; meetingDate: string; location: string }> = {};
  const momFields: Record<string, string> = {};
  const claimFields: Record<string, string> = {};
  for (const key of ['client', 'purpose', 'meetingDate', 'location'] as const) {
    if (values[key] !== undefined) core[key] = values[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('custom:mom:')) momFields[key.slice(11)] = value;
    if (key.startsWith('custom:claim:')) claimFields[key.slice(13)] = value;
  }
  return {
    core, momFields, claimFields,
    documentType: values.documentType === 'MoM' || values.documentType === 'LOA' ? values.documentType as 'MoM' | 'LOA' : undefined,
    contacts: values.contacts !== undefined ? parseContacts(values.contacts) : undefined,
    emails: values.clientEmails !== undefined ? values.clientEmails.split(/[,;\n]/).map(v => v.trim()).filter(Boolean) : undefined,
  };
}

export function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

export function suggestionError(field: ExtractionField, value: string): string | undefined {
  if (!value.trim()) return 'Enter a value or clear this selection.';
  if (field.options && !field.options.includes(value)) return 'Choose a recognized option.';
  if (field.inputType === 'date' && !validIsoDate(value)) return 'Enter a valid, unambiguous date.';
  if (field.inputType === 'number' && !Number.isFinite(Number(value))) return 'Enter a valid number.';
  if (field.key === 'clientEmails' && value.split(/[,;\n]/).some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) return 'Check the email addresses.';
  return undefined;
}

export function expenseToDraft(values: ExpenseSuggestion['values']): DraftLineItem {
  return { ...values, amount: values.amount ? Number(values.amount) : 0 };
}

export function appendExtractedExpenses(existing: DraftLineItem[], suggestions: DraftLineItem[]): DraftLineItem[] {
  const fingerprint = (item: DraftLineItem) => JSON.stringify(EXPENSE_FIELDS.map(([key]) => String(item[key] ?? '').trim()));
  const fingerprints = new Set(existing.map(fingerprint));
  const additions = suggestions.filter(item => {
    const key = fingerprint(item);
    if (fingerprints.has(key)) return false;
    fingerprints.add(key);
    return true;
  });
  const placeholder = existing.length === 1 && !existing[0].amount && !existing[0].vendor && !existing[0].expenseDate
    && !existing[0].businessPurpose && !existing[0].tinNumber && !existing[0].orNumber && !existing[0].otherCategory
    && !existing[0].receiptFile && !existing[0].receiptFiles?.length && !existing[0].receiptUrl && !existing[0].receiptUrls?.length
    && (!existing[0].category || existing[0].category === 'Meals') && (!existing[0].paymentMethod || existing[0].paymentMethod === 'Personal Card');
  return [...(additions.length && placeholder ? [] : existing), ...additions];
}
