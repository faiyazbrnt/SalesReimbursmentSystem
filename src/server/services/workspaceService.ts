import { canAccessClaim, canAccessMom, canAccessLiquidation, canAccessCashAdvance } from './authorization';
import { UserRole, ClaimStatus } from '@/lib/db/serverTypes';
import { state } from '@/server/state';
import { config } from '@/server/config';
import { serverEnv } from '@/config/env';
import { isFinancialRecord } from '@/server/constants';
import { isActiveDelegateFor } from '@/server/services/delegations';

export function getWorkspacePayload(userId: string) {
  const user = state.users.find(u => u.id === userId || u.entra_object_id === userId || u.user_principal_name === userId);
  if (!user) return null;

  // 1. Current user
  const me = {
    ...user,
    notification_prefs: user.notification_prefs || {
      email_claims: true,
      email_approvals: true,
      email_payouts: true,
      teams_claims: true,
      teams_approvals: true,
      teams_payouts: true,
    },
  };

  // 2. All users (sanitized)
  const users = state.users;

  // 3. Claims (scoped and enriched per role)
  let filteredClaims = state.claims;
  if (user.role === UserRole.REQUESTOR) {
    filteredClaims = state.claims.filter(c => c.requestor_id === user.id);
  } else if (user.role === UserRole.APPROVER) {
    filteredClaims = state.claims.filter(c => canAccessClaim(user, c));
  } else if (user.role === UserRole.CUSTODIAN) {
    filteredClaims = state.claims.filter(c => canAccessClaim(user, c));
  }

  const enrichedClaims = filteredClaims.map(c => {
    const mom = state.moms.find(m => m.id === c.mom_id);
    const reqUser = state.users.find(u => u.id === c.requestor_id);
    const claimExpenses = state.expenses.filter(e => e.claim_id === c.id);
    const claimApprovals = state.approvals.filter(a => a.claim_id === c.id);
    const claimHistory = state.statusHistories
      .filter(h => h.claim_id === c.id)
      .map(h => ({
        ...h,
        changedBy: state.users.find(u => u.id === h.changed_by),
      }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const reviewMeeting = state.reviewMeetings.find(rm => rm.claim_id === c.id);
    return { ...c, mom, requestor: reqUser, expenses: claimExpenses, approvals: claimApprovals, history: claimHistory, reviewMeeting };
  });

  // 4. Cash Advances
  let filteredAdvances = state.cashAdvances;
  if (user.role === UserRole.REQUESTOR) {
    filteredAdvances = state.cashAdvances.filter(ca => ca.requestorId === user.id);
  } else if (user.role === UserRole.APPROVER) {
    const reporteeIds = state.users.filter(u => u.reports_to === user.id).map(u => u.id);
    filteredAdvances = state.cashAdvances.filter(ca =>
      isFinancialRecord('Cash Advance', ca.status) ||
      ca.approverId === user.id ||
      ca.requestorId === user.id ||
      reporteeIds.includes(ca.requestorId) ||
      isActiveDelegateFor(user.id, ca.approverId)
    );
  } else if (user.role === UserRole.CUSTODIAN) {
    filteredAdvances = state.cashAdvances.filter(advance => canAccessCashAdvance(user, advance));
  }

  const enrichedAdvances = filteredAdvances.map(ca => {
    const requestor = state.users.find(u => u.id === ca.requestorId);
    const approver = state.users.find(u => u.id === ca.approverId);
    const mom = ca.momId ? state.moms.find(m => m.id === ca.momId) : undefined;
    const history = state.statusHistories
      .filter(h => h.cash_advance_id === ca.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { ...ca, requestor, approver, mom, history };
  });

  // 5. Liquidations
  let filteredLiquidations = state.liquidations;
  if (user.role === UserRole.REQUESTOR) {
    filteredLiquidations = state.liquidations.filter(l => l.requestorId === user.id);
  } else if (user.role === UserRole.APPROVER) {
    filteredLiquidations = state.liquidations.filter(l => canAccessLiquidation(user, l));
  } else if (user.role === UserRole.CUSTODIAN) {
    filteredLiquidations = state.liquidations.filter(liquidation => canAccessLiquidation(user, liquidation));
  }

  const enrichedLiquidations = filteredLiquidations.map(l => {
    const requestor = state.users.find(u => u.id === l.requestorId);
    const cashAdvance = state.cashAdvances.find(c => c.id === l.cashAdvanceId);
    const items = state.liquidationLineItems.filter(item => item.liquidationId === l.id);
    const mom = cashAdvance?.momId ? state.moms.find(m => m.id === cashAdvance.momId) : undefined;
    const history = state.statusHistories
      .filter(h => h.liquidation_id === l.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { ...l, requestor, cashAdvance, mom, lineItems: items, history };
  });

  // 6. Master Data
  const masterAll = {
    departments: state.departments,
    costCenters: state.costCenters,
    businessUnits: state.businessUnits,
    branches: state.branches,
    projectCodes: state.projectCodes,
    vendors: state.vendors,
  };

  // 7. Field Definitions
  const fieldDefinitions = state.fieldDefinitions;

  // 8. MOMs
  let relevantMoms: typeof state.moms = [];
  if (user.role === UserRole.ADMIN) {
    relevantMoms = state.moms;
  } else if (user.role === UserRole.CUSTODIAN) {
    relevantMoms = [];
  } else if (user.role === UserRole.REQUESTOR) {
    relevantMoms = state.moms.filter(m => m.requestor_id === user.id);
  } else if (user.role === UserRole.APPROVER) {
    relevantMoms = state.moms.filter(m => canAccessMom(user, m));
  }

  const enrichedMoms = relevantMoms.map(m => {
    const requestor = state.users.find(u => u.id === m.requestor_id);
    return {
      ...m,
      prepared_by: requestor ? requestor.name : (m.prepared_by || 'Unknown'),
      prepared_by_department: requestor ? requestor.department : undefined,
      prepared_by_job_title: requestor ? requestor.job_title : undefined,
    };
  });

  // 9. Review Meetings
  let relevantMeetings: any[] = [];
  if (user.role === UserRole.REQUESTOR) {
    relevantMeetings = state.reviewMeetings.filter(rm => rm.requestor_id === user.id);
  } else if (user.role === UserRole.APPROVER) {
    const reporteeIds = state.users.filter(u => u.reports_to === user.id).map(u => u.id);
    relevantMeetings = state.reviewMeetings.filter(rm => rm.requestor_id === user.id || reporteeIds.includes(rm.requestor_id));
  } else if (user.role === UserRole.ADMIN) {
    relevantMeetings = state.reviewMeetings;
  }

  const reviewMeetings = relevantMeetings.map(rm => {
    const requestor = state.users.find(u => u.id === rm.requestor_id);
    const approver = state.users.find(u => u.id === rm.approver_id);
    const claim = state.claims.find(c => c.id === rm.claim_id);
    return {
      ...rm,
      requestor_name: requestor?.name || 'Unknown',
      approver_name: approver?.name || 'Unknown',
      claim_number: claim?.claim_number,
      total_amount: claim?.total_amount,
    };
  });

  // 10. Companies
  const companies = state.companies;

  // 11. Outbox
  const allNotifications = [...state.emails, ...state.teamsMessages].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const outbox = user.role === UserRole.ADMIN
    ? allNotifications
    : allNotifications.filter(e => e.recipient_id === user.id);

  // 12. Support Requests
  const support = user.role === UserRole.ADMIN
    ? state.supportRequests
    : state.supportRequests.filter(sr => sr.requestor_id === user.id);

  // 13. Delegations
  const delegations = state.delegations;

  // 14. Settings
  const settings = state.systemSettings;

  // 15. Auth Config
  const authConfig = {
    provider: 'microsoft',
    mode: config.authMode,
    demoLoginEnabled: config.enableDemoLogin,
    microsoft: {
      configured: Boolean(serverEnv.microsoftTenantId && serverEnv.microsoftClientId),
      loginUrl: '/api/auth/microsoft/start',
    },
  };

  return {
    me,
    users,
    claims: enrichedClaims,
    advances: enrichedAdvances,
    liquidations: enrichedLiquidations,
    masterAll,
    fieldDefinitions,
    moms: enrichedMoms,
    reviewMeetings,
    companies,
    outbox,
    support,
    delegations,
    settings,
    authConfig,
  };
}
