-- Mentoring core: roles, mentor profiles, invites, assignments and "reviewed today" marks.

-- AlterEnum: the COACH role becomes MENTOR (existing rows keep their meaning).
ALTER TYPE "Role" RENAME VALUE 'COACH' TO 'MENTOR';

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "AssignmentEndReason" AS ENUM ('DECLINED', 'REASSIGNED', 'UNASSIGNED', 'CLIENT_STOPPED', 'ACCOUNT_DEACTIVATED');

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "reflectionPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MentorProfile" (
    "userId" UUID NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 15,
    "bio" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MentorProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MentorInvite" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "invitedById" UUID NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorAssignment" (
    "id" UUID NOT NULL,
    "mentorId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "assignedById" UUID NOT NULL,
    "note" TEXT,
    "acceptedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "endedById" UUID,
    "endReason" "AssignmentEndReason",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MentorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorReview" (
    "id" UUID NOT NULL,
    "mentorId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MentorInvite_tokenHash_key" ON "MentorInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "MentorInvite_email_idx" ON "MentorInvite"("email");

-- CreateIndex
CREATE INDEX "MentorAssignment_mentorId_status_idx" ON "MentorAssignment"("mentorId", "status");

-- CreateIndex
CREATE INDEX "MentorAssignment_clientId_createdAt_idx" ON "MentorAssignment"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MentorReview_mentorId_clientId_date_key" ON "MentorReview"("mentorId", "clientId", "date");

-- CreateIndex
CREATE INDEX "MentorReview_clientId_createdAt_idx" ON "MentorReview"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "MentorProfile" ADD CONSTRAINT "MentorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorAssignment" ADD CONSTRAINT "MentorAssignment_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorAssignment" ADD CONSTRAINT "MentorAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorReview" ADD CONSTRAINT "MentorReview_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorReview" ADD CONSTRAINT "MentorReview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A client can have at most one open (pending or active) mentor, even under concurrent requests.
-- (Partial index: not expressible in schema.prisma, so it lives only here.)
CREATE UNIQUE INDEX "MentorAssignment_one_open_per_client" ON "MentorAssignment"("clientId") WHERE "status" IN ('PENDING', 'ACTIVE');
