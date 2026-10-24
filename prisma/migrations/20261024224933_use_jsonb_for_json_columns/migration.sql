-- AlterTable
ALTER TABLE "audit_log"
  ALTER COLUMN "metadata" SET DATA TYPE JSONB USING "metadata"::jsonb;

-- AlterTable
ALTER TABLE "onboarding_response"
  ALTER COLUMN "answer" SET DATA TYPE JSONB USING "answer"::jsonb;
