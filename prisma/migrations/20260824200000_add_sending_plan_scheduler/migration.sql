-- CreateEnum
CREATE TYPE "SendingPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SendAttemptStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "sendingPlanId" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "sendClaimToken" TEXT,
ADD COLUMN     "sendClaimedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SendingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromDomain" TEXT NOT NULL,
    "configurationSet" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "sendWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "sendWindowEnd" TEXT NOT NULL DEFAULT '18:00',
    "hardDailyCap" INTEGER NOT NULL DEFAULT 1000,
    "status" "SendingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "warmupDay" INTEGER NOT NULL DEFAULT 1,
    "warmupStartedAt" TIMESTAMP(3),
    "lastWarmupDate" DATE,
    "schedule" JSONB NOT NULL,
    "reduceFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "bounceReduceRate" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "bounceStopRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "complaintReduceRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0005,
    "complaintStopRate" DOUBLE PRECISION NOT NULL DEFAULT 0.001,
    "minSampleSize" INTEGER NOT NULL DEFAULT 100,
    "pauseReason" TEXT,
    "lastHealthCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SendingDay" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "warmupDay" INTEGER NOT NULL,
    "allowed" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pauseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SendAttempt" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "sendingDayId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "claimToken" TEXT NOT NULL,
    "status" "SendAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "SendAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SendingPlan_fromEmail_key" ON "SendingPlan"("fromEmail");

-- CreateIndex
CREATE INDEX "SendingPlan_status_idx" ON "SendingPlan"("status");

-- CreateIndex
CREATE INDEX "SendingPlan_fromDomain_status_idx" ON "SendingPlan"("fromDomain", "status");

-- CreateIndex
CREATE INDEX "SendingDay_planId_localDate_idx" ON "SendingDay"("planId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "SendingDay_planId_localDate_key" ON "SendingDay"("planId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "SendAttempt_claimToken_key" ON "SendAttempt"("claimToken");

-- CreateIndex
CREATE INDEX "SendAttempt_status_createdAt_idx" ON "SendAttempt"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SendAttempt_enrollmentId_stepOrder_attemptNumber_key" ON "SendAttempt"("enrollmentId", "stepOrder", "attemptNumber");

-- CreateIndex
CREATE INDEX "Campaign_sendingPlanId_idx" ON "Campaign"("sendingPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_sendClaimToken_key" ON "Enrollment"("sendClaimToken");

-- CreateIndex
CREATE INDEX "Enrollment_state_nextSendAt_sendClaimedUntil_idx" ON "Enrollment"("state", "nextSendAt", "sendClaimedUntil");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sendingPlanId_fkey" FOREIGN KEY ("sendingPlanId") REFERENCES "SendingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendingDay" ADD CONSTRAINT "SendingDay_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SendingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_sendingDayId_fkey" FOREIGN KEY ("sendingDayId") REFERENCES "SendingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
