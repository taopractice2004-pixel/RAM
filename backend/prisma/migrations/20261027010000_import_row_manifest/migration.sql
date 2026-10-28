ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'DISCARDED';
ALTER TABLE "ImportBatch" ADD COLUMN "idempotencyKey" TEXT, ADD COLUMN "digest" TEXT, ADD COLUMN "provenance" JSONB, ADD COLUMN "actorId" TEXT;
CREATE UNIQUE INDEX "ImportBatch_idempotencyKey_key" ON "ImportBatch"("idempotencyKey");
ALTER TABLE "ImportRecord" ADD COLUMN "originalSource" JSONB, ADD COLUMN "originalMapped" JSONB, ADD COLUMN "rowNumber" INTEGER, ADD COLUMN "updatedBy" TEXT, ADD COLUMN "updatedAt" TIMESTAMP(3);
