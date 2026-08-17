-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('UNKNOWN', 'NONE', 'ACTIVE');

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "lastEventAt" TIMESTAMP(3),
ADD COLUMN     "lastEventType" "EmailEventType";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "contractCheckedAt" TIMESTAMP(3),
ADD COLUMN     "contractConfidence" TEXT,
ADD COLUMN     "contractConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contractExpiry" TIMESTAMP(3),
ADD COLUMN     "contractReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "contractSource" TEXT,
ADD COLUMN     "contractStatus" "ContractStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "incumbentVendor" TEXT,
ADD COLUMN     "sourceDetail" TEXT;

-- CreateTable
CREATE TABLE "InboundLeadLog" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "leadId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundLeadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAlert" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundLeadLog_channel_createdAt_idx" ON "InboundLeadLog"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyAlert_kind_idx" ON "CompanyAlert"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAlert_leadId_kind_key" ON "CompanyAlert"("leadId", "kind");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- CreateIndex
CREATE INDEX "Lead_contractCheckedAt_idx" ON "Lead"("contractCheckedAt");

-- CreateIndex
CREATE INDEX "Lead_contractExpiry_idx" ON "Lead"("contractExpiry");

-- AddForeignKey
ALTER TABLE "CompanyAlert" ADD CONSTRAINT "CompanyAlert_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
