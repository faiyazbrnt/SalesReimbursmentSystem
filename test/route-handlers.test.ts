import { afterEach, describe, expect, it } from 'vitest';
import { dispatchTestRequest } from './testRouter';
import { GET as apiHealth } from '../src/app/api/health/route';
import { GET as cron } from '../src/app/api/cron/hourly/route';
import { POST as upload } from '../src/app/api/upload/route';
import { POST as signUpload } from '../src/app/api/upload/sign/route';
import { GET as healthz } from '../src/app/healthz/route';
import { GET as readyz } from '../src/app/readyz/route';
import { GET as download } from '../src/app/uploads/[filename]/route';
import { GET as workspace } from '../src/app/api/workspace/route';

const originalCronSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

async function callApi(path: string, init: RequestInit = {}): Promise<Response> {
  return dispatchTestRequest(path, init);
}

describe('Next.js Route Handler boundary', () => {
  it('preserves health and readiness response contracts', async () => {
    expect(await (await apiHealth()).json()).toEqual({ Health: 'ok!' });
    expect(await (await healthz()).json()).toEqual({ status: 'ok' });
    const ready = await readyz();
    expect(ready.status).toBe(200);
    expect((await ready.json()).database).toBe('not_configured');
  });

  it('returns explicit 404 and 405 JSON responses', async () => {
    const missing = await callApi('/api/does-not-exist');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Not found' });

    const wrongMethod = await callApi('/api/users', { method: 'DELETE' });
    expect(wrongMethod.status).toBe(405);
    expect(await wrongMethod.json()).toEqual({ error: 'Method not allowed' });
  });

  it('rejects malformed JSON before invoking a controller', async () => {
    const response = await callApi('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body.' });
  });

  it('protects the Vercel cron endpoint with CRON_SECRET', async () => {
    delete process.env.CRON_SECRET;
    expect((await cron(new Request('http://route-handler.test/api/cron/hourly'))).status).toBe(503);

    process.env.CRON_SECRET = 'test-cron-secret';
    expect((await cron(new Request('http://route-handler.test/api/cron/hourly', {
      headers: { Authorization: 'Bearer wrong-secret' },
    }))).status).toBe(401);
  });

  it('keeps upload validation and legacy download authorization at Route Handlers', async () => {
    const unauthorizedUpload = await upload(new Request('http://route-handler.test/api/upload', {
      method: 'POST',
      body: new FormData(),
    }));
    expect(unauthorizedUpload.status).toBe(401);

    const missingFile = await upload(new Request('http://route-handler.test/api/upload', {
      method: 'POST',
      headers: { 'X-User-Id': 'u1' },
      body: new FormData(),
    }));
    expect(missingFile.status).toBe(400);
    expect(await missingFile.json()).toEqual({ error: 'No file uploaded' });

    const unsigned = await signUpload(new Request('http://route-handler.test/api/upload/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'u1',
      },
      body: JSON.stringify({ name: 'receipt.pdf', size: 1024, type: 'application/pdf' }),
    }));
    expect(unsigned.status).toBe(503);
    expect(await unsigned.json()).toEqual({ error: 'Upload storage is not configured.' });

    const missingDownload = await download(
      new Request('http://route-handler.test/uploads/not-linked.pdf', {
        headers: { 'X-User-Id': 'u1' },
      }),
      { params: Promise.resolve({ filename: 'not-linked.pdf' }) },
    );
    expect(missingDownload.status).toBe(404);

    const validForm = new FormData();
    validForm.append('file', new File([new Uint8Array([1, 2, 3])], 'receipt.png', { type: 'image/png' }));
    const validUpload = await upload(new Request('http://route-handler.test/api/upload', {
      method: 'POST',
      headers: { 'X-User-Id': 'u1' },
      body: validForm,
    }));
    expect(validUpload.status).toBe(200);
    const validUploadBody = await validUpload.json() as { url: string };
    expect(validUploadBody.url).toMatch(/^\/uploads\/[0-9a-f-]+.png$/);
  });

  it('serves the consolidated /api/workspace payload in a single trip', async () => {
    const unauth = await workspace(new Request('http://route-handler.test/api/workspace'));
    expect(unauth.status).toBe(401);

    const res = await workspace(new Request('http://route-handler.test/api/workspace', {
      headers: { 'X-User-Id': 'u1' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('me');
    expect(body).toHaveProperty('users');
    expect(body).toHaveProperty('claims');
    expect(body).toHaveProperty('advances');
    expect(body).toHaveProperty('liquidations');
    expect(body).toHaveProperty('masterAll');
    expect(body).toHaveProperty('fieldDefinitions');
    expect(body).toHaveProperty('moms');
    expect(body).toHaveProperty('reviewMeetings');
    expect(body).toHaveProperty('companies');
    expect(body).toHaveProperty('settings');
    expect(body).toHaveProperty('outbox');
    expect(Array.isArray(body.outbox)).toBe(true);
    expect(body.me.id).toBe('u1');
  });

  it('delivers claim submission notifications to requestor and approver in workspace outbox', async () => {
    const claimRes = await callApi('/api/claims', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'u1',
      },
      body: JSON.stringify({
        claim_type: 'Transport Reimbursement',
        total_amount: 850,
        expense_category: 'Taxi / Rideshare',
        tin_number: '123-456-789-000',
        receipt_url: 'http://localhost/receipt.png',
        expense_date: new Date().toISOString().split('T')[0],
      }),
    });
    expect(claimRes.status).toBe(200);
    const createdClaim = await claimRes.json();
    const claimNum = createdClaim.claim_number;

    // Check Alice's (u1) workspace outbox
    const aliceWs = await workspace(new Request('http://route-handler.test/api/workspace', {
      headers: { 'X-User-Id': 'u1' },
    }));
    const aliceBody = await aliceWs.json();
    const aliceNotif = aliceBody.outbox.find((n: any) => n.subject.includes(claimNum));
    expect(aliceNotif).toBeDefined();
    expect(aliceNotif.recipient_id).toBe('u1');
    expect(aliceNotif.read).toBe(false);

    // Check Bob's (approver u2) workspace outbox
    const bobWs = await workspace(new Request('http://route-handler.test/api/workspace', {
      headers: { 'X-User-Id': 'u2' },
    }));
    const bobBody = await bobWs.json();
    const bobNotif = bobBody.outbox.find((n: any) => n.subject.includes(claimNum));
    expect(bobNotif).toBeDefined();
    expect(bobNotif.recipient_id).toBe('u2');
    expect(bobNotif.read).toBe(false);

    // Verify other unrelated users (e.g. custodian u3) do NOT receive Alice's submission notification
    const carolWs = await workspace(new Request('http://route-handler.test/api/workspace', {
      headers: { 'X-User-Id': 'u3' },
    }));
    const carolBody = await carolWs.json();
    const carolNotif = carolBody.outbox.find((n: any) => n.subject.includes(claimNum));
    expect(carolNotif).toBeUndefined();
  });
});
