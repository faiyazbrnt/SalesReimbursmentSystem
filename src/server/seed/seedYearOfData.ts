import { v4 as uuidv4 } from 'uuid';
import {
  UserRole, Mom, MomStatus, MinutesSource, Claim, ClaimStatus,
  ExpenseLineItem, Approval, CashAdvance, CashAdvanceStatus,
  Liquidation, LiquidationStatus, LiquidationVarianceType, LiquidationLineItem,
  ReviewMeeting, ReviewMeetingStatus, SupportRequest, SupportRequestStatus, SupportRequestPriority,
  ApproverDelegation, DelegationStatus
} from '../../lib/db/serverTypes';
import {
  state, buildDefaultUsers, applyHierarchySyncDefaults,
  buildInitialCompanies, buildInitialDepartments, buildInitialCostCenters,
  buildInitialBusinessUnits, buildInitialBranches, buildInitialProjectCodes,
  buildInitialVendors, buildInitialFieldDefinitions
} from '../state';
import { config } from '../config';
import { addDelegationHistory } from '../services/history';
import { REIMBURSEMENT_CAP } from '../constants';
import { clearUsersInDb, syncUsersToDb, isDbConfigured } from '../../lib/db/usersRepo';
import { syncClaimNumberSequenceFloor } from '../../lib/db/coreLoopRepo';
import { getOrCreateCompanyInMemory } from '../services/companyService';
import { getActiveDelegation } from '../services/delegations';
import { releaseCodeExpiryFrom } from '../services/releaseCode';
import { sendEmail } from '../services/notifications';

  export interface SeedDataOptions {
    demoClaims: boolean;
    demoCashAdvances: boolean;
    delegations: boolean;
    historicalBackfill: boolean;
    reviewMeetings: boolean;
    supportRequests: boolean;
  }

  export const FULL_SEED_OPTIONS: SeedDataOptions = {
    demoClaims: true,
    demoCashAdvances: true,
    delegations: true,
    historicalBackfill: true,
    reviewMeetings: true,
    supportRequests: true,
  };

  // resetUsers=false lets the boot-time auto-seed call (below) reseed the
  // not-yet-DB-backed domains (claims, moms, etc.) on every restart, exactly
  // as before persistence existed, without clobbering real users that were
  // just loaded from Postgres. Explicit admin seed/reset routes always pass
  // the default (true) — an admin choosing to reseed means reseed everything.
  export async function seedYearOfData(options: SeedDataOptions = FULL_SEED_OPTIONS, resetUsers = true) {
    // Every call site already checks demoModeEnabled before calling this
    // (route handlers return 404 first for a clean response; the boot-time
    // auto-seed only calls in if demoModeEnabled) — this is the backstop so
    // a real deploy can never regenerate demo data even if a future call
    // site forgets that check. One switch, enforced here, not by convention
    // at every caller (punchlist #10).
    if (!config.demoMode) {
      throw new Error('Refusing to seed demo data: DEMO_MODE is disabled.');
    }
    state.moms = [];
    state.claims = [];
    state.expenses = [];
    state.approvals = [];
    state.statusHistories = [];
    state.emails = [];
    state.teamsMessages = [];
    state.lastSeenStore = {};
    state.cashAdvances = [];
    state.liquidations = [];
    state.liquidationLineItems = [];
    state.reviewMeetings = [];
    state.delegations = [];
    state.supportRequests = [];
    state.supportMessages = [];
    state.companies = buildInitialCompanies();
    state.departments = buildInitialDepartments();
    state.costCenters = buildInitialCostCenters();
    state.businessUnits = buildInitialBusinessUnits();
    state.branches = buildInitialBranches();
    state.projectCodes = buildInitialProjectCodes();
    state.vendors = buildInitialVendors();
    state.fieldDefinitions = buildInitialFieldDefinitions();

    if (resetUsers) {
      state.users.length = 0;
      state.users.push(...buildDefaultUsers());
      applyHierarchySyncDefaults(state.users);

      // Reseeding always produces the same fixed demo user set — clear the
      // table first (not just upsert) so any previously-persisted user that
      // isn't part of that set doesn't linger as an orphan.
      try {
        await clearUsersInDb();
        await syncUsersToDb(state.users);
      } catch (err) {
        console.error('[db] Could not persist reseeded users to Postgres:', err);
      }
    }

    const rDate = (daysAgo: number) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    };

    // Seeds a delegation already in the Active state (pre-accepted), so demo
    // data doesn't require someone to manually click Accept after every
    // reset. Looked up by id, not array position - buildDefaultUsers() has
    // been reordered before and a positional index silently pointed at the
    // wrong user (Noah) the last time this drifted.
    const seedAcceptedDelegation = (approverId: string, delegateId: string, startDate: string, endDate: string) => {
      const approver = state.users.find(u => u.id === approverId);
      const delegate = state.users.find(u => u.id === delegateId);
      if (!approver || !delegate) return;
      const id = uuidv4();
      const createdAt = rDate(15);
      state.delegations.push({
        id,
        approver_id: approverId,
        delegate_id: delegateId,
        start_date: startDate,
        end_date: endDate,
        status: DelegationStatus.ACTIVE,
        created_by: approverId,
        created_at: createdAt,
        updated_at: createdAt
      });
      addDelegationHistory(id, '', DelegationStatus.PENDING, approverId, `Delegation requested to ${delegate.name}`);
      addDelegationHistory(id, DelegationStatus.PENDING, DelegationStatus.ACTIVE, delegateId, 'Delegation accepted');
    };

    if (options.delegations) {
      // Bob has an active delegation to Grace (covers "today", so auto-routing is demoable live).
      const activeDelegationStart = rDate(2).split('T')[0];
      const activeDelegationEnd = rDate(-5).split('T')[0];
      seedAcceptedDelegation('u2', 'u7', activeDelegationStart, activeDelegationEnd);

      // Henry has a delegation to Bob that already ended 2 days ago - demonstrates
      // the lazy Active -> Expired transition the first time delegations are read.
      const expiredStart = rDate(10).split('T')[0];
      const expiredEnd = rDate(2).split('T')[0];
      seedAcceptedDelegation('u8', 'u2', expiredStart, expiredEnd);
    }

    let seedCounter = 123;
    const nextClaimNumber = () => `REIM-${new Date().getFullYear()}-${String(seedCounter++).padStart(6, '0')}`;

    // Rotation pools so no two MOMs read as copy-pasted from one another.
    const CONTACTS = ['Maria Santos', 'Carlos Dela Cruz', 'Angela Reyes', 'Ramon Villanueva', 'Patricia Lim'];
    const PURPOSES = ['Sales and Partnership Discussion', 'Contract Renewal Discussion', 'Pilot Program Scoping', 'Marketing Collaboration Discussion', 'Accounts Receivable Follow-up'];
    const DISCUSSIONS = [
      (c: string) => `Reviewed Q3 procurement goals with ${c}. Presented our updated product catalog and volume-based discount tiers.`,
      (c: string) => `Discussed renewal terms for ${c}'s existing service contract and walked through proposed SLA improvements.`,
      (c: string) => `Conducted a needs-assessment session with ${c} to scope a potential pilot rollout across their Metro Manila branches.`,
      (c: string) => `Presented Q4 marketing collaboration opportunities to ${c} and gathered feedback on co-branded campaign concepts.`,
      (c: string) => `Followed up with ${c} on outstanding invoices and negotiated a revised payment schedule for the current quarter.`,
    ];
    const AGREEMENTS = [
      'Client agreed to a trial order of 100 units; we agreed to draft a custom pricing proposal within the week.',
      'Both parties agreed to a 6-month contract extension at current rates, pending legal review.',
      'Client approved a 2-branch pilot starting next month; we agreed to provide onsite training support.',
      'Client agreed to feature our product in their Q4 campaign in exchange for co-marketing budget support.',
      'Client committed to settling 50% of the balance by month-end, with the remainder due in 30 days.',
    ];
    const ACTION_ITEMS = [
      '1. Send pricing proposal\n2. Send trial contract guidelines',
      '1. Draft renewal contract addendum\n2. Schedule legal review',
      '1. Confirm pilot branch list\n2. Schedule onsite training dates',
      '1. Share co-marketing budget breakdown\n2. Draft campaign brief',
      '1. Send revised payment schedule\n2. Confirm receipt of partial payment',
    ];
    const LOCATIONS = ['Quezon City, Philippines', 'Makati City, Philippines', 'BGC, Taguig, Philippines', 'Cebu City, Philippines', 'Pasig City, Philippines'];
    const TIMES = ['09:00', '10:30', '13:00', '14:00', '15:30'];
    // Rotation pools covering every optional field the UI (MomDetail, the
    // dynamic field renderer) can display, so seeded records exercise those
    // paths instead of always rendering '-' / 'None listed'.
    const MEETING_TYPES = ['External', 'Internal', 'External', 'External', 'Internal'];
    const ACCOUNT_TYPES = ['Enterprise Client', 'SMB Client', 'Enterprise Client', 'Strategic Partner', 'SMB Client'];
    const CATEGORIES = ['Business Review', 'Pilot Discussion', 'Contract Renewal', 'Marketing Collaboration', 'Collections'];
    const INTERNAL_PARTICIPANT_POOL = ['Alice Reyes', 'Bob Santos', 'Ivy Salazar', 'Grace Navarro', 'Henry Castillo'];

    let momCursor = 0;
    const mkMom = (requestorId: string, client: string, status: MomStatus, daysAgo: number): Mom => {
      const idx = momCursor % 5;
      momCursor++;
      const actualClient = client && client.trim() !== '' ? client : 'SM Prime Holdings';
      const reqUser = state.users.find(u => u.id === requestorId);
      const contact = CONTACTS[idx];
      const [first, ...rest] = contact.split(' ');
      const last = rest[rest.length - 1] || first;
      const momDate = rDate(daysAgo);
      // Roughly 1 in 4 records are Letters of Agreement rather than plain
      // meeting minutes, so the Minutes & Agreements tab shows both types.
      const isLOA = momCursor % 4 === 0;
      const internalParticipants = Array.from(new Set([reqUser?.name, INTERNAL_PARTICIPANT_POOL[idx]].filter((n): n is string => !!n))).join(', ');
      const mom: Mom = {
        id: uuidv4(),
        requestor_id: requestorId,
        document_type: isLOA ? 'LOA' : 'MoM',
        client: actualClient,
        contact_person: contact,
        contact_person_email: `${first.toLowerCase()}.${last.toLowerCase()}@${actualClient.replace(/[^a-zA-Z]/g, '').toLowerCase()}.com`,
        meeting_date: momDate.split('T')[0],
        meeting_time: TIMES[idx],
        location: LOCATIONS[idx],
        purpose: PURPOSES[idx],
        discussion: DISCUSSIONS[idx](actualClient),
        agreements: AGREEMENTS[idx],
        action_items: ACTION_ITEMS[idx],
        prepared_by: reqUser?.name || 'Requestor',
        status,
        created_at: momDate,
        minutes_source: MinutesSource.TEMPLATE,
        meeting_type: MEETING_TYPES[idx],
        participants_internal: internalParticipants,
        participants_external: `${contact}${idx % 2 === 0 ? ', ' + CONTACTS[(idx + 1) % 5] : ''}`,
        custom_fields: { type_of_account: ACCOUNT_TYPES[idx], category: CATEGORIES[idx] },
      };
      getOrCreateCompanyInMemory(actualClient);
      state.moms.push(mom);
      return mom;
    };

    interface SeedClaimOpts {
      requestorId: string;
      approverId: string;
      mom: Mom;
      status: ClaimStatus;
      category: string;
      amount: number;
      createdDaysAgo: number;
      approvedDaysAgo?: number;
      processedDaysAgo?: number;
      releaseCode?: string;
      paymentMethod?: string;
      decisionOverride?: 'Approved' | 'Rejected' | 'Returned';
      approvalComment?: string;
      lineItems?: { vendor: string; category: string; amount: number; businessPurpose: string }[];
    }

    const mkClaim = (opts: SeedClaimOpts): Claim => {
      const claimId = uuidv4();
      const claimNumber = nextClaimNumber();
      const createdAt = rDate(opts.createdDaysAgo);

      opts.mom.claim_id = claimId;

      const items = opts.lineItems && opts.lineItems.length > 0
        ? opts.lineItems
        : [{ vendor: 'Max Restaurant', category: opts.category, amount: opts.amount, businessPurpose: `Reimbursement for client meeting with ${opts.mom.client}` }];

      items.forEach(item => {
        state.expenses.push({
          id: uuidv4(),
          claim_id: claimId,
          expense_date: opts.mom.meeting_date,
          vendor: item.vendor,
          category: item.category,
          amount: item.amount,
          payment_method: 'Cash',
          business_purpose: item.businessPurpose,
          receipt_url: '/receipt_placeholder.png',
          or_number: 'OR-' + Math.floor(10000 + Math.random() * 90000)
        });
      });

      const decision: 'Approved' | 'Rejected' | 'Returned' | undefined = opts.decisionOverride
        || ([ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED].includes(opts.status) ? 'Approved'
          : opts.status === ClaimStatus.REJECTED ? 'Rejected'
          : opts.status === ClaimStatus.RETURNED ? 'Returned'
          : undefined);

      const approvedAt = opts.approvedDaysAgo !== undefined ? rDate(opts.approvedDaysAgo) : createdAt;

      let currentApproverId = opts.approverId;
      const activeDelegationAtCreation = getActiveDelegation(opts.approverId, new Date(createdAt));
      if (activeDelegationAtCreation) {
        currentApproverId = activeDelegationAtCreation.delegate_id;
      }

      if (decision) {
        state.approvals.push({
          id: uuidv4(),
          claim_id: claimId,
          approver_id: currentApproverId,
          decision,
          comment: opts.approvalComment || (
            decision === 'Approved' ? 'Approved. Valid receipt attached and MOM summary completed.'
            : decision === 'Rejected' ? 'Rejected: Out-of-policy amount exceeded without pre-approval.'
            : 'Returned for Revision: Please upload a clearer receipt image showing the tax breakdown.'
          ),
          timestamp: approvedAt
        });
      }

      const isReleaseStage = [ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED].includes(opts.status);
      const processedAt = opts.processedDaysAgo !== undefined ? rDate(opts.processedDaysAgo) : approvedAt;
      const updatedAt = isReleaseStage ? processedAt : (decision ? approvedAt : createdAt);

      const claim: Claim = {
        id: claimId,
        claim_number: claimNumber,
        claim_type: 'Reimbursement',
        requestor_id: opts.requestorId,
        current_approver_id: currentApproverId,
        original_approver_id: opts.approverId,
        mom_id: opts.mom.id,
        status: opts.status,
        total_amount: opts.amount,
        approved_amount: decision === 'Approved' ? Math.min(opts.amount, REIMBURSEMENT_CAP) : undefined,
        paid_amount: isReleaseStage ? Math.min(opts.amount, REIMBURSEMENT_CAP) : undefined,
        expense_category: opts.category,
        receipt_url: '/receipt_placeholder.png',
        remarks: `Reimbursement for sales meeting with ${opts.mom.client} team.`,
        supporting_documents: 'Proposal_Draft_v1.pdf',
        release_code: isReleaseStage ? (opts.releaseCode || Math.random().toString(36).substring(2, 8).toUpperCase()) : undefined,
        // Only a still-outstanding (Ready for Claim) code needs an expiry —
        // give it one relative to processedAt so demo data never seeds an
        // already-expired code (see RELEASE_CODE_VALIDITY_DAYS).
        release_code_expires_at: opts.status === ClaimStatus.READY_FOR_CLAIM ? releaseCodeExpiryFrom(new Date(processedAt)) : undefined,
        payment_method: isReleaseStage ? 'Cash' : undefined,
        processed_by: isReleaseStage ? 'u3' : undefined,
        processing_date: isReleaseStage ? processedAt : undefined,
        approved_at: decision === 'Approved' ? approvedAt : undefined,
        created_at: createdAt,
        updated_at: updatedAt
      };

      state.claims.push(claim);

      const requestor = state.users.find(u => u.id === opts.requestorId);
      const approver = state.users.find(u => u.id === currentApproverId);
      const requestorName = requestor?.name || 'Requestor';
      const approverName = approver?.name || 'Approver';

      const comment = opts.approvalComment || (
        decision === 'Approved' ? 'Approved. Valid receipt attached and MOM summary completed.'
        : decision === 'Rejected' ? 'Rejected: Out-of-policy amount exceeded without pre-approval.'
        : 'Returned for Revision: Please upload a clearer receipt image showing the tax breakdown.'
      );

      // Status history chain
      state.statusHistories.push({
        id: uuidv4(),
        claim_id: claimId,
        old_status: '',
        new_status: ClaimStatus.DRAFT,
        changed_by: opts.requestorId,
        timestamp: createdAt
      });

      state.statusHistories.push({
        id: uuidv4(),
        claim_id: claimId,
        old_status: ClaimStatus.DRAFT,
        new_status: ClaimStatus.PENDING_APPROVAL,
        changed_by: opts.requestorId,
        timestamp: createdAt
      });

      // Submit Email
      sendEmail(
        currentApproverId,
        `Reimbursement Claim Submitted - ${claimNumber}`,
        `A reimbursement claim for PHP ${opts.amount} has been submitted by ${requestorName} for your approval.\n\nDescription: Reimbursement for sales meeting with ${opts.mom.client} team.`,
        undefined,
        { timestamp: createdAt }
      );

      if (opts.status !== ClaimStatus.PENDING_APPROVAL) {
        if (opts.status === ClaimStatus.RETURNED) {
          state.statusHistories.push({
            id: uuidv4(),
            claim_id: claimId,
            old_status: ClaimStatus.PENDING_APPROVAL,
            new_status: ClaimStatus.RETURNED,
            changed_by: currentApproverId,
            reason: comment,
            timestamp: approvedAt
          });
          sendEmail(
            opts.requestorId,
            `Reimbursement Claim Returned - ${claimNumber}`,
            `Your reimbursement claim has been returned by ${approverName} for revision.\n\nComment: ${comment}`,
            undefined,
            { timestamp: approvedAt }
          );
        } else if (opts.status === ClaimStatus.REJECTED) {
          state.statusHistories.push({
            id: uuidv4(),
            claim_id: claimId,
            old_status: ClaimStatus.PENDING_APPROVAL,
            new_status: ClaimStatus.REJECTED,
            changed_by: currentApproverId,
            reason: comment,
            timestamp: approvedAt
          });
          sendEmail(
            opts.requestorId,
            `Reimbursement Claim Rejected - ${claimNumber}`,
            `Your reimbursement claim has been rejected by ${approverName}.\n\nComment: ${comment}`,
            undefined,
            { timestamp: approvedAt }
          );
        } else {
          // APPROVED, PROCESSING, READY_FOR_CLAIM, COMPLETED
          state.statusHistories.push({
            id: uuidv4(),
            claim_id: claimId,
            old_status: ClaimStatus.PENDING_APPROVAL,
            new_status: ClaimStatus.APPROVED,
            changed_by: currentApproverId,
            reason: comment,
            timestamp: approvedAt
          });
          sendEmail(
            opts.requestorId,
            `Reimbursement Claim Approved - ${claimNumber}`,
            `Your reimbursement claim of PHP ${opts.amount} has been Approved by ${approverName} and routed to the Custodian.`,
            undefined,
            { timestamp: approvedAt }
          );

          // Mirrors the live /decide route: every custodian gets notified
          // once a claim is approved and lands in their processing queue.
          state.users.filter(u => u.role === UserRole.CUSTODIAN).forEach(custodian => {
            sendEmail(
              custodian.id,
              `Reimbursement Processing Required - ${claimNumber}`,
              `Reimbursement request ${claimNumber} submitted by ${requestorName} and approved by ${approverName} is now in your processing queue.\n\nRequired Action:\nPlease generate the Claim Code, release the payment, and mark it as Ready for Claim.`,
              undefined,
              { timestamp: approvedAt }
            );
          });

          if (opts.status !== ClaimStatus.APPROVED) {
            state.statusHistories.push({
              id: uuidv4(),
              claim_id: claimId,
              old_status: ClaimStatus.APPROVED,
              new_status: ClaimStatus.PROCESSING,
              changed_by: 'u3',
              timestamp: processedAt
            });
            sendEmail(
              opts.requestorId,
              `Reimbursement Processing Initiated - ${claimNumber}`,
              `The Custodian has begun preparing cash disbursement for your approved claim of PHP ${opts.amount}.`,
              undefined,
              { timestamp: processedAt }
            );

            if (opts.status !== ClaimStatus.PROCESSING) {
              if (opts.status === ClaimStatus.READY_FOR_CLAIM) {
                state.statusHistories.push({
                  id: uuidv4(),
                  claim_id: claimId,
                  old_status: ClaimStatus.PROCESSING,
                  new_status: ClaimStatus.READY_FOR_CLAIM,
                  changed_by: 'u3',
                  reason: 'Disbursement prepared; release code generated.',
                  timestamp: processedAt
                });
                sendEmail(
                  opts.requestorId,
                  `Reimbursement Ready to Claim - ${claimNumber}`,
                  `Your reimbursement of PHP ${opts.amount} is ready.\n\nEnter code ${claim.release_code} to confirm receipt and complete your claim.`,
                  undefined,
                  { timestamp: processedAt }
                );
              } else if (opts.status === ClaimStatus.COMPLETED) {
                state.statusHistories.push({
                  id: uuidv4(),
                  claim_id: claimId,
                  old_status: ClaimStatus.PROCESSING,
                  new_status: ClaimStatus.COMPLETED,
                  changed_by: 'u3',
                  reason: 'Funds successfully released to Requestor.',
                  timestamp: processedAt
                });
                sendEmail(
                  opts.requestorId,
                  `Reimbursement Completed - ${claimNumber}`,
                  `Your reimbursement of PHP ${opts.amount} has been successfully paid out via ${claim.payment_method || 'Cash'}.`,
                  undefined,
                  { timestamp: processedAt }
                );
              }
            }
          }
        }
      }

      return claim;
    };

    // Standard live-workflow seed records
    if (options.demoClaims) {
    // 1. Claim 1: Draft - Alice Reyes
    const mom1 = mkMom('u1', 'Ayala Land Inc', MomStatus.COMPLETED, 3);
    const claim1Id = uuidv4();
    const claim1Number = nextClaimNumber();
    mom1.claim_id = claim1Id;
    state.claims.push({
      id: claim1Id,
      claim_number: claim1Number,
      requestor_id: 'u1',
      current_approver_id: 'u2',
      original_approver_id: 'u2',
      mom_id: mom1.id,
      status: ClaimStatus.DRAFT,
      total_amount: 920.00,
      expense_category: 'Client Meals',
      receipt_url: '/receipt_placeholder.png',
      remarks: 'Dinner meeting with Ayala Land procurement team to discuss Q3 targets.',
      supporting_documents: 'Ayala_Agenda_v1.pdf',
      created_at: rDate(2),
      updated_at: rDate(2)
    });
    state.expenses.push({
      id: uuidv4(),
      claim_id: claim1Id,
      expense_date: mom1.meeting_date,
      vendor: 'Max Restaurant',
      category: 'Client Meals',
      amount: 920.00,
      payment_method: 'Cash',
      business_purpose: 'Group dinner with Ayala Land procurement staff.',
      receipt_url: '/receipt_placeholder.png'
    });
    state.statusHistories.push({
      id: uuidv4(),
      claim_id: claim1Id,
      old_status: '',
      new_status: ClaimStatus.DRAFT,
      changed_by: 'u1',
      timestamp: rDate(2)
    });

    // 2. Claim 2: Pending Approval - Alice Reyes
    const mom2 = mkMom('u1', 'SM Prime Holdings', MomStatus.COMPLETED, 4);
    mkClaim({
      requestorId: 'u1',
      approverId: 'u2',
      mom: mom2,
      status: ClaimStatus.PENDING_APPROVAL,
      category: 'Transportation',
      amount: 980.00,
      createdDaysAgo: 3
    });

    // 3. Claim 3: Returned for Revision - Eve Garcia
    const mom3 = mkMom('u5', 'JG Summit', MomStatus.COMPLETED, 6);
    mkClaim({
      requestorId: 'u5',
      approverId: 'u2',
      mom: mom3,
      status: ClaimStatus.RETURNED,
      category: 'Accommodation',
      amount: 1150.00,
      createdDaysAgo: 5,
      approvedDaysAgo: 4
    });

    // 4. Claim 4: Approved (Routed to Custodian) - Eve Garcia
    const mom4 = mkMom('u5', 'Aboitiz Equity', MomStatus.COMPLETED, 5);
    mkClaim({
      requestorId: 'u5',
      approverId: 'u2',
      mom: mom4,
      status: ClaimStatus.APPROVED,
      category: 'Transportation',
      amount: 990.00,
      createdDaysAgo: 4,
      approvedDaysAgo: 3
    });

    // 5. Claim 5: Processing (In Custodian Queue) - Frank Mendoza
    const mom5 = mkMom('u6', 'San Miguel Corp', MomStatus.COMPLETED, 7);
    mkClaim({
      requestorId: 'u6',
      approverId: 'u2',
      mom: mom5,
      status: ClaimStatus.PROCESSING,
      category: 'Client Meals',
      amount: 1250.00,
      createdDaysAgo: 6,
      approvedDaysAgo: 5,
      processedDaysAgo: 4
    });

    // 6. Claim 6: Ready for Claim (Awaiting Code Entry) - Frank Mendoza
    const mom6 = mkMom('u6', 'Megaworld Corp', MomStatus.COMPLETED, 8);
    mkClaim({
      requestorId: 'u6',
      approverId: 'u2',
      mom: mom6,
      status: ClaimStatus.READY_FOR_CLAIM,
      category: 'Client Meals',
      amount: 950.00,
      createdDaysAgo: 7,
      approvedDaysAgo: 6,
      processedDaysAgo: 5,
      releaseCode: 'CLAIM99'
    });

    // 7. Claim 7: Completed (Paid Out) - Frank Mendoza
    const mom7 = mkMom('u6', 'Robinsons Land', MomStatus.COMPLETED, 10);
    mkClaim({
      requestorId: 'u6',
      approverId: 'u2',
      mom: mom7,
      status: ClaimStatus.COMPLETED,
      category: 'Transportation',
      amount: 1450.00,
      createdDaysAgo: 9,
      approvedDaysAgo: 8,
      processedDaysAgo: 7,
      releaseCode: 'PAID777',
      paymentMethod: 'Cash'
    });

    // 8. Claim 8: Rejected - Alice Reyes
    const mom8 = mkMom('u1', 'BDO Unibank', MomStatus.COMPLETED, 12);
    mkClaim({
      requestorId: 'u1',
      approverId: 'u2',
      mom: mom8,
      status: ClaimStatus.REJECTED,
      category: 'Entertainment',
      amount: 1600.00,
      createdDaysAgo: 11,
      approvedDaysAgo: 10
    });

    // Standalone MOMs
    mkMom('u1', 'Ayala Land Inc', MomStatus.DRAFT, 2);
    mkMom('u5', 'Metrobank', MomStatus.COMPLETED, 1);
    }

    // Cash Advance & Liquidation Seed Records helpers
    const addCaHistoryWithTimestamp = (caId: string, oldStatus: string, newStatus: string, changedBy: string, reason?: string, timestamp?: string) => {
      state.statusHistories.push({
        id: uuidv4(),
        claim_id: '',
        cash_advance_id: caId,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: changedBy,
        reason,
        timestamp: timestamp || new Date().toISOString()
      });
    };

    const addLiqHistoryWithTimestamp = (liqId: string, oldStatus: string, newStatus: string, changedBy: string, reason?: string, timestamp?: string) => {
      state.statusHistories.push({
        id: uuidv4(),
        claim_id: '',
        liquidation_id: liqId,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: changedBy,
        reason,
        timestamp: timestamp || new Date().toISOString()
      });
    };

    if (options.demoCashAdvances) {
    // 1. Standalone Cash Advances
    const ca1Id = uuidv4();
    state.cashAdvances.push({
      id: ca1Id,
      requestorId: 'u1',
      amount: 3500.00,
      purpose: 'Client Lunch - Rockwell',
      approverId: 'u2',
      status: CashAdvanceStatus.DRAFT,
      createdAt: rDate(1),
    });
    addCaHistoryWithTimestamp(ca1Id, '', CashAdvanceStatus.DRAFT, 'u1', 'Draft created', rDate(1));

    const ca2Id = uuidv4();
    state.cashAdvances.push({
      id: ca2Id,
      requestorId: 'u5',
      amount: 5000.00,
      purpose: 'Business transportation to Cebu',
      approverId: 'u2',
      status: CashAdvanceStatus.SUBMITTED,
      createdAt: rDate(3),
    });
    addCaHistoryWithTimestamp(ca2Id, '', CashAdvanceStatus.DRAFT, 'u5', 'Draft created', rDate(3));
    addCaHistoryWithTimestamp(ca2Id, CashAdvanceStatus.DRAFT, CashAdvanceStatus.SUBMITTED, 'u5', 'Submitted for Approval', rDate(2));
    sendEmail(
      'u2',
      `Cash Advance Request Submitted - CADV-${ca2Id.substring(0,6)}`,
      `A Cash Advance request for PHP 5000 has been submitted by Eve Garcia for your approval.\n\nPurpose: Business transportation to Cebu`,
      undefined,
      { timestamp: rDate(2) }
    );

    const ca3Id = uuidv4();
    state.cashAdvances.push({
      id: ca3Id,
      requestorId: 'u6',
      amount: 7500.00,
      purpose: 'Client Entertainment - BGC',
      approverId: 'u2',
      status: CashAdvanceStatus.APPROVED,
      createdAt: rDate(4),
    });
    addCaHistoryWithTimestamp(ca3Id, '', CashAdvanceStatus.DRAFT, 'u6', 'Draft created', rDate(4));
    addCaHistoryWithTimestamp(ca3Id, CashAdvanceStatus.DRAFT, CashAdvanceStatus.SUBMITTED, 'u6', 'Submitted for Approval', rDate(3));
    sendEmail(
      'u2',
      `Cash Advance Request Submitted - CADV-${ca3Id.substring(0,6)}`,
      `A Cash Advance request for PHP 7500 has been submitted by Frank Mendoza for your approval.\n\nPurpose: Client Entertainment - BGC`,
      undefined,
      { timestamp: rDate(3) }
    );
    addCaHistoryWithTimestamp(ca3Id, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.APPROVED, 'u2', 'Approved', rDate(2));
    sendEmail(
      'u6',
      `Cash Advance Request Approved - CADV-${ca3Id.substring(0,6)}`,
      `Your Cash Advance request for PHP 7500 has been Approved by Bob Santos.`,
      undefined,
      { timestamp: rDate(2) }
    );

    const ca4Id = uuidv4();
    state.cashAdvances.push({
      id: ca4Id,
      requestorId: 'u11',
      amount: 12000.00,
      purpose: 'Team Building Advance',
      approverId: 'u10',
      status: CashAdvanceStatus.REJECTED,
      createdAt: rDate(5),
    });
    addCaHistoryWithTimestamp(ca4Id, '', CashAdvanceStatus.DRAFT, 'u11', 'Draft created', rDate(5));
    addCaHistoryWithTimestamp(ca4Id, CashAdvanceStatus.DRAFT, CashAdvanceStatus.SUBMITTED, 'u11', 'Submitted for Approval', rDate(4));
    sendEmail(
      'u10',
      `Cash Advance Request Submitted - CADV-${ca4Id.substring(0,6)}`,
      `A Cash Advance request for PHP 12000 has been submitted by Kyle Ocampo for your approval.\n\nPurpose: Team Building Advance`,
      undefined,
      { timestamp: rDate(4) }
    );
    addCaHistoryWithTimestamp(ca4Id, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.REJECTED, 'u10', 'Rejected due to budget constraints', rDate(3));
    sendEmail(
      'u11',
      `Cash Advance Request Rejected - CADV-${ca4Id.substring(0,6)}`,
      `Your Cash Advance request for PHP 12000 has been Rejected by Jack Herrera.\n\nComment: Rejected due to budget constraints`,
      undefined,
      { timestamp: rDate(3) }
    );

    const ca5Id = uuidv4();
    state.cashAdvances.push({
      id: ca5Id,
      requestorId: 'u12',
      amount: 6000.00,
      purpose: 'Field surveys',
      approverId: 'u10',
      status: CashAdvanceStatus.RELEASED,
      releasedBy: 'u3',
      releaseDate: rDate(2),
      releaseReference: 'REF-LIAM-CA',
      createdAt: rDate(5),
    });
    addCaHistoryWithTimestamp(ca5Id, '', CashAdvanceStatus.DRAFT, 'u12', 'Draft created', rDate(5));
    addCaHistoryWithTimestamp(ca5Id, CashAdvanceStatus.DRAFT, CashAdvanceStatus.SUBMITTED, 'u12', 'Submitted for Approval', rDate(4));
    sendEmail(
      'u10',
      `Cash Advance Request Submitted - CADV-${ca5Id.substring(0,6)}`,
      `A Cash Advance request for PHP 6000 has been submitted by Liam Villareal for your approval.\n\nPurpose: Field surveys`,
      undefined,
      { timestamp: rDate(4) }
    );
    addCaHistoryWithTimestamp(ca5Id, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.APPROVED, 'u10', 'Approved', rDate(3));
    sendEmail(
      'u12',
      `Cash Advance Request Approved - CADV-${ca5Id.substring(0,6)}`,
      `Your Cash Advance request for PHP 6000 has been Approved by Jack Herrera.`,
      undefined,
      { timestamp: rDate(3) }
    );
    addCaHistoryWithTimestamp(ca5Id, CashAdvanceStatus.APPROVED, CashAdvanceStatus.RELEASED, 'u3', 'Funds released', rDate(2));
    sendEmail(
      'u12',
      `Cash Advance Released - CADV-${ca5Id.substring(0,6)}`,
      `Your Cash Advance for PHP 6000 has been released by Carol Ramos.\n\nRelease Reference: REF-LIAM-CA\n\nPlease file your liquidation within 7 days.`,
      undefined,
      { timestamp: rDate(2) }
    );

    // 2. Cash Advances with Liquidations in different stages
    const ca6Id = uuidv4();
    state.cashAdvances.push({
      id: ca6Id,
      requestorId: 'u12',
      amount: 6000.00,
      purpose: 'Field survey Liam',
      approverId: 'u10',
      status: CashAdvanceStatus.RELEASED,
      releasedBy: 'u3',
      releaseDate: rDate(3),
      releaseReference: 'REF-LIAM-SURVEY',
      createdAt: rDate(6),
    });
    addCaHistoryWithTimestamp(ca6Id, '', CashAdvanceStatus.DRAFT, 'u12', 'Draft created', rDate(6));
    addCaHistoryWithTimestamp(ca6Id, CashAdvanceStatus.DRAFT, CashAdvanceStatus.SUBMITTED, 'u12', 'Submitted for Approval', rDate(5));
    sendEmail(
      'u10',
      `Cash Advance Request Submitted - CADV-${ca6Id.substring(0,6)}`,
      `A Cash Advance request for PHP 6000 has been submitted by Liam Villareal for your approval.\n\nPurpose: Field survey Liam`,
      undefined,
      { timestamp: rDate(5) }
    );
    addCaHistoryWithTimestamp(ca6Id, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.APPROVED, 'u10', 'Approved', rDate(4));
    sendEmail(
      'u12',
      `Cash Advance Request Approved - CADV-${ca6Id.substring(0,6)}`,
      `Your Cash Advance request for PHP 6000 has been Approved by Jack Herrera.`,
      undefined,
      { timestamp: rDate(4) }
    );
    addCaHistoryWithTimestamp(ca6Id, CashAdvanceStatus.APPROVED, CashAdvanceStatus.RELEASED, 'u3', 'Funds released', rDate(3));
    sendEmail(
      'u12',
      `Cash Advance Released - CADV-${ca6Id.substring(0,6)}`,
      `Your Cash Advance for PHP 6000 has been released by Carol Ramos.\n\nRelease Reference: REF-LIAM-SURVEY\n\nPlease file your liquidation within 7 days.`,
      undefined,
      { timestamp: rDate(3) }
    );

    const liq1Id = uuidv4();
    state.liquidations.push({
      id: liq1Id,
      cashAdvanceId: ca6Id,
      requestorId: 'u12',
      totalSpent: 0,
      varianceAmount: -6000.00,
      varianceType: LiquidationVarianceType.REFUND_DUE,
      status: LiquidationStatus.DRAFT,
      createdAt: rDate(2),
    });
    addCaHistoryWithTimestamp(ca6Id, CashAdvanceStatus.RELEASED, CashAdvanceStatus.RELEASED, 'u12', 'Liquidation Started', rDate(2));
    addLiqHistoryWithTimestamp(liq1Id, '', LiquidationStatus.DRAFT, 'u12', 'Draft Liquidation started', rDate(2));

    // Submitted Liquidation
    const ca7Id = uuidv4();
    const ca7Mom = mkMom('u1', 'Maxs Restaurant Corp', MomStatus.COMPLETED, 4);
    state.cashAdvances.push({
      id: ca7Id,
      requestorId: 'u1',
      amount: 5000.00,
      purpose: "Max's Group Lunch",
      momId: ca7Mom.id,
      approverId: 'u2',
      status: CashAdvanceStatus.RELEASED,
      releasedBy: 'u3',
      releaseDate: rDate(4),
      releaseReference: 'REF-ALICE-MAXS',
      createdAt: rDate(7),
    });
    addCaHistoryWithTimestamp(ca7Id, '', CashAdvanceStatus.DRAFT, 'u1', 'Draft created', rDate(7));
    addCaHistoryWithTimestamp(ca7Id, CashAdvanceStatus.DRAFT, CashAdvanceStatus.SUBMITTED, 'u1', 'Submitted for Approval', rDate(6));
    sendEmail(
      'u2',
      `Cash Advance Request Submitted - CADV-${ca7Id.substring(0,6)}`,
      `A Cash Advance request for PHP 5000 has been submitted by Alice Reyes for your approval.\n\nPurpose: Max's Group Lunch`,
      undefined,
      { timestamp: rDate(6) }
    );
    addCaHistoryWithTimestamp(ca7Id, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.APPROVED, 'u2', 'Approved', rDate(5));
    sendEmail(
      'u1',
      `Cash Advance Request Approved - CADV-${ca7Id.substring(0,6)}`,
      `Your Cash Advance request for PHP 5000 has been Approved by Bob Santos.`,
      undefined,
      { timestamp: rDate(5) }
    );
    addCaHistoryWithTimestamp(ca7Id, CashAdvanceStatus.APPROVED, CashAdvanceStatus.RELEASED, 'u3', 'Funds released', rDate(4));
    sendEmail(
      'u1',
      `Cash Advance Released - CADV-${ca7Id.substring(0,6)}`,
      `Your Cash Advance for PHP 5000 has been released by Carol Ramos.\n\nRelease Reference: REF-ALICE-MAXS\n\nPlease file your liquidation within 7 days.`,
      undefined,
      { timestamp: rDate(4) }
    );

    const liq2Id = uuidv4();
    state.liquidations.push({
      id: liq2Id,
      cashAdvanceId: ca7Id,
      requestorId: 'u1',
      totalSpent: 5000.00,
      varianceAmount: 0.00,
      varianceType: LiquidationVarianceType.SETTLED,
      status: LiquidationStatus.SUBMITTED,
      createdAt: rDate(3),
    });
    state.liquidationLineItems.push({
      id: uuidv4(),
      liquidationId: liq2Id,
      expense_date: ca7Mom.meeting_date,
      vendor: "Max's Restaurant",
      category: 'Client Meals',
      amount: 5000.00,
      payment_method: 'Cash',
      business_purpose: 'Lunch meeting with Maxs executive team',
      receipt_url: '/receipt_placeholder.png'
    });
    addCaHistoryWithTimestamp(ca7Id, CashAdvanceStatus.RELEASED, CashAdvanceStatus.RELEASED, 'u1', 'Liquidation Started', rDate(3));
    addCaHistoryWithTimestamp(ca7Id, CashAdvanceStatus.RELEASED, CashAdvanceStatus.RELEASED, 'u1', 'Liquidation Submitted', rDate(3));
    addLiqHistoryWithTimestamp(liq2Id, '', LiquidationStatus.DRAFT, 'u1', 'Draft Liquidation started', rDate(3));
    addLiqHistoryWithTimestamp(liq2Id, LiquidationStatus.DRAFT, LiquidationStatus.SUBMITTED, 'u1', 'Liquidation submitted for review', rDate(3));
    sendEmail(
      'u2',
      `Liquidation Submitted - LIQ-${liq2Id.substring(0,6)}`,
      `A Liquidation report has been submitted by Alice Reyes for Cash Advance CADV-${ca7Id.substring(0,6)}.\n\nTotal Spent: PHP 5000\nVariance: PHP 0 (SETTLED)`,
      undefined,
      { timestamp: rDate(3) }
    );
    }

    // --- Additional seeds for other departments ---
    const mkMomAndClaim = (reqId: string, appId: string, category: string, amt: number, status: ClaimStatus, daysAgo: number) => {
      const momId = uuidv4();
      const mom = {
        id: momId,
        requestor_id: reqId,
        client: 'Internal / Partner',
        client_name: 'Internal / Partner',
        contact_person: 'Partner Contact',
        meeting_date: rDate(daysAgo),
        minutes_source: MinutesSource.TEMPLATE,
        meeting_type: 'In-person',
        purpose: 'Departmental sync',
        discussion: 'Regular departmental meeting.',
        action_items: 'None',
        status: MomStatus.COMPLETED,
        created_at: rDate(daysAgo)
      };
      getOrCreateCompanyInMemory(mom.client);
      state.moms.push(mom);
      mkClaim({
        requestorId: reqId,
        approverId: appId,
        mom,
        status,
        category,
        amount: amt,
        createdDaysAgo: daysAgo,
        approvedDaysAgo: daysAgo > 2 ? daysAgo - 1 : undefined,
        processedDaysAgo: daysAgo > 3 ? daysAgo - 2 : undefined
      });
    };

    const mkCa = (reqId: string, appId: string, amt: number, purpose: string, status: CashAdvanceStatus, days: number) => {
      const caId = uuidv4();
      const createdDate = rDate(days + 1);
      const ca: CashAdvance = {
        id: caId,
        requestorId: reqId,
        amount: amt,
        purpose,
        approverId: appId,
        status,
        createdAt: createdDate,
      };
      state.cashAdvances.push(ca);

      const reqUser = state.users.find(u => u.id === reqId);
      const reqName = reqUser?.name || 'Requestor';
      const appUser = state.users.find(u => u.id === appId);
      const appName = appUser?.name || 'Approver';

      const actionDate = rDate(days);

      addCaHistoryWithTimestamp(caId, '', CashAdvanceStatus.DRAFT, reqId, 'Draft created', createdDate);

      if (status !== CashAdvanceStatus.DRAFT) {
        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.DRAFT, CashAdvanceStatus.SUBMITTED, reqId, 'Submitted for Approval', createdDate);
        
        const subSubject = `Cash Advance Request Submitted - CADV-${caId.substring(0,6)}`;
        const subBody = `A Cash Advance request for PHP ${amt} has been submitted by ${reqName} for your approval.\n\nPurpose: ${purpose}`;
        sendEmail(appId, subSubject, subBody, undefined, { timestamp: createdDate });
      }

      if (status === CashAdvanceStatus.APPROVED || status === CashAdvanceStatus.RELEASED) {
        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.APPROVED, appId, 'Approved', actionDate);

        const appSubject = `Cash Advance Request Approved - CADV-${caId.substring(0,6)}`;
        const appBody = `Your Cash Advance request for PHP ${amt} has been Approved by ${appName}.`;
        sendEmail(reqId, appSubject, appBody, undefined, { timestamp: actionDate });
      } else if (status === CashAdvanceStatus.REJECTED) {
        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.REJECTED, appId, 'Rejected due to policy limit', actionDate);

        const rejSubject = `Cash Advance Request Rejected - CADV-${caId.substring(0,6)}`;
        const rejBody = `Your Cash Advance request for PHP ${amt} has been Rejected by ${appName}.\n\nComment: Rejected due to policy limit`;
        sendEmail(reqId, rejSubject, rejBody, undefined, { timestamp: actionDate });
      }

      if (status === CashAdvanceStatus.RELEASED) {
        ca.releasedBy = 'u3';
        ca.releaseDate = actionDate;
        ca.releaseReference = `REF-${reqId.toUpperCase()}-${caId.substring(0,4).toUpperCase()}`;
        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.APPROVED, CashAdvanceStatus.RELEASED, 'u3', 'Funds released', actionDate);

        const relSubject = `Cash Advance Released - CADV-${caId.substring(0,6)}`;
        const relBody = `Your Cash Advance for PHP ${amt} has been released by Carol Ramos.\n\nRelease Reference: ${ca.releaseReference}\n\nPlease file your liquidation within 7 days.`;
        sendEmail(reqId, relSubject, relBody, undefined, { timestamp: actionDate });
      }
    };

    // Standard items
    if (options.demoClaims) {
    mkMomAndClaim('u13', 'u14', 'Marketing Materials', 15000, ClaimStatus.COMPLETED, 15);
    mkMomAndClaim('u13', 'u14', 'Event Hosting', 25000, ClaimStatus.PENDING_APPROVAL, 2);
    mkMomAndClaim('u15', 'u16', 'Software Licenses', 8500, ClaimStatus.PROCESSING, 5);
    mkMomAndClaim('u15', 'u16', 'Cloud Hosting', 1250, ClaimStatus.COMPLETED, 20);
    mkMomAndClaim('u15', 'u16', 'Team Lunch', 980, ClaimStatus.REJECTED, 3);
    // Guarantees the default demo login (Olivia, u15) always has a payout to
    // test the release-code confirm flow with, without hunting through seed data.
    mkMomAndClaim('u15', 'u16', 'Client Meals', 990, ClaimStatus.READY_FOR_CLAIM, 6);
    mkMomAndClaim('u17', 'u18', 'Office Supplies', 1100, ClaimStatus.READY_FOR_CLAIM, 7);
    mkMomAndClaim('u17', 'u18', 'Equipment Repair', 1350, ClaimStatus.COMPLETED, 12);
    // A few more still-undecided claims, spread across different approvers,
    // so there's real material for upcoming (not-yet-happened) review
    // meetings below -- otherwise almost nothing in this seed is still
    // awaiting a decision and the Calendar's current month looks empty.
    mkMomAndClaim('u1', 'u2', 'Client Meals', 950, ClaimStatus.PENDING_APPROVAL, 1);
    mkMomAndClaim('u6', 'u2', 'Transportation', 1250, ClaimStatus.PENDING_APPROVAL, 2);
    mkMomAndClaim('u11', 'u10', 'Transportation', 875, ClaimStatus.PENDING_APPROVAL, 3);
    mkMomAndClaim('u20', 'u14', 'Event Hosting', 1400, ClaimStatus.PENDING_APPROVAL, 1);
    }

    if (options.demoCashAdvances) {
    mkCa('u13', 'u14', 10000, 'Upcoming Expo', CashAdvanceStatus.APPROVED, 3);
    mkCa('u15', 'u16', 5000, 'Server Migration Overtime Food', CashAdvanceStatus.RELEASED, 4);
    mkCa('u17', 'u18', 20000, 'Facility Maintenance Deposit', CashAdvanceStatus.SUBMITTED, 1);
    }

    // ==========================================
    // HISTORICAL BACKFILL FOR THE PAST 12 MONTHS
    // ==========================================
    if (options.historicalBackfill) {
    const departments = [
      {
        name: 'Sales',
        requestors: ['u1', 'u5', 'u6', 'u11', 'u12'],
        approvers: ['u2', 'u7', 'u8', 'u10'],
        categories: ['Client Meals', 'Accommodation', 'Transportation'],
        vendors: ['Max Restaurant', 'Grab', 'Makati Diamond Residences', 'Mary Grace Cafe', 'Globe Telecom'],
        clients: ['SM Prime Holdings', 'PLDT Inc', 'Jollibee Foods Corp', 'Bank of the Philippine Islands', 'Globe Telecom', 'San Miguel Corporation', 'Meralco', 'BDO Unibank']
      },
      {
        name: 'Marketing',
        requestors: ['u13', 'u20', 'u21'],
        approvers: ['u14'],
        categories: ['Marketing Materials', 'Event Hosting', 'Advertising', 'Client Meals'],
        vendors: ['Print Central', 'Hotel Del Rio', 'Facebook Ads', 'Google Ads', 'Starbucks'],
        clients: ['Creative Agency', 'Partner Promo Group', 'Media Corp']
      },
      {
        name: 'Engineering',
        requestors: ['u15'],
        approvers: ['u16'],
        categories: ['Software Licenses', 'Cloud Hosting', 'Team Lunch', 'Technical Training'],
        vendors: ['Amazon Web Services', 'Microsoft Azure', 'Atlassian', 'JetBrains', 'GrabFood'],
        clients: ['Internal Operations', 'Beta Testing Corp', 'DevOps Consultants']
      },
      {
        name: 'Operations',
        requestors: ['u17'],
        approvers: ['u18'],
        categories: ['Office Supplies', 'Equipment Repair', 'Courier Services', 'Utility Bills'],
        vendors: ['National Bookstore', 'Lalamove', 'Meralco Office', 'PLDT Enterprise', 'Tech Support PH'],
        clients: ['Headquarters', 'Cebu Branch Office', 'Manila Warehouse']
      }
    ];

    const getDaysAgo = (year: number, month: number, day: number) => {
      const target = new Date(year, month - 1, day, 12, 0, 0);
      const now = new Date();
      const nowNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
      const diffMs = nowNoon.getTime() - target.getTime();
      return Math.round(diffMs / (1000 * 60 * 60 * 24));
    };

    const mkHistoricalCa = (
      reqId: string,
      appId: string,
      amt: number,
      purpose: string,
      status: CashAdvanceStatus,
      daysAgoCreated: number,
      isCompleted: boolean,
      category: string,
      vendor: string,
      client: string
    ) => {
      const caId = uuidv4();
      const createdDate = rDate(daysAgoCreated);
      const ca: CashAdvance = {
        id: caId,
        requestorId: reqId,
        amount: amt,
        purpose,
        approverId: appId,
        status,
        createdAt: createdDate,
      };
      state.cashAdvances.push(ca);

      const reqUser = state.users.find(u => u.id === reqId);
      const reqName = reqUser?.name || 'Requestor';
      const appUser = state.users.find(u => u.id === appId);
      const appName = appUser?.name || 'Approver';

      
      // Draft
      addCaHistoryWithTimestamp(caId, '', CashAdvanceStatus.DRAFT, reqId, 'Draft created', createdDate);

      // Submitted
      addCaHistoryWithTimestamp(caId, CashAdvanceStatus.DRAFT, CashAdvanceStatus.SUBMITTED, reqId, 'Submitted for Approval', createdDate);
      const subSubject = `Cash Advance Request Submitted - CADV-${caId.substring(0,6)}`;
      const subBody = `A Cash Advance request for PHP ${amt} has been submitted by ${reqName} for your approval.\n\nPurpose: ${purpose}`;
      sendEmail(appId, subSubject, subBody, undefined, { timestamp: createdDate });

      const approvedDaysAgo = daysAgoCreated - (1 + Math.floor(Math.random() * 2));
      const approvedDate = rDate(approvedDaysAgo);

      if (status === CashAdvanceStatus.REJECTED) {
        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.REJECTED, appId, 'Rejected due to budget constraints', approvedDate);
        const rejSubject = `Cash Advance Request Rejected - CADV-${caId.substring(0,6)}`;
        const rejBody = `Your Cash Advance request for PHP ${amt} has been Rejected by ${appName}.\n\nComment: Rejected due to budget constraints`;
        sendEmail(reqId, rejSubject, rejBody, undefined, { timestamp: approvedDate });
        return;
      }

      // Approved
      addCaHistoryWithTimestamp(caId, CashAdvanceStatus.SUBMITTED, CashAdvanceStatus.APPROVED, appId, 'Approved', approvedDate);
      const appSubject = `Cash Advance Request Approved - CADV-${caId.substring(0,6)}`;
      const appBody = `Your Cash Advance request for PHP ${amt} has been Approved by ${appName}.`;
      sendEmail(reqId, appSubject, appBody, undefined, { timestamp: approvedDate });

      // Released
      const releasedDaysAgo = approvedDaysAgo - (1 + Math.floor(Math.random() * 2));
      const releasedDate = rDate(releasedDaysAgo);
      
      ca.releasedBy = 'u3';
      ca.releaseDate = releasedDate;
      ca.releaseReference = `REF-${reqId.toUpperCase()}-${caId.substring(0,4).toUpperCase()}`;
      addCaHistoryWithTimestamp(caId, CashAdvanceStatus.APPROVED, CashAdvanceStatus.RELEASED, 'u3', 'Funds released', releasedDate);

      const relSubject = `Cash Advance Released - CADV-${caId.substring(0,6)}`;
      const relBody = `Your Cash Advance for PHP ${amt} has been released by Carol Ramos.\n\nRelease Reference: ${ca.releaseReference}\n\nPlease file your liquidation within 7 days.`;
      sendEmail(reqId, relSubject, relBody, undefined, { timestamp: releasedDate });

      // Liquidation
      if (status === CashAdvanceStatus.LIQUIDATED) {
        const liqStartedDaysAgo = releasedDaysAgo - (1 + Math.floor(Math.random() * 2));
        const liqStartedDate = rDate(liqStartedDaysAgo);

        const liqSubmittedDaysAgo = liqStartedDaysAgo - (1 + Math.floor(Math.random() * 2));
        const liqSubmittedDate = rDate(liqSubmittedDaysAgo);

        const liqClosedDaysAgo = liqSubmittedDaysAgo - (1 + Math.floor(Math.random() * 2));
        const liqClosedDate = rDate(liqClosedDaysAgo);

        const liqId = uuidv4();
        const totalSpent = amt;
        
        state.liquidations.push({
          id: liqId,
          cashAdvanceId: caId,
          requestorId: reqId,
          totalSpent,
          varianceAmount: 0.00,
          varianceType: LiquidationVarianceType.SETTLED,
          status: LiquidationStatus.CLOSED,
      createdAt: liqStartedDate,
        });

        state.liquidationLineItems.push({
          id: uuidv4(),
          liquidationId: liqId,
          expense_date: liqStartedDate.split('T')[0],
          vendor,
          category,
          amount: totalSpent,
          payment_method: 'Cash',
          business_purpose: `Liquidation of CADV-${caId.substring(0, 6)}: ${purpose}`,
          receipt_url: '/receipt_placeholder.png'
        });

        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.RELEASED, CashAdvanceStatus.RELEASED, reqId, 'Liquidation Started', liqStartedDate);
        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.RELEASED, CashAdvanceStatus.RELEASED, reqId, 'Liquidation Submitted', liqSubmittedDate);
        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.RELEASED, CashAdvanceStatus.RELEASED, appId, 'Liquidation Reviewed', liqClosedDate);
        addCaHistoryWithTimestamp(caId, CashAdvanceStatus.RELEASED, CashAdvanceStatus.LIQUIDATED, 'u3', 'Closed (Refund Collected)', liqClosedDate);

        addLiqHistoryWithTimestamp(liqId, '', LiquidationStatus.DRAFT, reqId, 'Draft Liquidation started', liqStartedDate);
        addLiqHistoryWithTimestamp(liqId, LiquidationStatus.DRAFT, LiquidationStatus.SUBMITTED, reqId, 'Liquidation submitted for review', liqSubmittedDate);
        
        const liqSubSubject = `Liquidation Submitted - LIQ-${liqId.substring(0,6)}`;
        const liqSubBody = `A Liquidation report has been submitted by ${reqName} for Cash Advance CADV-${caId.substring(0,6)}.\n\nTotal Spent: PHP ${totalSpent}\nVariance: PHP 0 (SETTLED)`;
        sendEmail(appId, liqSubSubject, liqSubBody, undefined, { timestamp: liqSubmittedDate });

        addLiqHistoryWithTimestamp(liqId, LiquidationStatus.SUBMITTED, LiquidationStatus.CLOSED, appId, 'Approved and Closed.', liqClosedDate);
        
        const liqCloSubject = `Liquidation Closed (Refund Collected) - LIQ-${liqId.substring(0,6)}`;
        const liqCloBody = `Your Liquidation has been marked as Closed. Custodian Carol Ramos has verified collection of your refund.`;
        sendEmail(reqId, liqCloSubject, liqCloBody, undefined, { timestamp: liqClosedDate });
      }
    };

    const now = new Date();
    const deptStates = departments.map(d => ({
      ...d,
      reqIdx: 0,
      appIdx: 0,
      totalItems: 0
    }));

    for (let monthOffset = 12; monthOffset >= 1; monthOffset--) {
      const targetMonthDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 15);
      const year = targetMonthDate.getFullYear();
      const month = targetMonthDate.getMonth() + 1;

      for (const ds of deptStates) {
        const count = 8 + Math.floor(Math.random() * 4); // 8, 9, 10, or 11
        for (let i = 0; i < count; i++) {
          const createdDay = 1 + Math.floor(Math.random() * 28);
          const daysAgoCreated = getDaysAgo(year, month, createdDay);

          if (daysAgoCreated <= 20) {
            continue;
          }

          ds.totalItems++;

          // Deterministically assign 1 out of 7 items to Approver (approx 14.3%)
          const isApproverSubmitter = (ds.totalItems % 7 === 0);

          // Deterministically make every 4th item a Cash Advance, otherwise Claim (75% Claim, 25% CADV)
          const isClaim = (ds.totalItems % 4 !== 0);
          
          const isCompleted = Math.random() < 0.85;

          let reqId: string;
          let appId: string;

          if (isApproverSubmitter) {
            reqId = ds.approvers[ds.appIdx % ds.approvers.length];
            ds.appIdx++;

            const reqUser = state.users.find(u => u.id === reqId);
            appId = reqUser?.reports_to || 'u19';
          } else {
            reqId = ds.requestors[ds.reqIdx % ds.requestors.length];
            ds.reqIdx++;

            const reqUser = state.users.find(u => u.id === reqId);
            appId = reqUser?.reports_to || ds.approvers[0];
          }

          const category = ds.categories[Math.floor(Math.random() * ds.categories.length)];
          const vendor = ds.vendors[Math.floor(Math.random() * ds.vendors.length)];
          const client = ds.clients[Math.floor(Math.random() * ds.clients.length)];

          // Keep demo reimbursements representative of the policy: most claims
          // sit around the PHP 1,000 reimbursable ceiling, with a small number
          // filed above it to demonstrate the non-blocking cap.
          let amount = 650 + Math.floor(Math.random() * 750);
          if (Math.random() < 0.12) {
            amount = 1500 + Math.floor(Math.random() * 1500);
          }

          if (isClaim) {
            const momDaysAgo = daysAgoCreated + 1;
            const mom = mkMom(reqId, client, MomStatus.COMPLETED, momDaysAgo);

            const approvedDaysAgo = daysAgoCreated - (1 + Math.floor(Math.random() * 2));
            const processedDaysAgo = approvedDaysAgo - (1 + Math.floor(Math.random() * 2));
            const status = isCompleted ? ClaimStatus.COMPLETED : ClaimStatus.REJECTED;

            mkClaim({
              requestorId: reqId,
              approverId: appId,
              mom,
              status,
              category,
              amount,
              createdDaysAgo: daysAgoCreated,
              approvedDaysAgo: isCompleted || status === ClaimStatus.REJECTED ? approvedDaysAgo : undefined,
              processedDaysAgo: isCompleted ? processedDaysAgo : undefined,
              releaseCode: isCompleted ? Math.random().toString(36).substring(2, 8).toUpperCase() : undefined,
              paymentMethod: isCompleted ? 'Cash' : undefined,
              approvalComment: status === ClaimStatus.REJECTED ? 'Rejected: Budget exceeds departmental quota for this category.' : undefined
            });
          } else {
            const status = isCompleted ? CashAdvanceStatus.LIQUIDATED : CashAdvanceStatus.REJECTED;
            const purpose = `${category} for ${client}`;
            mkHistoricalCa(reqId, appId, amount, purpose, status, daysAgoCreated, isCompleted, category, vendor, client);
          }
        }
      }
    }
    }

    state.claimCounter = seedCounter;
    // Seeded claims never call persistClaim (they're in-memory demo data
    // only), but a live-database demo still allocates real claim numbers
    // from the sequence below — keep it past the seeded range so a real
    // submission can't display the same REIM-YYYY-NNNNNN as seeded data.
    if (isDbConfigured()) {
      try {
        await syncClaimNumberSequenceFloor(seedCounter);
      } catch (err) {
        console.error('[db] Could not sync claim_number_seq after seeding:', err);
      }
    }

    if (options.reviewMeetings) {
      const RM_TIMES = ['09:00', '10:30', '13:00', '14:30', '16:00'];
      const RM_DECLINE_REASONS = [
        'Requestor unavailable at proposed slot, awaiting reschedule.',
        'Approver has a scheduling conflict, needs a new time.',
        'Client meeting ran long, review pushed to another day.'
      ];
      // Pre-meeting statuses (anything but Confirmed) only make sense for a
      // meeting that hasn't happened yet -- nothing in the live system ever
      // sets Completed, so once the date is in the past, Confirmed is the
      // only outcome that stays coherent with an already-decided claim.
      const UPCOMING_STATUS_CYCLE = [
        ReviewMeetingStatus.CONFIRMED,
        ReviewMeetingStatus.PENDING_CONFIRMATION,
        ReviewMeetingStatus.CONFIRMED,
        ReviewMeetingStatus.DECLINE_REQUESTED
      ];
      const rmCandidates = state.claims.filter(c => c.status !== ClaimStatus.DRAFT);
      const rmCount = Math.min(16, rmCandidates.length);
      const rmStep = rmCount > 0 ? Math.max(1, Math.floor(rmCandidates.length / rmCount)) : 0;

      let upcomingAssigned = 0;

      for (let i = 0; i < rmCount; i++) {
        const claim = rmCandidates[i * rmStep];
        if (!claim) continue;

        const alreadyHasMeeting = state.reviewMeetings.some(rm => rm.claim_id === claim.id);
        if (alreadyHasMeeting) continue;

        // Only a claim still awaiting a decision can coherently have a
        // review meeting that hasn't happened yet; anything already
        // Approved/Rejected/Processing/etc. necessarily had its meeting
        // (if any) already, and that meeting can only have gone one way.
        const isUndecided = claim.status === ClaimStatus.PENDING_APPROVAL;

        let meetingDate: string;
        let rmStatus: ReviewMeetingStatus;

        if (isUndecided) {
          upcomingAssigned++;
          const daysAhead = upcomingAssigned * 2 - 1; // 1, 3, 5, 7... days out
          meetingDate = rDate(-daysAhead).split('T')[0];
          rmStatus = UPCOMING_STATUS_CYCLE[upcomingAssigned % UPCOMING_STATUS_CYCLE.length];
        } else {
          const claimAgeDays = Math.max(1, Math.round((Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60 * 24)));
          const meetingDaysAgo = Math.max(1, claimAgeDays - 1);
          meetingDate = rDate(meetingDaysAgo).split('T')[0];
          rmStatus = ReviewMeetingStatus.CONFIRMED;
        }

        const rm: ReviewMeeting = {
          id: uuidv4(),
          claim_id: claim.id,
          requestor_id: claim.requestor_id,
          approver_id: claim.current_approver_id,
          meeting_date: meetingDate,
          meeting_time: RM_TIMES[i % RM_TIMES.length],
          status: rmStatus,
          created_at: claim.created_at
        };
        if (rmStatus === ReviewMeetingStatus.DECLINE_REQUESTED) {
          rm.decline_reason = RM_DECLINE_REASONS[i % RM_DECLINE_REASONS.length];
        }
        state.reviewMeetings.push(rm);
      }
    }

    if (options.supportRequests) {
      const SR_TICKETS: { subject: string; description: string; priority: SupportRequestPriority }[] = [
        { subject: 'Receipt upload failing on mobile', description: 'Every time I try to attach a receipt photo from my phone, the upload spins forever and never completes. Tried on both WiFi and mobile data.', priority: SupportRequestPriority.HIGH },
        { subject: 'Cannot find my company in the MOM dropdown', description: 'The client I met with, Ayala Land Inc, does not show up in the Company Name dropdown even though I have submitted claims for them before.', priority: SupportRequestPriority.MEDIUM },
        { subject: 'Wrong approver assigned to my claim', description: 'My claim was routed to a manager I do not report to. I think the org chart may be out of date for my department.', priority: SupportRequestPriority.HIGH },
        { subject: 'Release code email never arrived', description: 'My claim moved to For Processing three days ago but I never received the release code email for the Custodian.', priority: SupportRequestPriority.MEDIUM },
        { subject: 'Typo in expense category list', description: '"Accomodation" is misspelled in the expense category dropdown, should be "Accommodation".', priority: SupportRequestPriority.LOW },
        { subject: 'Need help understanding variance on my liquidation', description: 'My liquidation shows a variance amount that does not match my own math. Can someone walk me through how it is calculated?', priority: SupportRequestPriority.MEDIUM },
        { subject: 'Delegation request stuck on Pending', description: 'I set up a delegate for while I am on leave next week but it still shows Pending. Does my delegate need to do something on their end?', priority: SupportRequestPriority.LOW },
        { subject: 'Cash advance amount field rejecting decimals', description: 'Typing 5000.50 into the Cash Advance amount field gets rejected as invalid. Whole numbers work fine.', priority: SupportRequestPriority.HIGH },
        { subject: 'Review meeting time looks wrong after reschedule', description: 'I rescheduled my review meeting and the new time shown on my dashboard does not match what I picked in the form.', priority: SupportRequestPriority.LOW },
        { subject: 'Dashboard totals do not match Transaction History', description: 'The Approved total on my dashboard is higher than what I count when I filter Transaction History to Approved status for the same period.', priority: SupportRequestPriority.MEDIUM }
      ];

      const requestorPool = state.users.filter(u => u.role !== UserRole.ADMIN).map(u => u.id);
      const adminPool = state.users.filter(u => u.role === UserRole.ADMIN).map(u => u.id);
      const srStatusCycle = [SupportRequestStatus.RESOLVED, SupportRequestStatus.IN_PROGRESS, SupportRequestStatus.OPEN];

      SR_TICKETS.forEach((ticket, i) => {
        if (requestorPool.length === 0) return;
        const reqId = requestorPool[i % requestorPool.length];
        const createdDaysAgo = 3 + i * 2;
        const createdAt = rDate(createdDaysAgo);
        const srStatus = srStatusCycle[i % srStatusCycle.length];
        const assignedAdmin = srStatus !== SupportRequestStatus.OPEN && adminPool.length > 0
          ? adminPool[i % adminPool.length]
          : undefined;
        const updatedAt = srStatus === SupportRequestStatus.OPEN ? createdAt : rDate(Math.max(0, createdDaysAgo - 1));

        const sr: SupportRequest = {
          id: uuidv4(),
          requestor_id: reqId,
          subject: ticket.subject,
          description: ticket.description,
          priority: ticket.priority,
          status: srStatus,
          assigned_admin_id: assignedAdmin,
          created_at: createdAt,
          updated_at: updatedAt
        };
        state.supportRequests.push(sr);

        if (srStatus !== SupportRequestStatus.OPEN && assignedAdmin) {
          state.supportMessages.push({
            id: uuidv4(),
            request_id: sr.id,
            sender_id: assignedAdmin,
            message: srStatus === SupportRequestStatus.RESOLVED
              ? "Thanks for flagging this - I've looked into it and this should be resolved now. Let me know if you still run into it."
              : 'Thanks for the report, looking into this now - will update you shortly.',
            timestamp: updatedAt
          });
          if (srStatus === SupportRequestStatus.RESOLVED) {
            state.supportMessages.push({
              id: uuidv4(),
              request_id: sr.id,
              sender_id: reqId,
              message: 'Confirmed, working fine on my end now. Thank you!',
              timestamp: rDate(Math.max(0, createdDaysAgo - 2))
            });
          }
        }
      });
    }
  }
