-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ValidationStatus" ADD VALUE 'DISPOSABLE';
ALTER TYPE "ValidationStatus" ADD VALUE 'CATCH_ALL';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "smtpCheckedAt" TIMESTAMP(3),
ADD COLUMN     "validationCheckedAt" TIMESTAMP(3),
ADD COLUMN     "validationReason" TEXT;

-- CreateTable
CREATE TABLE "DomainReputation" (
    "domain" TEXT NOT NULL,
    "isCatchAll" BOOLEAN NOT NULL DEFAULT false,
    "mxHost" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainReputation_pkey" PRIMARY KEY ("domain")
);

-- CreateIndex
CREATE INDEX "Lead_smtpCheckedAt_idx" ON "Lead"("smtpCheckedAt");

-- Backfill: treat existing leads as "checked at import time" so the
-- revalidation cron doesn't try to reprocess the whole historical table in
-- one burst on first deploy.
UPDATE "Lead" SET "validationCheckedAt" = "createdAt" WHERE "validationCheckedAt" IS NULL;
