-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('harassment', 'inappropriate_content', 'spam_or_fraud', 'safety_concern', 'no_show', 'other');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "report_action" AS ENUM ('none', 'warned', 'suspended');

-- CreateTable
CREATE TABLE "user_block" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_block_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reporter_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "booking_id" UUID,
    "reason" "report_reason" NOT NULL,
    "details" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "action" "report_action",
    "resolution_note" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_block_blocked_id_idx" ON "user_block"("blocked_id");

-- CreateIndex
CREATE INDEX "report_status_created_at_idx" ON "report"("status", "created_at");

-- CreateIndex
CREATE INDEX "report_reported_user_id_idx" ON "report"("reported_user_id");

-- CreateIndex
CREATE INDEX "report_reporter_id_idx" ON "report"("reporter_id");

-- AddForeignKey
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written invariants (ADR-029).
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_not_self" CHECK ("blocker_id" <> "blocked_id");
ALTER TABLE "report" ADD CONSTRAINT "report_not_self" CHECK ("reporter_id" <> "reported_user_id");
ALTER TABLE "report" ADD CONSTRAINT "report_details_length" CHECK ("details" IS NULL OR char_length("details") <= 2000);
-- Open reports carry no resolution; closed ones always do.
ALTER TABLE "report" ADD CONSTRAINT "report_resolution_consistent" CHECK (
  ("status" = 'open') = ("resolved_at" IS NULL)
  AND ("status" = 'open') = ("action" IS NULL)
);
