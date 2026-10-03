-- Mentor toolkit: sessions, notes with history, action items, nudges, push subscriptions, weekly reports.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT';
ALTER TYPE "NotificationType" ADD VALUE 'MENTOR_NUDGE';
ALTER TYPE "NotificationType" ADD VALUE 'SESSION_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'MENTOR_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'MENTOR_SUMMARY';
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_UP_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'MENTOR_UPDATE';

-- CreateEnum
CREATE TYPE "SessionChannel" AS ENUM ('WHATSAPP', 'PHONE', 'VIDEO', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'DONE', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('SESSION', 'QUICK');

-- CreateEnum
CREATE TYPE "ActionOwner" AS ENUM ('CLIENT', 'MENTOR');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'DONE', 'DROPPED');

-- CreateEnum
CREATE TYPE "NudgeCondition" AS ENUM ('NO_CHECKIN_BY', 'MISSED_TASK_DAYS', 'INACTIVE_DAYS');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT,
ADD COLUMN     "subjectId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mentorWhatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "MentorSession" (
    "id" UUID NOT NULL,
    "mentorId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "channel" "SessionChannel" NOT NULL DEFAULT 'WHATSAPP',
    "link" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "agenda" JSONB NOT NULL DEFAULT '[]',
    "seriesId" UUID,
    "reminderLeadMin" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MentorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorNote" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "sessionId" UUID,
    "kind" "NoteKind" NOT NULL DEFAULT 'QUICK',
    "sections" JSONB NOT NULL DEFAULT '{}',
    "text" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "sharedSummary" TEXT,
    "sharedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MentorNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorNoteVersion" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sharedSummary" TEXT,
    "editedById" UUID NOT NULL,
    "editedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorNoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "mentorId" UUID NOT NULL,
    "owner" "ActionOwner" NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE,
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "noteId" UUID,
    "doneAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nudge" (
    "id" UUID NOT NULL,
    "mentorId" UUID,
    "clientId" UUID NOT NULL,
    "ruleId" UUID,
    "template" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Nudge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NudgeRule" (
    "id" UUID NOT NULL,
    "mentorId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "condition" "NudgeCondition" NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "message" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredOn" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NudgeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "mentorId" UUID,
    "weekStart" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "mentorComment" TEXT,
    "sharedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_type_createdAt_idx" ON "Notification"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "MentorSession_mentorId_startsAt_idx" ON "MentorSession"("mentorId", "startsAt");

-- CreateIndex
CREATE INDEX "MentorSession_clientId_startsAt_idx" ON "MentorSession"("clientId", "startsAt");

-- CreateIndex
CREATE INDEX "MentorSession_assignmentId_idx" ON "MentorSession"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MentorNote_sessionId_key" ON "MentorNote"("sessionId");

-- CreateIndex
CREATE INDEX "MentorNote_clientId_createdAt_idx" ON "MentorNote"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "MentorNote_authorId_createdAt_idx" ON "MentorNote"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MentorNoteVersion_noteId_version_key" ON "MentorNoteVersion"("noteId", "version");

-- CreateIndex
CREATE INDEX "ActionItem_clientId_status_idx" ON "ActionItem"("clientId", "status");

-- CreateIndex
CREATE INDEX "ActionItem_mentorId_status_dueDate_idx" ON "ActionItem"("mentorId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Nudge_clientId_sentAt_idx" ON "Nudge"("clientId", "sentAt");

-- CreateIndex
CREATE INDEX "Nudge_mentorId_sentAt_idx" ON "Nudge"("mentorId", "sentAt");

-- CreateIndex
CREATE INDEX "NudgeRule_clientId_active_idx" ON "NudgeRule"("clientId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_clientId_weekStart_key" ON "WeeklyReport"("clientId", "weekStart");

-- AddForeignKey
ALTER TABLE "MentorNoteVersion" ADD CONSTRAINT "MentorNoteVersion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MentorNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing coach notes become quick mentor notes (CoachNote stays as a read-only legacy table).
INSERT INTO "MentorNote" ("id", "clientId", "authorId", "kind", "text", "createdAt", "updatedAt")
SELECT "id", "userId", "authorId", 'QUICK', "body", "createdAt", "createdAt" FROM "CoachNote";
