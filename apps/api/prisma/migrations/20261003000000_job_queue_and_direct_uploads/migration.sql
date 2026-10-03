-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'DEAD');

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "thumbnailKey" TEXT;

-- CreateTable
CREATE TABLE "EvidenceUpload" (
    "key" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "userId" UUID NOT NULL,
    "taskOccurrenceId" UUID NOT NULL,
    "contentType" TEXT NOT NULL,
    "thumbnailContentType" TEXT,
    "maxBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceUpload_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "dedupeKey" TEXT,
    "lockedAt" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemHeartbeat" (
    "name" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "detail" JSONB,

    CONSTRAINT "SystemHeartbeat_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceUpload_thumbnailKey_key" ON "EvidenceUpload"("thumbnailKey");

-- CreateIndex
CREATE INDEX "EvidenceUpload_userId_idx" ON "EvidenceUpload"("userId");

-- CreateIndex
CREATE INDEX "EvidenceUpload_confirmedAt_expiresAt_idx" ON "EvidenceUpload"("confirmedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_name_status_idx" ON "Job"("name", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_thumbnailKey_key" ON "Evidence"("thumbnailKey");

-- AddForeignKey
ALTER TABLE "EvidenceUpload" ADD CONSTRAINT "EvidenceUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Fast claim path for workers: only QUEUED rows ordered by runAt
CREATE INDEX "Job_queued_runAt_idx" ON "Job" ("runAt") WHERE "status" = 'QUEUED';
