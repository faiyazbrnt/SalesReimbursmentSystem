import { hydrateServerlessState, hydrateUsersForRequest } from '../../../../server/stateLoader';
import { state } from '../../../../server/state';
import { UserRole } from '../../../../lib/db/serverTypes';
import { enforceApiRateLimit } from '../../../../services/http/rateLimit';
import { extractDocument, extractionConfigured, ExtractionError } from '../../../../services/moms/extraction';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function authorize(request: Request) {
  await hydrateUsersForRequest();
  const id = request.headers.get('x-user-id');
  const user = state.users.find(item => item.id === id || item.entra_object_id === id || item.user_principal_name === id);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (user.role === UserRole.CUSTODIAN) return json({ error: 'Document autofill is not available for this role.' }, 403);
  return null;
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return json({ enabled: extractionConfigured() });
}

export async function POST(request: Request) {
  try {
    const denied = await authorize(request);
    if (denied) return denied;
    if (!extractionConfigured()) return json({ error: 'Document autofill is unavailable until Azure OpenAI is configured.' }, 503);
    const limited = await enforceApiRateLimit(request, '/moms/extract');
    if (limited) return limited;
    if (Number(request.headers.get('content-length')) > 10 * 1024 * 1024 + 65536) return json({ error: 'File is too large. Maximum size is 10MB.' }, 413);
    const data = await request.formData().catch(() => null);
    const file = data?.get('file');
    const context = data?.get('context');
    if (!(file instanceof File)) return json({ error: 'A document file is required.' }, 400);
    if (context !== 'claim' && context !== 'mom') return json({ error: 'A valid form context is required.' }, 400);
    await hydrateServerlessState();
    return json(await extractDocument(file, context, request.signal));
  } catch (error) {
    if (error instanceof ExtractionError) return json({ error: error.message }, error.status);
    console.warn('[mom-extraction] Document analysis failed');
    return json({ error: 'Document analysis is unavailable. Enter the details manually or retry later.' }, 500);
  }
}
