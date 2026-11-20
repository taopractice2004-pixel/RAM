ALTER TABLE "Notification" ADD COLUMN "resolvedById" TEXT;
ALTER TABLE "Notification" ADD COLUMN "resolveReason" TEXT;
ALTER TABLE "Notification" ADD COLUMN "resolveNote" TEXT;

CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recipients" TEXT[] NOT NULL,
    "schedule" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationRule_key_key" ON "NotificationRule"("key");

CREATE TABLE "NotificationEmailLog" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "notificationId" TEXT,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationEmailLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotificationEmailLog_ruleKey_sentAt_idx" ON "NotificationEmailLog"("ruleKey", "sentAt");