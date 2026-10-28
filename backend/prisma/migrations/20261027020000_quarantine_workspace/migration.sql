ALTER TABLE "ImportRecord" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "validation" JSONB,
ADD COLUMN "review" JSONB;
CREATE INDEX "ImportRecord_batchId_status_createdAt_idx" ON "ImportRecord"("batchId", "status", "createdAt");
CREATE INDEX "ImportRecord_employeeId_idx" ON "ImportRecord"("employeeId");
