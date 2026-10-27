/**
 * Builds a Prisma client backed by pg-mem and applies the checked-in Prisma
 * baseline. This catches repository/schema drift without touching Supabase.
 * pg-mem remains an emulator, so production migrations still require live
 * verification after explicit approval.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';
import { newDb } from 'pg-mem';
import { PrismaClient } from '../../src/generated/prisma/client';

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
);

function readMigrationSql(omitFinanceRetirement = false): string[] {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(directory => !omitFinanceRetirement || directory !== '20261026010000_retire_finance_role')
    .sort()
    .map((directory) => path.join(MIGRATIONS_DIR, directory, 'migration.sql'))
    .filter(fs.existsSync)
    .map((file) => fs.readFileSync(file, 'utf8'));
}

export function buildPgMemDb(options: {
  omitReleaseCodeHardening?: boolean;
  omitFinanceRetirement?: boolean;
} = {}) {
  const memoryDb = newDb({
    autoCreateForeignKeyIndices: true,
    // Prisma emits numeric precision/scale AST metadata that pg-mem parses
    // correctly but does not mark as planner-consumed.
    noAstCoverageCheck: true,
  });

  for (const sql of readMigrationSql(options.omitFinanceRetirement)) {
    memoryDb.public.none(sql);
  }

  if (options.omitReleaseCodeHardening) {
    memoryDb.public.none(`
      ALTER TABLE "claims" DROP COLUMN "release_code_expires_at";
      ALTER TABLE "claims" DROP COLUMN "release_code_attempts";
      ALTER TABLE "claims" DROP COLUMN "release_code_locked_until";
    `);
  }

  const { Client } = memoryDb.adapters.createPg();
  const originalQuery = Client.prototype.query;
  Client.prototype.query = function (
    this: InstanceType<typeof Client>,
    queryConfig: any,
    ...rest: any[]
  ) {
    if (!queryConfig || typeof queryConfig !== 'object') {
      return originalQuery.call(this, queryConfig, ...rest);
    }
    const wantsArrayRows = queryConfig.rowMode === 'array';
    const { rowMode: _rowMode, types: _types, ...cleaned } = queryConfig;
    const adaptResult = (queryResult: any) => {
      if (!wantsArrayRows) return queryResult;
      const firstRow = queryResult.rows[0] as Record<string, unknown> | undefined;
      const columnNames = firstRow ? Object.keys(firstRow) : [];
      const decimalColumns = new Set([
        'amount',
        'total_amount',
        'approved_amount',
        'paid_amount',
        'total_spent',
        'variance_amount',
        'high_value_threshold',
      ]);
      const oidFor = (name: string, value: unknown) => {
        if (typeof value === 'boolean') return 16; // bool
        if (typeof value === 'bigint') return 20; // int8
        if (decimalColumns.has(name)) return 1700; // numeric
        if (typeof value === 'number') return 23; // int4
        if (value instanceof Date) return 1184; // timestamptz
        if (Array.isArray(value)) return 1009; // text[]
        return 25; // text (also safe for enums and nulls in this harness)
      };
      const normalize = (name: string, value: unknown) => {
        if (value instanceof Date) return value.toISOString();
        if (decimalColumns.has(name) && value !== null) return String(value);
        return value;
      };
      return {
        ...queryResult,
        fields: columnNames.map((name) => ({
          name,
          dataTypeID: oidFor(name, firstRow?.[name]),
        })),
        rows: queryResult.rows.map((row: Record<string, unknown>) =>
          columnNames.map((name) => normalize(name, row[name]))),
      };
    };

    const callbackIndex = rest.findIndex((value) => typeof value === 'function');
    if (callbackIndex >= 0) {
      const callback = rest[callbackIndex];
      rest[callbackIndex] = (error: unknown, queryResult: unknown) =>
        callback(error, error ? queryResult : adaptResult(queryResult));
      return originalQuery.call(this, cleaned, ...rest);
    }

    const result = originalQuery.call(this, cleaned, ...rest);
    if (!result || typeof result.then !== 'function') return result;
    return result.then(adaptResult);
  } as typeof Client.prototype.query;
  // PrismaPg recognizes a real node-postgres Pool. Inject pg-mem's Client
  // implementation through pg-pool's supported custom Client hook.
  const pool = new Pool({ Client } as unknown as PoolConfig);
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
