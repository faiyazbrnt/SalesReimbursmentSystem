-- Preserve identities and relationships. Keep the enum token for rolling-deploy/rollback compatibility.
BEGIN;

INSERT INTO "status_histories" ("id", "user_id", "old_status", "new_status", "changed_by", "reason", "timestamp")
SELECT 'phase4-finance-role:' || "id", "id", 'Finance', 'Approver', "id",
       'System migration (phase 4): Finance responsibilities transferred to Approver.', NOW()
FROM "users" WHERE "role" = 'Finance'
ON CONFLICT ("id") DO NOTHING;

UPDATE "users" SET "role" = 'Approver' WHERE "role" = 'Finance';

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_finance_retired_check";
ALTER TABLE "users" ADD CONSTRAINT "users_role_finance_retired_check" CHECK ("role" <> 'Finance');

COMMIT;
