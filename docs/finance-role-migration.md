# Retire the Finance role

Phase 2 already supplies financial overview, approved records, receipts, payment history, analytics, and exports through Approver. Phase 4 removes Finance from login, account management, and authorization.

## Deploy

Deploy this application and run `npm run db:migrate` against the intended database. The checked-in migration changes existing Finance users to Approver without changing IDs, reporting relationships, claim ownership, or previous audit entries. Each conversion gets a deterministic system-migration audit entry. Public roles are Requestor, Approver, Custodian, and Admin.

The Prisma enum retains its legacy Finance storage token to avoid rebuilding a PostgreSQL enum during a rolling deployment. A database CHECK constraint prohibits any user from receiving that role. Application readers map legacy Finance rows to Approver while migration is pending; create/update APIs reject Finance. If an administrator saves users before the SQL migration, the write path records the same conversion audit entry before persisting normalized roles. Existing approval assignments and Custodian cash permissions remain enforced.

Legacy Finance URLs redirect to the signed-in role’s corresponding financial pages; role guards still apply. The `?role=finance` demo alias keeps the same account ID and now signs in as Approver.

## Verify

`SELECT COUNT(*) FROM users WHERE role = 'Finance';` must return 0. Verify migrated users appear as Approver and can open Financial Overview, Approved Records, Financial Receipts, Paid & Completed, and Financial Analytics. Confirm Finance cannot be assigned through user administration or direct API writes.

## Roll back

Before restoring the previous application release, run `scripts/rollback-finance-role.sql` against the same database. It removes the CHECK constraint and restores only accounts recorded by this migration that still have the Approver role. Existing audit events remain intact. The forward SQL is retry-safe; when rolling forward again after rollback, apply that SQL explicitly because Prisma has already recorded its migration name.

No live database migration is executed by the implementation or tests. Tests use an isolated SQL emulator.
