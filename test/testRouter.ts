import * as momsRoute from '../src/app/api/moms/route';
import * as momIdRoute from '../src/app/api/moms/[id]/route';
import * as claimsRoute from '../src/app/api/claims/route';
import * as claimIdRoute from '../src/app/api/claims/[id]/route';
import * as claimApproveRoute from '../src/app/api/claims/[id]/approve/route';
import * as claimCodeRoute from '../src/app/api/claims/[id]/claim-code/route';
import * as claimReadyRoute from '../src/app/api/claims/[id]/ready-for-claim/route';
import * as claimClaimRoute from '../src/app/api/claims/[id]/claim/route';
import * as claimResubmitRoute from '../src/app/api/claims/[id]/resubmit/route';
import * as custodianDecisionRoute from '../src/app/api/custodian/claims/[id]/decision/route';
import * as outboxRoute from '../src/app/api/outbox/route';
import * as historyRoute from '../src/app/api/history/route';
import * as cashAdvancesRoute from '../src/app/api/cash-advances/route';
import * as cashAdvanceSubmitRoute from '../src/app/api/cash-advances/[id]/submit/route';
import * as cashAdvanceApproveRoute from '../src/app/api/cash-advances/[id]/approve/route';
import * as cashAdvanceReleaseRoute from '../src/app/api/cash-advances/[id]/release/route';
import * as liquidationsRoute from '../src/app/api/liquidations/route';
import * as liquidationLineItemsRoute from '../src/app/api/liquidations/[id]/line-items/route';
import * as liquidationSubmitRoute from '../src/app/api/liquidations/[id]/submit/route';
import * as liquidationReviewRoute from '../src/app/api/liquidations/[id]/review/route';
import * as analyticsSummaryRoute from '../src/app/api/analytics/summary/route';
import * as authConfigRoute from '../src/app/api/auth/config/route';
import * as authMicrosoftStartRoute from '../src/app/api/auth/microsoft/start/route';
import * as demoUsersRoute from '../src/app/api/demo-users/route';
import * as loginRoute from '../src/app/api/login/route';
import * as meRoute from '../src/app/api/me/route';
import * as meNotificationPrefsRoute from '../src/app/api/me/notification-prefs/route';
import * as usersRoute from '../src/app/api/users/route';
import * as userIdRoute from '../src/app/api/users/[id]/route';
import * as adminSettingsRoute from '../src/app/api/admin/settings/route';

type RouteEntry = {
  pattern: RegExp;
  paramNames: string[];
  module: Record<string, any>;
};

const routes: RouteEntry[] = [
  { pattern: /^\/api\/auth\/config$/, paramNames: [], module: authConfigRoute },
  { pattern: /^\/api\/auth\/microsoft\/start$/, paramNames: [], module: authMicrosoftStartRoute },
  { pattern: /^\/api\/demo-users$/, paramNames: [], module: demoUsersRoute },
  { pattern: /^\/api\/login$/, paramNames: [], module: loginRoute },
  { pattern: /^\/api\/me\/notification-prefs$/, paramNames: [], module: meNotificationPrefsRoute },
  { pattern: /^\/api\/me$/, paramNames: [], module: meRoute },
  { pattern: /^\/api\/moms$/, paramNames: [], module: momsRoute },
  { pattern: /^\/api\/moms\/([^/]+)$/, paramNames: ['id'], module: momIdRoute },
  { pattern: /^\/api\/claims$/, paramNames: [], module: claimsRoute },
  { pattern: /^\/api\/claims\/([^/]+)\/approve$/, paramNames: ['id'], module: claimApproveRoute },
  { pattern: /^\/api\/claims\/([^/]+)\/claim-code$/, paramNames: ['id'], module: claimCodeRoute },
  { pattern: /^\/api\/claims\/([^/]+)\/ready-for-claim$/, paramNames: ['id'], module: claimReadyRoute },
  { pattern: /^\/api\/claims\/([^/]+)\/claim$/, paramNames: ['id'], module: claimClaimRoute },
  { pattern: /^\/api\/claims\/([^/]+)\/resubmit$/, paramNames: ['id'], module: claimResubmitRoute },
  { pattern: /^\/api\/claims\/([^/]+)$/, paramNames: ['id'], module: claimIdRoute },
  { pattern: /^\/api\/custodian\/claims\/([^/]+)\/decision$/, paramNames: ['id'], module: custodianDecisionRoute },
  { pattern: /^\/api\/outbox$/, paramNames: [], module: outboxRoute },
  { pattern: /^\/api\/history$/, paramNames: [], module: historyRoute },
  { pattern: /^\/api\/cash-advances$/, paramNames: [], module: cashAdvancesRoute },
  { pattern: /^\/api\/cash-advances\/([^/]+)\/submit$/, paramNames: ['id'], module: cashAdvanceSubmitRoute },
  { pattern: /^\/api\/cash-advances\/([^/]+)\/approve$/, paramNames: ['id'], module: cashAdvanceApproveRoute },
  { pattern: /^\/api\/cash-advances\/([^/]+)\/release$/, paramNames: ['id'], module: cashAdvanceReleaseRoute },
  { pattern: /^\/api\/liquidations$/, paramNames: [], module: liquidationsRoute },
  { pattern: /^\/api\/liquidations\/([^/]+)\/line-items$/, paramNames: ['id'], module: liquidationLineItemsRoute },
  { pattern: /^\/api\/liquidations\/([^/]+)\/submit$/, paramNames: ['id'], module: liquidationSubmitRoute },
  { pattern: /^\/api\/liquidations\/([^/]+)\/review$/, paramNames: ['id'], module: liquidationReviewRoute },
  { pattern: /^\/api\/analytics\/summary$/, paramNames: [], module: analyticsSummaryRoute },
  { pattern: /^\/api\/users$/, paramNames: [], module: usersRoute },
  { pattern: /^\/api\/users\/([^/]+)$/, paramNames: ['id'], module: userIdRoute },
  { pattern: /^\/api\/admin\/settings$/, paramNames: [], module: adminSettingsRoute },
];

export async function dispatchTestRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, 'http://route-handler.test');
  const pathname = url.pathname;
  const method = (init.method || 'GET').toUpperCase();


  for (const route of routes) {
    const match = route.pattern.exec(pathname);
    if (match) {
      const handler = route.module[method];
      if (!handler) {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, idx) => {
        params[name] = decodeURIComponent(match[idx + 1]);
      });

      const request = new Request(url, init);
      return handler(request, { params: Promise.resolve(params) });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
