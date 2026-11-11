import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadToSupabase } from './supabaseStorage';
import { extractionConfigured } from '../moms/extraction';

describe('manual attachment uploads without Azure', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'reimbursement-upload-test-'));
    vi.stubEnv('UPLOAD_DIR', directory);
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', '');
    vi.stubEnv('AZURE_OPENAI_API_KEY', '');
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', '');
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  const request = (name: string, type: string, user = 'u1') => {
    const body = new FormData(); body.append('file', new File(['fictional manual document'], name, { type }));
    return new Request('http://localhost/api/upload', { method: 'POST', headers: { 'X-User-Id': user }, body });
  };

  it('stores PDF receipts, Word MOMs, and legacy DOC attachments through the existing upload path', async () => {
    expect(extractionConfigured()).toBe(false);
    for (const [name, mime] of [
      ['receipt.pdf', 'application/pdf'],
      ['mom.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['agreement.doc', 'application/msword'],
    ]) {
      const response = await uploadToSupabase(request(name, mime));
      expect(response.status).toBe(200);
      const { url } = await response.json();
      expect(readFileSync(path.join(directory, path.basename(url)), 'utf8')).toBe('fictional manual document');
    }
    expect(readdirSync(directory)).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still rejects unauthorized uploads without writing files', async () => {
    expect((await uploadToSupabase(request('receipt.pdf', 'application/pdf', 'missing'))).status).toBe(401);
    expect(readdirSync(directory)).toEqual([]);
  });
});
