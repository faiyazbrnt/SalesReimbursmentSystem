import { loadCashAdvanceLoopFromDb } from '../lib/db/cashAdvanceRepo';
import { loadCoreLoopFromDb } from '../lib/db/coreLoopRepo';
import {
  loadCompaniesFromDb,
  loadFieldDefinitionsFromDb,
  loadMasterDataHistoryFromDb,
  loadMasterDataTable,
  loadSystemSettingsFromDb,
} from '../lib/db/referenceDataRepo';
import { isDbConfigured, loadUserHistoryFromDb, loadUsersFromDb, syncUsersToDb } from '../lib/db/usersRepo';
import {
  loadDelegationHistoryFromDb,
  loadDelegationsFromDb,
  loadReviewMeetingsFromDb,
  loadSupportRequestsFromDb,
} from '../lib/db/workflowExtrasRepo';
import { serverEnv } from '../config/env';
import { config } from './config';
import { state } from './state';

let activeHydration: Promise<void> | undefined;
let activeUserHydration: Promise<void> | undefined;

export type StateHydrationProfile =
  | 'full'
  | 'claim-approval'
  | 'claim-submission'
  | 'claim-transition';

/**
 * Refreshes production state from PostgreSQL for a serverless request.
 *
 * The legacy controllers still operate on their existing state object during
 * Phase 2. Reloading it for every cold/warm request prevents a Vercel instance
 * from treating its process memory as the source of truth. Phase 3 will move
 * these reads into feature repositories so each handler requests only the rows
 * it needs.
 */
const globalForStateLoader = globalThis as typeof globalThis & {
  hasHydratedOnce?: boolean;
  dbConnectionFailed?: boolean;
};

export async function hydrateServerlessState(
  profile: StateHydrationProfile = 'full',
): Promise<void> {
  if (!isDbConfigured()) {
    if (!config.demoMode) {
      throw new Error('DATABASE_URL is required when DEMO_MODE=false');
    }
    return;
  }

  // In development (localhost), if database is unreachable (e.g. Wi-Fi blocks ports),
  // don't stall every subsequent request for 10 seconds.
  if (!serverEnv.isProduction && (globalForStateLoader.hasHydratedOnce || globalForStateLoader.dbConnectionFailed)) {
    return;
  }

  if (activeHydration) return activeHydration;

  activeHydration = (async () => {
    try {
      const [
        users,
        userHistory,
        core,
        advances,
        companies,
        departments,
        costCenters,
        businessUnits,
        branches,
        projectCodes,
        vendors,
        fieldDefinitions,
        systemSettings,
        masterDataHistory,
        delegations,
        delegationHistory,
        reviewMeetings,
        support,
      ] = await Promise.all([
        loadUsersFromDb(),
        profile === 'full' ? loadUserHistoryFromDb() : Promise.resolve([]),
        loadCoreLoopFromDb(),
        profile === 'full' ? loadCashAdvanceLoopFromDb() : Promise.resolve({ cashAdvances: [], liquidations: [], liquidationLineItems: [], statusHistories: [] }),
        profile === 'full' || profile === 'claim-submission'
          ? loadCompaniesFromDb()
          : Promise.resolve([]),
        profile === 'full' ? loadMasterDataTable('departments') : Promise.resolve([]),
        profile === 'full' ? loadMasterDataTable('cost-centers') : Promise.resolve([]),
        profile === 'full' ? loadMasterDataTable('business-units') : Promise.resolve([]),
        profile === 'full' ? loadMasterDataTable('branches') : Promise.resolve([]),
        profile === 'full' ? loadMasterDataTable('project-codes') : Promise.resolve([]),
        profile === 'full' ? loadMasterDataTable('vendors') : Promise.resolve([]),
        profile === 'full' ? loadFieldDefinitionsFromDb() : Promise.resolve([]),
        profile === 'full' || profile === 'claim-submission'
          ? loadSystemSettingsFromDb()
          : Promise.resolve(undefined),
        profile === 'full' ? loadMasterDataHistoryFromDb() : Promise.resolve([]),
        loadDelegationsFromDb(),
        profile === 'full' ? loadDelegationHistoryFromDb() : Promise.resolve([]),
        profile === 'full' || profile === 'claim-approval' || profile === 'claim-transition'
          ? loadReviewMeetingsFromDb()
          : Promise.resolve([]),
        profile === 'full' ? loadSupportRequestsFromDb() : Promise.resolve({ requests: [], messages: [] }),
      ]);

      if (users.length > 0) {
        state.users = users;
      } else if (config.demoMode && config.autoSeed) {
        // A fresh Docker demo database has no identities yet. Keep the
        // in-memory defaults and persist them so claim foreign keys can pass.
        await syncUsersToDb(state.users);
        console.info('[stateLoader] Seeded demo users into empty PostgreSQL database');
      }
      state.moms = core.moms;
      state.claims = core.claims;
      state.expenses = core.expenses;
      state.approvals = core.approvals;
      if (profile === 'full') {
        state.cashAdvances = advances.cashAdvances;
        state.liquidations = advances.liquidations;
        state.liquidationLineItems = advances.liquidationLineItems;
      }
      if (companies.length > 0) state.companies = companies;
      if (departments.length > 0) state.departments = departments;
      if (costCenters.length > 0) state.costCenters = costCenters;
      if (businessUnits.length > 0) state.businessUnits = businessUnits;
      if (branches.length > 0) state.branches = branches;
      if (projectCodes.length > 0) state.projectCodes = projectCodes;
      if (vendors.length > 0) state.vendors = vendors;
      if (fieldDefinitions.length > 0) state.fieldDefinitions = fieldDefinitions;
      if (systemSettings) state.systemSettings = systemSettings;
      state.delegations = delegations;
      state.reviewMeetings = reviewMeetings;
      if (profile === 'full') {
        state.supportRequests = support.requests;
        state.supportMessages = support.messages;
      }
      state.statusHistories = [
        ...userHistory,
        ...core.statusHistories,
        ...advances.statusHistories,
        ...masterDataHistory,
        ...delegationHistory,
      ];
    } catch (err) {
      console.error('[stateLoader] Could not hydrate state from PostgreSQL:', err);
      globalForStateLoader.dbConnectionFailed = true;
      if (!config.demoMode && serverEnv.isProduction) {
        throw err;
      }
    }
  })().finally(() => {
    globalForStateLoader.hasHydratedOnce = true;
    activeHydration = undefined;
  });

  return activeHydration;
}

/** Load only identities needed by an upload authorization check. */
export async function hydrateUsersForRequest(): Promise<void> {
  if (!isDbConfigured()) {
    if (!config.demoMode) {
      throw new Error('DATABASE_URL is required when DEMO_MODE=false');
    }
    return;
  }

  if (activeUserHydration) return activeUserHydration;

  activeUserHydration = loadUsersFromDb()
    .then((users) => {
      if (users.length > 0) state.users = users;
    })
    .catch((err) => {
      console.error('[stateLoader] Could not load users from PostgreSQL:', err);
      globalForStateLoader.dbConnectionFailed = true;
      if (!config.demoMode && serverEnv.isProduction) throw err;
    })
    .finally(() => {
      activeUserHydration = undefined;
    });

  return activeUserHydration;
}
