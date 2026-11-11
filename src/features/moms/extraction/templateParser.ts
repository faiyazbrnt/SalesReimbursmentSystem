import { EXPENSE_CATEGORIES } from '../../../lib/expenseCategories';
import { serializeContacts } from '../domain/contacts';
import {
  CORE_EXTRACTION_FIELDS, EXPENSE_FIELDS, suggestionError,
  type DocumentSuggestions, type ExpenseKey, type ExpenseSuggestion, type ExtractionContext, type ExtractionField, type FieldSuggestion,
} from './model';

/** Official template contract. Field names are fixed; see docs/document-autofill.md. */
export const TEMPLATE_ID = 'srs-mom-loa';
export const TEMPLATE_MAX_CONTACTS = 5;
export const TEMPLATE_MAX_EXPENSES = 10;
const PAYMENT_METHODS = ['Personal Card', 'Cash', 'Bank Transfer'];
const EXPENSE_FORM_KEYS: Record<ExpenseKey, string> = {
  expenseDate: 'date', vendor: 'vendor', amount: 'amount', category: 'category', otherCategory: 'other_category',
  businessPurpose: 'business_purpose', paymentMethod: 'payment_method', orNumber: 'or_number', tinNumber: 'tin_number',
};
const TEMPLATE_KEYS = new Set(['document_type', 'client_company', 'purpose', 'meeting_date', 'location', 'category', 'category_other', 'template_id']);

export interface TemplateContext {
  companies: string[];
  /** Admin-configured MOM "category" dropdown, when active. */
  category?: { label: string; options: string[]; allowOther: boolean };
}

type Raw = Record<string, string>;

const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const pickOption = (value: string, options: string[]) => options.find(option => option.toLowerCase() === value.toLowerCase());

function coreField(key: string, value: string, evidence: string, ctx: TemplateContext): FieldSuggestion | null {
  const base = CORE_EXTRACTION_FIELDS.find(field => field.key === key);
  if (!base || !value) return null;
  const spec: ExtractionField = { ...base };
  let normalized = value;
  if (key === 'client') {
    spec.options = ctx.companies;
    normalized = pickOption(value, ctx.companies) ?? value;
  } else if (spec.options) {
    normalized = pickOption(value, spec.options) ?? value;
  }
  return { ...spec, value: normalized, evidence, warning: suggestionError(spec, normalized) };
}

function categoryFields(raw: Raw, ctx: TemplateContext): FieldSuggestion[] {
  if (!ctx.category) return [];
  const out: FieldSuggestion[] = [];
  const options = [...ctx.category.options, ...(ctx.category.allowOther ? ['Other'] : [])];
  const value = clean(raw.category);
  if (value) {
    const spec: ExtractionField = { key: 'custom:mom:category', label: ctx.category.label, inputType: 'dropdown', options };
    const normalized = pickOption(value, options) ?? value;
    out.push({ ...spec, value: normalized, evidence: `Category: ${value}`, warning: suggestionError(spec, normalized) });
  }
  const other = clean(raw.category_other);
  if (other && ctx.category.allowOther) {
    const spec: ExtractionField = { key: 'custom:mom:category_other', label: `${ctx.category.label} — specify other`, inputType: 'text' };
    out.push({ ...spec, value: other, evidence: `Category — Specify Other: ${other}` });
  }
  return out;
}

function expenseRow(raw: Raw, n: number): ExpenseSuggestion | null {
  const values: ExpenseSuggestion['values'] = {};
  const warnings: string[] = [];
  for (const [key] of EXPENSE_FIELDS) {
    const value = clean(raw[`expense_${n}_${EXPENSE_FORM_KEYS[key]}`]);
    if (value) values[key] = value;
  }
  if (!Object.keys(values).length) return null;
  if (values.category) {
    const known = pickOption(values.category, [...EXPENSE_CATEGORIES]);
    if (known) values.category = known;
    else { values.otherCategory ||= values.category; values.category = 'Others'; }
  }
  if (values.paymentMethod) {
    const known = pickOption(values.paymentMethod, PAYMENT_METHODS);
    if (known) values.paymentMethod = known;
    else { delete values.paymentMethod; warnings.push('Select the payment method manually.'); }
  }
  if (values.amount) {
    const amount = values.amount.replace(/[₱,\s]|PHP/gi, '');
    if (Number.isFinite(Number(amount)) && Number(amount) > 0) values.amount = amount;
    else { delete values.amount; warnings.push('Confirm the expense amount manually.'); }
  }
  if (values.expenseDate && suggestionError({ key: 'expenseDate', label: 'Date', inputType: 'date' }, values.expenseDate)) {
    delete values.expenseDate; warnings.push('Confirm the expense date manually (use YYYY-MM-DD).');
  }
  return { values, evidence: `Expense row ${n} of the template`, warnings };
}

/** Converts raw template values (form-field names or flattened labels) into reviewable suggestions. */
export function suggestionsFromTemplate(rawInput: Raw, context: ExtractionContext, ctx: TemplateContext, source: string): DocumentSuggestions {
  const raw: Raw = {};
  for (const [key, value] of Object.entries(rawInput)) raw[key] = clean(value);
  const fields: FieldSuggestion[] = [];
  const add = (field: FieldSuggestion | null) => { if (field) fields.push(field); };
  const type = raw.document_type === 'MoM' || raw.document_type === 'LOA' ? raw.document_type : pickOption(raw.document_type || '', ['MoM', 'LOA']) ?? raw.document_type;
  add(coreField('documentType', type, `Document Type: ${raw.document_type}`, ctx));
  add(coreField('client', raw.client_company, `Client Company: ${raw.client_company}`, ctx));
  add(coreField('purpose', raw.purpose, `Purpose: ${raw.purpose}`, ctx));
  add(coreField('meetingDate', raw.meeting_date, `Meeting Date: ${raw.meeting_date}`, ctx));
  add(coreField('location', raw.location, `Location: ${raw.location}`, ctx));

  const contacts = [];
  const emails: string[] = [];
  for (let n = 1; n <= TEMPLATE_MAX_CONTACTS; n++) {
    const name = raw[`contact_${n}_name`]; const designation = raw[`contact_${n}_designation`] || ''; const email = raw[`contact_${n}_email`];
    if (name) contacts.push({ name, designation });
    if (email) emails.push(email);
  }
  add(coreField('contacts', serializeContacts(contacts), `Contacts: ${contacts.map(c => c.name).join(', ')}`, ctx));
  add(coreField('clientEmails', emails.join(', '), `Emails: ${emails.join(', ')}`, ctx));
  fields.push(...categoryFields(raw, ctx));

  const expenses: ExpenseSuggestion[] = [];
  if (context === 'claim') {
    for (let n = 1; n <= TEMPLATE_MAX_EXPENSES; n++) {
      const row = expenseRow(raw, n);
      if (row) expenses.push(row);
    }
  }
  return { fields, expenses, warnings: fields.length || expenses.length ? [`Read from the ${source}. Review suggestions before applying them.`] : [] };
}

/** True when the raw values contain anything user-entered from the official template. */
export function hasTemplateData(raw: Raw): boolean {
  return Object.entries(raw).some(([key, value]) => {
    const v = clean(value);
    if (!v || key === 'template_id' || key === 'template_version') return false;
    if (key === 'document_type' && v.toLowerCase() === 'mom') return false;
    return TEMPLATE_KEYS.has(key) || /^(contact|expense)_\d+_/.test(key);
  });
}

const PDF_MAX_BYTES = 10 * 1024 * 1024;

/** Tier 1: reads fillable (AcroForm) values by their fixed field names (plus page widget annotations). */
export async function readTemplateFormFields(bytes: ArrayBuffer): Promise<Raw> {
  const { PDFDocument, PDFTextField, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFName, PDFDict, PDFString, PDFHexString, PDFArray } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const raw: Raw = {};
  for (const field of pdf.getForm().getFields()) {
    const name = field.getName();
    if (field instanceof PDFTextField) raw[name] = field.getText() ?? '';
    else if (field instanceof PDFDropdown || field instanceof PDFOptionList) raw[name] = field.getSelected()[0] ?? '';
    else if (field instanceof PDFRadioGroup) raw[name] = field.getSelected() ?? '';
  }
  const decodeVal = (v: unknown): string => {
    if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
    if (v instanceof PDFArray && v.size() > 0) return decodeVal(v.get(0));
    return '';
  };
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const dict = pdf.context.lookupMaybe(annots.get(i), PDFDict);
      if (!dict) continue;
      const name = decodeVal(dict.get(PDFName.of('T')));
      const val = decodeVal(dict.get(PDFName.of('V')));
      const dv = decodeVal(dict.get(PDFName.of('DV')));
      if (name && val && (!raw[name] || (raw[name] === dv && val !== dv))) raw[name] = val;
    }
  }
  return raw;
}

/** Label → form key. Labels are printed on the official template. Longer labels first. */
export const TEXT_LABELS: Array<[string, string]> = [
  ['Category — Specify Other', 'category_other'], ['Category - Specify Other', 'category_other'],
  ['Purpose of Meeting / Agreement', 'purpose'], ['Document Type', 'document_type'],
  ['Client Company', 'client_company'], ['Meeting Date', 'meeting_date'], ['Location', 'location'], ['Category', 'category'],
];

/** Tier 2: reads `Label: value` lines from a flattened copy of the template. */
export function parseLabelledText(text: string): Raw {
  const raw: Raw = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    for (const [label, key] of TEXT_LABELS) {
      if (raw[key] !== undefined) continue;
      if (trimmed.toLowerCase().startsWith(`${label.toLowerCase()}:`)) {
        const value = trimmed.slice(label.length + 1).trim();
        raw[key] = key === 'meeting_date' ? value.replace(/\bYYYY-MM-DD\b/gi, '').trim() : value;
        break;
      }
    }
  }
  return raw;
}

export async function readPdfText(bytes: ArrayBuffer): Promise<string> {
  const g = globalThis as Record<string, unknown>;
  // @ts-expect-error pdfjs-dist does not ship .d.ts for pdf.worker.mjs
  g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), verbosity: 0 }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 5); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      const row = rows.find(r => Math.abs(r.y - y) < 3);
      if (row) row.items.push({ x, text: item.str });
      else rows.push({ y, items: [{ x, text: item.str }] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) lines.push(row.items.sort((a, b) => a.x - b.x).map(i => i.text).join(' '));
  }
  return lines.join('\n');
}

/** Runs tier 1 then tier 2 locally in the browser. Returns null if the PDF holds no template data. */
export async function extractFromTemplatePdf(file: File, context: ExtractionContext, ctx: TemplateContext): Promise<DocumentSuggestions | null> {
  if (file.size === 0 || file.size > PDF_MAX_BYTES) throw new Error('Upload a non-empty file of up to 10MB.');
  const bytes = await file.arrayBuffer();
  if (!new TextDecoder().decode(new Uint8Array(bytes.slice(0, 1024))).includes('%PDF-')) throw new Error('This is not a valid PDF document.');
  try {
    const form = await readTemplateFormFields(bytes);
    if (hasTemplateData(form)) return suggestionsFromTemplate(form, context, ctx, 'official template form fields');
  } catch { /* not a fillable PDF; fall through to labelled text */ }
  try {
    const labelled = parseLabelledText(await readPdfText(bytes));
    if (hasTemplateData(labelled)) return suggestionsFromTemplate(labelled, context, ctx, 'official template text');
  } catch { /* unreadable text layer */ }
  return null;
}

