-- Central petty cash is not a project. Allow FUNDING rows with no projectId.
ALTER TABLE "petty_cash_transactions" ALTER COLUMN "projectId" DROP NOT NULL;

-- Move historical admin "Add Petty Cash" rows off Head Office Petty Cash.
-- Those were stored on HO-Petty when it was used as the pool.
UPDATE "petty_cash_transactions" AS pct
SET "projectId" = NULL
FROM "projects" AS p, "users" AS u
WHERE pct."projectId" = p.id
  AND pct."createdBy" = u.id
  AND pct."isDeleted" = false
  AND pct."type" = 'FUNDING'
  AND p.code = 'HO-Petty'
  AND u.role IN ('ADMIN', 'SUPER_ADMIN', 'SUB_ADMIN');
