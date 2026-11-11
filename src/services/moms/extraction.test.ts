import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../../app/api/moms/extract/route';
import { extractDocument, extractionConfigured, extractionFields, normalizeExtraction } from './extraction';
import { EXPENSE_FIELDS, appendExtractedExpenses, reviewValues, splitAppliedValues } from '../../features/moms/extraction/model';
import { state } from '../../server/state';

const empty = () => ({ fields: [], expenses: [], warnings: [] });
const expense = (values: Record<string, string | null> = {}, currency: string | null = 'PHP') => ({
  values: { ...Object.fromEntries(EXPENSE_FIELDS.map(([key]) => [key, null])), ...values },
  currency, evidence: 'Parking PHP 425.00', warnings: [],
});
const pdf = () => new File(['%PDF-1.4 fictional test'], 'meeting.pdf', { type: 'application/pdf' });
const request = (file = pdf(), context = 'claim', user = 'u1') => {
  const body = new FormData(); body.set('file', file); body.set('context', context);
  return new Request('http://localhost/api/moms/extract', { method: 'POST', headers: { 'X-User-Id': user }, body });
};
const enable = () => {
  vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test-resource.openai.azure.com');
  vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-key');
  vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', 'test-deployment');
};
const mockAzure = (result: unknown) => vi.fn().mockImplementation(async () => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }));

describe('MOM / LOA extraction boundary', () => {
  beforeEach(() => {
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', ''); vi.stubEnv('AZURE_OPENAI_API_KEY', ''); vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', '');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('is unavailable until every Azure setting is present; never leaks credentials or changes data', async () => {
    const baseline = JSON.stringify({ claims: state.claims, moms: state.moms, history: state.statusHistories });
    expect(extractionConfigured()).toBe(false);
    expect(await (await GET(new Request('http://localhost/api/moms/extract', { headers: { 'X-User-Id': 'u1' } }))).json()).toEqual({ enabled: false });
    expect((await POST(request())).status).toBe(503);
    enable(); vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', '');
    expect(extractionConfigured()).toBe(false);
    enable();
    expect(await (await GET(new Request('http://localhost/api/moms/extract', { headers: { 'X-User-Id': 'u1' } }))).json()).toEqual({ enabled: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify({ claims: state.claims, moms: state.moms, history: state.statusHistories })).toBe(baseline);
  });

  it('rejects signed-out and Custodian requests before reading files or calling Azure', async () => {
    enable();
    expect((await GET(new Request('http://localhost/api/moms/extract'))).status).toBe(401);
    expect((await POST(request(pdf(), 'claim', 'missing-user'))).status).toBe(401);
    expect((await POST(request(pdf(), 'claim', 'u3'))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('validates context, file contents, size, and unsupported DOC without provider calls', async () => {
    enable();
    expect((await POST(request(pdf(), 'unknown'))).status).toBe(400);
    expect((await POST(request(new File(['wrong signature'], 'fake.pdf')))).status).toBe(400);
    expect((await POST(request(new File(['wrong signature'], 'fake.png')))).status).toBe(400);
    expect((await POST(request(new File(['x'], 'old.doc')))).status).toBe(400);
    await expect(extractDocument(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf'), 'mom')).rejects.toThrow('10MB');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses inline PDF input, company Azure deployment, strict output, and store:false without persistence', async () => {
    enable();
    const provider = mockAzure({ ...empty(), fields: [{ key: 'purpose', value: 'Client review', evidence: 'Client review' }] });
    vi.stubGlobal('fetch', provider);
    const baseline = JSON.stringify([state.claims, state.moms, state.statusHistories]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).fields[0]).toMatchObject({ key: 'purpose', value: 'Client review' });
    const [url, options] = provider.mock.calls[0];
    expect(url).toBe('https://test-resource.openai.azure.com/openai/v1/responses');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ model: 'test-deployment', store: false, text: { format: { strict: true, type: 'json_schema' } } });
    expect(body.input[0].content[0].file_data).toMatch(/^data:application\/pdf;base64,/);
    expect(body.instructions).not.toContain(state.companies[0].name);
    expect(JSON.stringify([state.claims, state.moms, state.statusHistories])).toBe(baseline);
  });

  it('accepts scanned-image input and extracts DOCX text and table values locally', async () => {
    enable(); vi.stubGlobal('fetch', mockAzure(empty()));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=', 'base64');
    await extractDocument(new File([png], 'scan.png', { type: 'image/png' }), 'mom');
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).input[0].content[0].type).toBe('input_image');
    const docx = readFileSync(new URL('../../../test/fixtures/document-autofill.docx', import.meta.url));
    const result = await extractDocument(new File([docx], 'meeting.docx'), 'mom');
    const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(body.input[0].content[0]).toMatchObject({ type: 'input_text' });
    expect(body.input[0].content[0].text).toContain('Fictional client review');
    expect(body.input[0].content[0].text).toContain('425.00');
    expect(result.warnings[0]).toContain('Embedded images');
  });

  it('handles provider failure, refusals, malformed output, and timeout without fabricating results', async () => {
    enable();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    expect((await POST(request())).status).toBe(502);
    vi.stubGlobal('fetch', mockAzure({ fields: 'bad' }));
    expect((await POST(request())).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] })));
    expect((await POST(request())).status).toBe(502);
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))));
    const pending = extractDocument(pdf(), 'claim');
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(60_001);
    await assertion;
  });

  it('restricts extracted keys, rejects invalid dates, and requires manual matching for unknown companies', () => {
    const result = normalizeExtraction({ ...empty(), fields: [
      { key: 'client', value: 'Unlisted fictional company', evidence: 'Unlisted fictional company' },
      { key: 'meetingDate', value: '2026-02-30', evidence: '02/30/2026' },
      { key: 'preparedBy', value: 'Someone else', evidence: 'Someone else' },
      { key: 'ccClient', value: 'true', evidence: 'please email' },
    ] }, extractionFields('claim'), 'claim');
    expect(result.fields).toHaveLength(2);
    expect(result.fields.every(field => Boolean(field.warning))).toBe(true);
  });

  it('retains TIN/OR strings, maps unknown categories to Others, and never converts foreign amounts or infers payment', () => {
    const raw = { ...empty(), expenses: [expense({ category: 'Parking', amount: '425.00', tinNumber: '000-123-000', orNumber: '00125' }), expense({ amount: '10' }, 'USD')] };
    const result = normalizeExtraction(raw, extractionFields('claim'), 'claim');
    expect(result.expenses[0].values).toEqual({ category: 'Others', otherCategory: 'Parking', amount: '425.00', tinNumber: '000-123-000', orNumber: '00125' });
    expect(result.expenses[1].values.amount).toBeUndefined();
    expect(result.expenses[1].warnings[0]).toContain('USD');
    expect(normalizeExtraction(raw, extractionFields('mom'), 'mom').expenses).toEqual([]);
  });

  it('applies only selected fields and appends expenses once while preserving entered rows and receipts', () => {
    const parts = splitAppliedValues({ purpose: 'Reviewed purpose', contacts: 'Fictional Attendee (Buyer)', 'custom:mom:category': 'Sales Call' });
    expect(parts.core).toEqual({ purpose: 'Reviewed purpose' });
    expect(parts.contacts).toEqual([{ name: 'Fictional Attendee', designation: 'Buyer' }]);
    expect(parts.emails).toBeUndefined();
    const original = { vendor: 'Manual vendor', amount: 100, receiptUrls: ['/uploads/receipt.pdf'] };
    const imported = { vendor: 'Extracted vendor', amount: 425, tinNumber: '001-002-003' };
    const rows = appendExtractedExpenses([original], [imported]);
    expect(rows).toEqual([original, imported]);
    expect(appendExtractedExpenses(rows, [imported])).toEqual(rows);
    expect(appendExtractedExpenses([{ category: 'Meals', paymentMethod: 'Personal Card', amount: 0 }], [imported])).toEqual([imported]);
  });

  it('deduplicates repeated expense suggestions within one provider result', () => {
    const row = { vendor: 'Repeated extracted vendor', amount: 425, expenseDate: '2026-10-27' };
    expect(appendExtractedExpenses([], [row, { ...row }])).toEqual([row]);
  });

  it('keeps notification preferences and hidden form fields out of the string-only review values', () => {
    const core = { client: '', purpose: '', meetingDate: '', location: '', ccClient: true, discussion: 'private draft' };
    const values = reviewValues(core, 'MoM', [], [], {});
    expect(values).not.toHaveProperty('ccClient');
    expect(values).not.toHaveProperty('discussion');
    expect(Object.values(values).every(value => typeof value === 'string')).toBe(true);
  });

  it('uses canonical server master-data keys for classification options', () => {
    const original = state.fieldDefinitions;
    state.fieldDefinitions = ['costCenters', 'businessUnits', 'projectCodes'].map((key, index) => ({
      id: `extraction-test-${index}`, key: `classification_${index}`, entity: 'mom' as const,
      label: key, input_type: 'dropdown' as const, active: true, required: false,
      display_order: index, master_data_entity: key as 'costCenters', created_at: '', updated_at: '',
    }));
    try {
      const fields = extractionFields('mom');
      expect(fields.find(field => field.key === 'custom:mom:classification_0')?.options).toEqual(state.costCenters.filter(row => row.active).map(row => row.name));
      expect(fields.find(field => field.key === 'custom:mom:classification_1')?.options).toEqual(state.businessUnits.filter(row => row.active).map(row => row.name));
      expect(fields.find(field => field.key === 'custom:mom:classification_2')?.options).toEqual(state.projectCodes.filter(row => row.active).map(row => row.name));
    } finally { state.fieldDefinitions = original; }
  });
});
