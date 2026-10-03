-- Mentor directory: clients can choose a mentor themselves.

-- AlterTable
ALTER TABLE "MentorProfile" ADD COLUMN     "acceptingClients" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "focusAreas" "GoalCategory"[] DEFAULT ARRAY[]::"GoalCategory"[],
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
