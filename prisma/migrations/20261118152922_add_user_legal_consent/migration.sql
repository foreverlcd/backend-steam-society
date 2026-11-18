-- AlterTable
ALTER TABLE "user" ADD COLUMN     "guardian_consent_at" TIMESTAMPTZ(3),
ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(3),
ADD COLUMN     "terms_version" TEXT;
