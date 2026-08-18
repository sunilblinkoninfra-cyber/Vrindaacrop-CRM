-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;
