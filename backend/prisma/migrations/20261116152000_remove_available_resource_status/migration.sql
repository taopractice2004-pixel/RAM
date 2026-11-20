BEGIN;

UPDATE "Resource" AS resource
SET
  "status" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "Allocation" AS allocation
      WHERE allocation."resourceId" = resource."id"
        AND allocation."status" = 'ACTIVE'
    ) THEN 'ALLOCATED'::"ResourceStatus"
    WHEN EXISTS (
      SELECT 1
      FROM "Allocation" AS allocation
      WHERE allocation."resourceId" = resource."id"
        AND allocation."status" = 'SCHEDULED'
    ) THEN 'BENCH_COMMITTED'::"ResourceStatus"
    ELSE 'BENCH_TRUE'::"ResourceStatus"
  END,
  "benchSince" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "Allocation" AS allocation
      WHERE allocation."resourceId" = resource."id"
        AND allocation."status" = 'ACTIVE'
    ) THEN NULL
    ELSE COALESCE(resource."benchSince", resource."dateOfJoining", CURRENT_TIMESTAMP)
  END
WHERE resource."status" = 'AVAILABLE';

ALTER TABLE "Resource" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "ResourceStatus_new" AS ENUM (
  'ALLOCATED',
  'BENCH_COMMITTED',
  'BENCH_TRUE',
  'ON_ML',
  'TERMINATED'
);

ALTER TABLE "Resource"
  ALTER COLUMN "status" TYPE "ResourceStatus_new"
  USING ("status"::text::"ResourceStatus_new");

DROP TYPE "ResourceStatus";
ALTER TYPE "ResourceStatus_new" RENAME TO "ResourceStatus";

ALTER TABLE "Resource"
  ALTER COLUMN "status" SET DEFAULT 'BENCH_TRUE';

COMMIT;
