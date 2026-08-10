-- AlterTable
ALTER TABLE "EmailTemplate" ADD COLUMN     "aiBrief" TEXT,
ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
