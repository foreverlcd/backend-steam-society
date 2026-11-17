-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('pending', 'sent', 'failed', 'expired');

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "kind" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "status" "email_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_outbox_to_address_idx" ON "email_outbox"("to_address");

-- Hand-written invariants (Prisma cannot express them).
ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_attempts_check" CHECK ("attempts" >= 0),
  -- Only pending rows may keep the body (links and tokens).
  ADD CONSTRAINT "email_outbox_body_only_pending_check"
    CHECK ("status" = 'pending' OR "body" IS NULL),
  ADD CONSTRAINT "email_outbox_pending_has_body_check"
    CHECK ("status" <> 'pending' OR "body" IS NOT NULL),
  ADD CONSTRAINT "email_outbox_sent_at_check"
    CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL));
