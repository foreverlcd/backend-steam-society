-- CreateEnum
CREATE TYPE "career_stage" AS ENUM ('school', 'preuniversity', 'university', 'early_career');

-- AlterTable
ALTER TABLE "mentee_profile" ADD COLUMN     "career_stage" "career_stage";

-- Backfill the exact stage from the onboarding answer. The previous
-- education_level projection is lossy (preuniversity -> other).
UPDATE "mentee_profile" AS profile
SET "career_stage" = (response."answer" #>> '{}')::"career_stage"
FROM "onboarding_response" AS response
WHERE response."user_id" = profile."user_id"
  AND response."question_code" = 'stage'
  AND response."version" = 1
  AND (response."answer" #>> '{}') IN (
    'school',
    'preuniversity',
    'university',
    'early_career'
  );
