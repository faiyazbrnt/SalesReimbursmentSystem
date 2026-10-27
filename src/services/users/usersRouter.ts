import { v4 as uuidv4 } from 'uuid';
import { ClaimStatus, type Claim, UserRole, type User } from '../../lib/db/serverTypes';
import { persistClaim } from '../../lib/db/coreLoopRepo';
import { syncUsersToDb, deleteUserFromDb } from '../../lib/db/usersRepo';
import { state } from '../../server/state';
import { addUserHistory } from '../../server/services/history';
import { detectStaleApprovers, recalcApprovalAuthority } from '../../server/services/hierarchy';

type ErrorBody = { error: string };
type Result<T> = { status: number; body: T };
export type CreateUserBody = {
  name: string;
  email: string;
  role: UserRole;
  department: string;
  job_title?: string;
  reports_to?: string | null;
  employment_status?: 'Active' | 'Inactive';
};
type UpdateUserBody = Partial<Pick<User, 'role' | 'department' | 'job_title' | 'reports_to' | 'employment_status' | 'can_approve_reimbursements'>> & { confirmOrphan?: boolean };
function userFor(id: string | null) { return state.users.find((user) => user.id === id || user.entra_object_id === id || user.user_principal_name === id); }

export const wouldCreateCycle = (userId: string, candidateManagerId: string): boolean => { if (candidateManagerId === userId) return true; let currentId: string | null = candidateManagerId; const visited = new Set<string>(); while (currentId) { if (currentId === userId) return true; if (visited.has(currentId)) return false; visited.add(currentId); currentId = state.users.find((user) => user.id === currentId)?.reports_to ?? null; } return false; };
export function listUsers(userId: string | null): Result<User[] | ErrorBody> { return userFor(userId) ? { status: 200, body: state.users } : { status: 401, body: { error: 'Unauthorized' } }; }

export async function createUser(
  userId: string | null,
  body: CreateUserBody
): Promise<Result<{ user: User } | ErrorBody>> {
  const admin = userFor(userId);
  if (!admin || admin.role !== UserRole.ADMIN) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  const { name, email, role, department, job_title, reports_to, employment_status } = body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return { status: 400, body: { error: 'Name is required.' } };
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return { status: 400, body: { error: 'Email is required.' } };
  }

  const trimmedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { status: 400, body: { error: 'Please enter a valid email address.' } };
  }

  const emailExists = state.users.some(
    (u) => (u.email || '').toLowerCase() === trimmedEmail
  );
  if (emailExists) {
    return { status: 400, body: { error: 'A user with this email already exists.' } };
  }

  if (!role || !Object.values(UserRole).includes(role)) {
    return { status: 400, body: { error: 'Invalid user role.' } };
  }

  if (!department || typeof department !== 'string' || !department.trim()) {
    return { status: 400, body: { error: 'Department is required.' } };
  }

  let managerId: string | null = null;
  if (reports_to) {
    const manager = state.users.find((u) => u.id === reports_to);
    if (!manager) {
      return { status: 400, body: { error: 'Reporting manager not found.' } };
    }
    managerId = reports_to;
  }

  const newId = `u_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
  const isApprover = role === UserRole.APPROVER;

  const newUser: User = {
    id: newId,
    name: name.trim(),
    email: trimmedEmail,
    role,
    department: department.trim(),
    job_title: job_title?.trim() || undefined,
    reports_to: managerId,
    employment_status: employment_status === 'Inactive' ? 'Inactive' : 'Active',
    can_approve_reimbursements: isApprover,
    entra_object_id: `fake-oid-${newId}`,
    user_principal_name: trimmedEmail,
    notification_prefs: {
      claimUpdates: { inApp: true, email: true },
      delegations: { inApp: true, email: true },
    },
  };

  state.users.push(newUser);

  if (managerId) {
    recalcApprovalAuthority(managerId);
  }

  addUserHistory(
    newUser.id,
    '(none)',
    newUser.employment_status || 'Active',
    admin.id,
    `Admin created user account for ${newUser.name} (${newUser.role})`
  );

  try {
    await syncUsersToDb(state.users);
  } catch (error) {
    console.error('[db] Could not persist new user to Postgres:', error);
  }

  return { status: 201, body: { user: newUser } };
}

export async function deleteUser(
  userId: string | null,
  targetId: string
): Promise<Result<{ success: boolean; message: string } | ErrorBody>> {
  const admin = userFor(userId);
  if (!admin || admin.role !== UserRole.ADMIN) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  const target = state.users.find((u) => u.id === targetId);
  if (!target) {
    return { status: 404, body: { error: 'User not found' } };
  }

  if (target.id === admin.id) {
    return { status: 400, body: { error: 'You cannot delete your own account.' } };
  }

  const directReports = state.users.filter((u) => u.reports_to === target.id);
  if (directReports.length > 0) {
    const names = directReports.map((u) => u.name).join(', ');
    return {
      status: 400,
      body: {
        error: `Cannot delete ${target.name}: this user has ${directReports.length} direct report${directReports.length > 1 ? 's' : ''} (${names}). Please reassign them before deleting.`,
      },
    };
  }

  const hasClaims = state.claims.some(
    (c) =>
      c.requestor_id === target.id ||
      c.current_approver_id === target.id ||
      c.original_approver_id === target.id
  );
  const hasApprovals = state.approvals.some((a) => a.approver_id === target.id);
  const hasCashAdvances = state.cashAdvances?.some(
    (ca) =>
      ca.requestorId === target.id ||
      ca.approverId === target.id ||
      ca.releasedBy === target.id
  );
  const hasReviewMeetings = state.reviewMeetings?.some(
    (rm) => rm.requestor_id === target.id || rm.approver_id === target.id
  );

  if (hasClaims || hasApprovals || hasCashAdvances || hasReviewMeetings) {
    return {
      status: 400,
      body: {
        error: `Cannot delete ${target.name}: this user is associated with existing reimbursement claims or transactions. Set their employment status to Inactive instead to preserve audit integrity.`,
      },
    };
  }

  const managerId = target.reports_to;

  const userIndex = state.users.findIndex((u) => u.id === target.id);
  if (userIndex !== -1) {
    state.users.splice(userIndex, 1);
  }

  state.delegations = (state.delegations || []).filter(
    (d) => d.approver_id !== target.id && d.delegate_id !== target.id
  );
  state.statusHistories = state.statusHistories.filter(
    (sh) => sh.user_id !== target.id
  );

  if (managerId) {
    recalcApprovalAuthority(managerId);
  }

  try {
    await deleteUserFromDb(target.id);
    await syncUsersToDb(state.users);
  } catch (error) {
    console.error('[db] Could not delete user from Postgres:', error);
  }

  return {
    status: 200,
    body: { success: true, message: `User ${target.name} deleted successfully.` },
  };
}

export async function updateUser(userId: string | null, targetId: string, body: UpdateUserBody): Promise<Result<{ user: User; changed: string[] } | ErrorBody | { error: string; message: string; reportees: Array<{ id: string; name: string }> }>> {
  const admin = userFor(userId); if (!admin || admin.role !== UserRole.ADMIN) return { status: 403, body: { error: 'Forbidden' } };
  const target = state.users.find((user) => user.id === targetId); if (!target) return { status: 404, body: { error: 'User not found' } };
  const { role, department, job_title, reports_to, confirmOrphan, employment_status, can_approve_reimbursements } = body;
  if (role !== undefined && !Object.values(UserRole).includes(role)) return { status: 400, body: { error: 'Invalid user role.' } };
  if (target.id === admin.id && role !== undefined && role !== UserRole.ADMIN) return { status: 400, body: { error: 'You cannot remove your own Admin role.' } };
  if (reports_to !== undefined && reports_to !== null) { if (reports_to === target.id) return { status: 400, body: { error: 'A user cannot report to themselves.' } }; if (wouldCreateCycle(target.id, reports_to)) return { status: 400, body: { error: 'This change would create a circular reporting chain.' } }; }
  if (role !== undefined && role !== target.role && target.role === UserRole.APPROVER && role !== UserRole.APPROVER) { const reportees = state.users.filter((user) => user.reports_to === target.id); if (reportees.length && !confirmOrphan) return { status: 409, body: { error: 'orphan_warning', message: `${target.name} still has ${reportees.length} direct report${reportees.length > 1 ? 's' : ''} (${reportees.map((user) => user.name).join(', ')}) who will be left without a valid approver. Confirm to proceed anyway.`, reportees: reportees.map(({ id, name }) => ({ id, name })) } }; }
  const changed: string[] = []; const staleFlaggedClaims: Claim[] = [];
  if (role !== undefined && role !== target.role) { addUserHistory(target.id, target.role, role, admin.id, `Changed ${target.name}'s role`); target.role = role; changed.push('role'); if (role !== UserRole.APPROVER && target.can_approve_reimbursements) { addUserHistory(target.id, 'true', 'false', admin.id, `Approval authority revoked — ${target.name} is no longer an Approver`); target.can_approve_reimbursements = false; } }
  if (department !== undefined && department !== target.department) { addUserHistory(target.id, target.department, department, admin.id, `Changed ${target.name}'s department`); target.department = department; changed.push('department'); }
  if (job_title !== undefined && job_title !== target.job_title) { addUserHistory(target.id, target.job_title || '(none)', job_title || '(none)', admin.id, `Changed ${target.name}'s job title`); target.job_title = job_title; changed.push('job_title'); }
  if (reports_to !== undefined && reports_to !== target.reports_to) { const oldManagerId = target.reports_to; const oldManagerName = state.users.find((user) => user.id === oldManagerId)?.name || '(none)'; const newManagerName = reports_to ? state.users.find((user) => user.id === reports_to)?.name || reports_to : '(none)'; addUserHistory(target.id, oldManagerName, newManagerName, admin.id, `Changed ${target.name}'s reporting manager`); target.reports_to = reports_to; changed.push('reports_to'); recalcApprovalAuthority(oldManagerId); recalcApprovalAuthority(reports_to); await detectStaleApprovers(target.id, oldManagerId, reports_to, admin.id); }
  if (employment_status !== undefined && employment_status !== target.employment_status) { addUserHistory(target.id, target.employment_status || 'Active', employment_status, admin.id, `Changed ${target.name}'s employment status`); target.employment_status = employment_status; changed.push('employment_status'); if (employment_status === 'Inactive') state.claims.forEach((claim) => { if (claim.current_approver_id === target.id && claim.status === ClaimStatus.PENDING_APPROVAL && !claim.approver_stale_since) { claim.approver_stale_since = new Date().toISOString(); claim.pending_transfer_to = null; claim.approver_stale_reason = `${target.name} is now marked Inactive.`; staleFlaggedClaims.push(claim); } }); }
  if (can_approve_reimbursements !== undefined && can_approve_reimbursements !== target.can_approve_reimbursements) { if (can_approve_reimbursements && target.role !== UserRole.APPROVER) return { status: 400, body: { error: `Only Approvers can be granted approval authority. ${target.name} is currently ${target.role} — change their role first.` } }; addUserHistory(target.id, String(target.can_approve_reimbursements), String(can_approve_reimbursements), admin.id, `Admin override: ${target.name}'s approval authority`); target.can_approve_reimbursements = can_approve_reimbursements; changed.push('can_approve_reimbursements'); }
  try { await syncUsersToDb(state.users); for (const claim of staleFlaggedClaims) await persistClaim(claim); } catch (error) { console.error('[db] Could not persist user/claim changes to Postgres:', error); }
  return { status: 200, body: { user: target, changed } };
}
