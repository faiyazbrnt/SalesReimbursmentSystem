import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { extractFromTemplatePdf, hasTemplateData, parseLabelledText, readTemplateFormFields, suggestionsFromTemplate } from './templateParser';

const ctx = { companies: ['Acme Corp', 'Globex'], category: { label: 'Category', options: ['Sales Call', 'Business Review'], allowOther: true } };
const byKey = (result: ReturnType<typeof suggestionsFromTemplate>, key: string) => result.fields.find(field => field.key === key);

describe('official template parser', () => {
  it('maps form values to core, contact, category, and expense suggestions', () => {
    const result = suggestionsFromTemplate({
      document_type: 'loa', client_company: 'acme corp', purpose: 'Renewal', meeting_date: '2026-10-27', location: 'Makati',
      category: 'sales call', contact_1_name: 'Ana Cruz', contact_1_designation: 'Buyer', contact_1_email: 'ana@acme.com', contact_2_name: 'Ben Lim',
      expense_1_date: '2026-10-27', expense_1_vendor: 'Cafe', expense_1_amount: '1,250.50', expense_1_category: 'parking', expense_1_payment_method: 'cash',
      expense_1_tin_number: '123-456-789-000', expense_2_vendor: '',
    }, 'claim', ctx, 'test');
    expect(byKey(result, 'documentType')?.value).toBe('LOA');
    expect(byKey(result, 'client')).toMatchObject({ value: 'Acme Corp', warning: undefined });
    expect(byKey(result, 'contacts')?.value).toBe('Ana Cruz (Buyer), Ben Lim');
    expect(byKey(result, 'clientEmails')?.value).toBe('ana@acme.com');
    expect(byKey(result, 'custom:mom:category')?.value).toBe('Sales Call');
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].values).toMatchObject({ amount: '1250.50', category: 'Others', otherCategory: 'parking', paymentMethod: 'Cash', tinNumber: '123-456-789-000' });
  });

  it('flags unknown companies and bad dates instead of guessing, and omits expenses for MOM context', () => {
    const result = suggestionsFromTemplate({ client_company: 'Unknown Co', meeting_date: '10/27/2026', expense_1_amount: '5' }, 'mom', ctx, 'test');
    expect(byKey(result, 'client')?.warning).toBeTruthy();
    expect(byKey(result, 'meetingDate')?.warning).toBeTruthy();
    expect(result.expenses).toEqual([]);
  });

  it('drops invalid amounts and unknown payment methods with warnings', () => {
    const [expense] = suggestionsFromTemplate({ expense_1_amount: 'abc', expense_1_payment_method: 'Crypto', expense_1_vendor: 'V' }, 'claim', ctx, 't').expenses;
    expect(expense.values.amount).toBeUndefined();
    expect(expense.values.paymentMethod).toBeUndefined();
    expect(expense.warnings).toHaveLength(2);
  });

  it('reads fixed field names from a fillable PDF and ignores unrelated PDFs', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const form = pdf.getForm();
    form.createTextField('client_company').setText('Globex');
    form.createTextField('purpose').setText('Quarterly review');
    form.createDropdown('document_type').addOptions(['MoM', 'LOA']);
    form.getDropdown('document_type').select('LOA');
    form.getTextField('purpose').addToPage(page, { x: 10, y: 10 });
    form.getTextField('client_company').addToPage(page, { x: 10, y: 40 });
    const raw = await readTemplateFormFields((await pdf.save()).buffer as ArrayBuffer);
    expect(raw).toMatchObject({ client_company: 'Globex', purpose: 'Quarterly review', document_type: 'LOA' });
    expect(hasTemplateData(raw)).toBe(true);
    const blank = await PDFDocument.create();
    expect(hasTemplateData(await readTemplateFormFields((await blank.save()).buffer as ArrayBuffer))).toBe(false);
  });

  it('reads Label: value lines from a flattened copy', () => {
    const raw = parseLabelledText('Document Type: MoM\nClient Company: Globex\nPurpose of Meeting / Agreement: Review\nMeeting Date: 2026-10-27 YYYY-MM-DD\nCategory — Specify Other: Mixed\nCategory: Other\nNotes: x');
    expect(raw).toMatchObject({ document_type: 'MoM', client_company: 'Globex', purpose: 'Review', meeting_date: '2026-10-27', category_other: 'Mixed', category: 'Other' });
    expect(hasTemplateData(parseLabelledText('random scanned text'))).toBe(false);
  });

  it('verifies public/official-mom-loa-template.pdf end-to-end (blank, filled AcroForm, and flattened text)', async () => {
    const templateBytes = readFileSync(new URL('../../../../public/official-mom-loa-template.pdf', import.meta.url));
    const blankFile = new File([templateBytes], 'official-mom-loa-template.pdf', { type: 'application/pdf' });
    expect(await extractFromTemplatePdf(blankFile, 'claim', ctx)).toBeNull();

    const pdf = await PDFDocument.load(templateBytes);
    const form = pdf.getForm();
    expect(form.getFields()).toHaveLength(120);
    form.getDropdown('document_type').select('LOA');
    form.getTextField('client_company').setText('Acme Corp');
    form.getTextField('purpose').setText('Annual contract alignment');
    form.getTextField('meeting_date').setText('2026-11-11');
    form.getTextField('location').setText('BGC Taguig');
    form.getDropdown('category').select('Business Review');
    form.getTextField('contact_1_name').setText('Maria Santos');
    form.getTextField('contact_1_designation').setText('VP Procurement');
    form.getTextField('contact_1_email').setText('maria@acme.com');
    form.getTextField('expense_1_date').setText('2026-11-11');
    form.getTextField('expense_1_vendor').setText('Wildflour Cafe');
    form.getTextField('expense_1_amount').setText('1450.75');
    form.getDropdown('expense_1_category').select('Meals');
    form.getTextField('expense_1_business_purpose').setText('Client lunch');
    form.getTextField('expense_1_payment_method').setText('Personal Card');
    form.getTextField('expense_1_or_number').setText('OR-99881');
    form.getTextField('expense_1_tin_number').setText('123-456-789-000');

    const filledFile = new File([await pdf.save()], 'filled-template.pdf', { type: 'application/pdf' });
    const tier1 = await extractFromTemplatePdf(filledFile, 'claim', ctx);
    expect(tier1).not.toBeNull();
    expect(byKey(tier1!, 'documentType')?.value).toBe('LOA');
    expect(byKey(tier1!, 'client')?.value).toBe('Acme Corp');
    expect(byKey(tier1!, 'purpose')?.value).toBe('Annual contract alignment');
    expect(byKey(tier1!, 'meetingDate')?.value).toBe('2026-11-11');
    expect(byKey(tier1!, 'location')?.value).toBe('BGC Taguig');
    expect(byKey(tier1!, 'contacts')?.value).toBe('Maria Santos (VP Procurement)');
    expect(byKey(tier1!, 'clientEmails')?.value).toBe('maria@acme.com');
    expect(byKey(tier1!, 'custom:mom:category')?.value).toBe('Business Review');
    expect(tier1!.expenses).toHaveLength(1);
    expect(tier1!.expenses[0].values).toMatchObject({
      expenseDate: '2026-11-11', vendor: 'Wildflour Cafe', amount: '1450.75', category: 'Meals',
      businessPurpose: 'Client lunch', paymentMethod: 'Personal Card', orNumber: 'OR-99881', tinNumber: '123-456-789-000',
    });

    form.flatten();
    const flatFile = new File([await pdf.save()], 'flattened-template.pdf', { type: 'application/pdf' });
    const tier2 = await extractFromTemplatePdf(flatFile, 'mom', ctx);
    expect(tier2).not.toBeNull();
    expect(byKey(tier2!, 'documentType')?.value).toBe('LOA');
    expect(byKey(tier2!, 'client')?.value).toBe('Acme Corp');
    expect(byKey(tier2!, 'purpose')?.value).toBe('Annual contract alignment');
    expect(byKey(tier2!, 'meetingDate')?.value).toBe('2026-11-11');
    expect(byKey(tier2!, 'location')?.value).toBe('BGC Taguig');
    expect(byKey(tier2!, 'custom:mom:category')?.value).toBe('Business Review');
  });
});

