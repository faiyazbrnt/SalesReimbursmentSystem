import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { UserRole } from '../src/types';
import { state } from '../src/server/state';
import { fromServerUser } from '../src/lib/api/adapters';
import { canonicalRoleUrl } from '../src/routes/rolePaths';
import { createUser, updateUser } from '../src/services/users/usersRouter';
import { listDemoUsers } from '../src/services/auth/auth';

const migrationName = '20261026010000_retire_finance_role';
const migrationRoot = path.join(process.cwd(), 'prisma/migrations');
const forward = fs.readFileSync(path.join(migrationRoot, migrationName, 'migration.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(process.cwd(), 'scripts/rollback-finance-role.sql'), 'utf8');
const legacyDatabase = () => {
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  for (const name of fs.readdirSync(migrationRoot).filter(name => name !== migrationName).sort()) db.public.none(fs.readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8'));
  db.public.none(`INSERT INTO users(id,name,email,role,department) VALUES ('legacy-finance','Existing analyst','legacy@example.test','Finance','Finance'), ('existing-approver','Existing manager','manager@example.test','Approver','Sales');
    INSERT INTO claims(id,requestor_id,current_approver_id,status,total_amount) VALUES ('legacy-claim','legacy-finance','existing-approver','Processing',100);
    INSERT INTO status_histories(id,claim_id,old_status,new_status,changed_by,reason) VALUES ('prior-event','legacy-claim','Pending Approval','Processing','legacy-finance','Existing audit event');`);
  return db;
};

describe('Finance role retirement', () => {
  it('has only four assignable roles and keeps migrated demo identities', () => {
    expect(Object.values(UserRole)).toEqual(['Requestor', 'Approver', 'Custodian', 'Admin']);
    expect(state.users.find(user => user.id === 'u22')).toMatchObject({ id: 'u22', role: 'Approver', department: 'Finance' });
    expect((listDemoUsers().body as Array<{role:string}>).some(user => user.role === 'Finance')).toBe(false);
    expect(fromServerUser({ id: 'legacy', name: 'Analyst', role: 'Finance' })).toMatchObject({ id: 'legacy', role: 'Approver' });
  });
  it('rejects creating or assigning the retired role before changing users or history', async () => {
    const before = JSON.stringify([state.users, state.statusHistories]);
    expect((await createUser('u4', { name: 'Legacy', email: 'removed-role@example.test', role: 'Finance' as never, department: 'Finance' })).status).toBe(400);
    expect((await updateUser('u4', 'u1', { role: 'Finance' as never })).status).toBe(400);
    expect(JSON.stringify([state.users, state.statusHistories])).toBe(before);
  });
  it('migrates existing accounts while retaining IDs, ownership, and historical audit events', () => {
    const db = legacyDatabase();
    db.public.none(forward);
    expect(db.public.one(`SELECT id,email,role,department FROM users WHERE id='legacy-finance'`)).toEqual({ id: 'legacy-finance', email: 'legacy@example.test', role: 'Approver', department: 'Finance' });
    expect(db.public.one(`SELECT requestor_id FROM claims WHERE id='legacy-claim'`).requestor_id).toBe('legacy-finance');
    expect(db.public.one(`SELECT reason,changed_by FROM status_histories WHERE id='prior-event'`)).toEqual({ reason: 'Existing audit event', changed_by: 'legacy-finance' });
    expect(db.public.one(`SELECT old_status,new_status,user_id FROM status_histories WHERE id='phase4-finance-role:legacy-finance'`)).toEqual({ old_status: 'Finance', new_status: 'Approver', user_id: 'legacy-finance' });
    expect(() => db.public.none(`UPDATE users SET role='Finance' WHERE id='existing-approver'`)).toThrow();
  });
  it('can retry, roll back only migrated accounts, and migrate forward again', () => {
    const db = legacyDatabase();
    db.public.none(forward);
    db.public.none(forward);
    expect(db.public.one(`SELECT COUNT(*) AS count FROM status_histories WHERE user_id='legacy-finance'`).count).toBe(1);
    db.public.none(rollback);
    expect(db.public.one(`SELECT role FROM users WHERE id='legacy-finance'`).role).toBe('Finance');
    expect(db.public.one(`SELECT role FROM users WHERE id='existing-approver'`).role).toBe('Approver');
    db.public.none(forward);
    expect(db.public.one(`SELECT role FROM users WHERE id='legacy-finance'`).role).toBe('Approver');
  });
  it.each([
    ['/finance', '/approver/financials'],
    ['/finance/claims', '/approver/financials/records'],
    ['/finance/receipts', '/approver/financials/receipts'],
    ['/finance/transactions', '/approver/transactions'],
    ['/finance/analytics', '/approver/financials/analytics'],
    ['/finance/finance/analytics', '/approver/financials/analytics'],
    ['/approver/finance/analytics', '/approver/financials/analytics'],
    ['/finance/claims/old-id', '/approver/claims/old-id'],
  ])('keeps legacy bookmark %s working', (source, destination) => {
    expect(canonicalRoleUrl(source, '?status=Approved', '#records', UserRole.APPROVER)).toBe(`${destination}?status=Approved#records`);
  });
  it('keeps retired namespace links scoped to the signed-in user rather than granting a role', () => {
    expect(canonicalRoleUrl('/finance/analytics', '', '', UserRole.REQUESTOR)).toBe('/requestor/financials/analytics');
  });
});
