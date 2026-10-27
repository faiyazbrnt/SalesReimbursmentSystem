import { withPersistenceScope } from '../../../../../../lib/db/persistenceScope';
import { hydrateServerlessState } from '../../../../../../server/stateLoader';
import { custodianClaimDecision } from '../../../../../../services/claims/claims';
import { timedRoute } from '../../../../../../lib/http/timedRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return timedRoute('custodian-decision', measure => withPersistenceScope(async () => {
    await measure('hydrate', () => hydrateServerlessState());
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await measure('decision', () => custodianClaimDecision(request.headers.get('x-user-id'), id, body));
    return Response.json(result.body, { status: result.status });
  }));
}
