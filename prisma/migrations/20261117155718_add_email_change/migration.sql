-- AlterTable
ALTER TABLE "email_verification_token" ADD COLUMN     "new_email" TEXT;

-- Addresses are stored normalized (trimmed, lowercase), like "user"."email".
ALTER TABLE "email_verification_token"
  ADD CONSTRAINT "email_verification_token_new_email_normalized_check"
  CHECK ("new_email" IS NULL OR "new_email" = lower(btrim("new_email")));
