import { normalizeLegacyRole } from '../legacyRole';
import type {
  status_histories as StatusHistoryRow,
  users as UserRow,
} from '../../generated/prisma/client';
import { serverEnv } from '../../config/env';
import type { StatusHistory, User } from './serverTypes';
import { getDb } from './index';

export const isDbConfigured = () => !!serverEnv.databaseUrl;

function toRow(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeLegacyRole(user.role) as User['role'],
    department: user.department,
    job_title: user.job_title ?? null,
    reports_to: user.reports_to ?? null,
    employment_status: user.employment_status ?? 'Active',
    can_approve_reimbursements: user.can_approve_reimbursements ?? false,
    notification_prefs: user.notification_prefs
      ? JSON.stringify(user.notification_prefs)
      : null,
    avatar_url: user.avatar_url ?? null,
    entra_object_id: user.entra_object_id ?? null,
    user_principal_name: user.user_principal_name ?? null,
  };
}

function fromRow(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: normalizeLegacyRole(row.role) as User['role'],
    department: row.department,
    job_title: row.job_title ?? undefined,
    reports_to: row.reports_to,
    employment_status: (row.employment_status ?? undefined) as User['employment_status'],
    can_approve_reimbursements: row.can_approve_reimbursements ?? undefined,
    notification_prefs: row.notification_prefs
      ? JSON.parse(row.notification_prefs)
      : undefined,
    avatar_url: row.avatar_url ?? undefined,
    entra_object_id: row.entra_object_id ?? undefined,
    user_principal_name: row.user_principal_name ?? undefined,
  };
}

export async function loadUsersFromDb(): Promise<User[]> {
  if (!isDbConfigured()) return [];
  return (await getDb().users.findMany()).map(fromRow);
}

/**
 * Two passes keep the self-referencing reports_to foreign key valid even when
 * a manager appears after their report in the input array.
 */
export async function syncUsersToDb(users: User[]): Promise<void> {
  if (!isDbConfigured() || users.length === 0) return;

  await getDb().$transaction(async (tx) => {
    // A user save may run during rollout before the SQL migration. Preserve the
    // original role before normalized users are written back to PostgreSQL.
    const approverIds = users.filter(user => normalizeLegacyRole(user.role) === 'Approver').map(user => user.id);
    if (approverIds.length) {
      const legacyUsers = await tx.users.findMany({ where: { id: { in: approverIds }, role: 'Finance' } });
      if (legacyUsers.length) await tx.status_histories.createMany({
        data: legacyUsers.map(user => ({
          id: `phase4-finance-role:${user.id}`, user_id: user.id,
          old_status: 'Finance', new_status: 'Approver', changed_by: user.id,
          reason: 'System migration (phase 4): Finance responsibilities transferred to Approver.',
          timestamp: new Date(),
        })),
        skipDuplicates: true,
      });
    }
    for (const user of users) {
      const row = { ...toRow(user), reports_to: null };
      await tx.users.upsert({
        where: { id: row.id },
        create: row,
        update: row,
      });
    }

    for (const user of users) {
      if (user.reports_to) {
        await tx.users.update({
          where: { id: user.id },
          data: { reports_to: user.reports_to },
        });
      }
    }
  });
}

export async function clearUsersInDb(): Promise<void> {
  if (!isDbConfigured()) return;
  await getDb().users.deleteMany();
}

export async function deleteUserFromDb(userId: string): Promise<void> {
  if (!isDbConfigured()) return;
  await getDb().$transaction(async (tx) => {
    await tx.status_histories.deleteMany({
      where: { user_id: userId },
    });
    await tx.approver_delegations.deleteMany({
      where: {
        OR: [
          { approver_id: userId },
          { delegate_id: userId },
          { created_by: userId },
        ],
      },
    });
    await tx.users.delete({
      where: { id: userId },
    });
  });
}

function userHistoryFromRow(row: StatusHistoryRow): StatusHistory {
  return {
    id: row.id,
    claim_id: '',
    user_id: row.user_id ?? undefined,
    old_status: row.old_status,
    new_status: row.new_status,
    changed_by: row.changed_by,
    reason: row.reason ?? undefined,
    timestamp: row.timestamp.toISOString(),
  };
}

export async function loadUserHistoryFromDb(): Promise<StatusHistory[]> {
  if (!isDbConfigured()) return [];
  const rows = await getDb().status_histories.findMany({
    where: { user_id: { not: null } },
  });
  return rows.map(userHistoryFromRow);
}
