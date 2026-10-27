import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPgMemDb } from './helpers/pgMemDb';
import { __setTestDb } from '../src/lib/db/index';

describe('demo users are persisted for a fresh database', () => {
  let testDb: ReturnType<typeof buildPgMemDb> | undefined;
  let restoreEnvironment: Record<string, string | undefined> = {};
  let hydrateServerlessState: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    restoreEnvironment = {
      DATABASE_URL: process.env.DATABASE_URL,
      DEMO_MODE: process.env.DEMO_MODE,
      AUTO_SEED: process.env.AUTO_SEED,
    };
    process.env.DATABASE_URL = 'postgres://pg-mem-test-placeholder/empty-demo-db';
    process.env.DEMO_MODE = 'true';
    process.env.AUTO_SEED = 'true';
    testDb = buildPgMemDb();
    __setTestDb(testDb);
    ({ hydrateServerlessState } = await import('../src/server/stateLoader'));
  });

  afterAll(async () => {
    __setTestDb(undefined);
    await testDb?.$disconnect();
    for (const [key, value] of Object.entries(restoreEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('upserts default demo requestor and approver when the users table is empty', async () => {
    await hydrateServerlessState?.();

    const users = await testDb!.users.findMany({ select: { id: true, reports_to: true } });
    expect(users.find(user => user.id === 'u1')?.reports_to).toBe('u2');
    expect(users.some(user => user.id === 'u2')).toBe(true);
  });
});
