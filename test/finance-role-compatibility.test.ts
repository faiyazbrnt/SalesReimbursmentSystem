import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildPgMemDb } from './helpers/pgMemDb';
import { __setTestDb } from '../src/lib/db';
import { loadUsersFromDb, syncUsersToDb } from '../src/lib/db/usersRepo';

let db: ReturnType<typeof buildPgMemDb>;
beforeAll(() => {
  process.env.DATABASE_URL = 'postgres://pg-mem-test-placeholder/db';
  db = buildPgMemDb({ omitFinanceRetirement: true });
  __setTestDb(db);
});
afterAll(async () => { __setTestDb(undefined); await db?.$disconnect(); process.env.DATABASE_URL = ''; });

it('normalizes legacy database roles and preserves rollback evidence when saving users before migration', async () => {
  await db.users.create({ data: { id: 'legacy-before-migration', name: 'Legacy Analyst', email: 'legacy@example.test', role: 'Finance', department: 'Finance' } });
  const users = await loadUsersFromDb();
  expect(users[0]).toMatchObject({ id: 'legacy-before-migration', role: 'Approver', department: 'Finance' });
  await syncUsersToDb(users);
  await syncUsersToDb(users);
  expect(await db.users.findUnique({ where: { id: users[0].id } })).toMatchObject({ role: 'Approver', email: 'legacy@example.test' });
  const audit = await db.status_histories.findMany({ where: { user_id: users[0].id } });
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ id: 'phase4-finance-role:legacy-before-migration', old_status: 'Finance', new_status: 'Approver' });
});
