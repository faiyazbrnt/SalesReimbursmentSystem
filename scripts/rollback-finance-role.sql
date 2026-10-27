-- Use with the previous application release. Preserves migration audit entries.
BEGIN;
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_finance_retired_check";
UPDATE "users" SET "role" = 'Finance'
WHERE "role" = 'Approver' AND "id" IN (
  SELECT "user_id" FROM "status_histories"
  WHERE "id" = 'phase4-finance-role:' || "user_id" AND "old_status" = 'Finance' AND "new_status" = 'Approver'
);
COMMIT;
