-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('open', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('requested', 'awaiting_payment', 'confirmed', 'declined', 'cancelled', 'expired', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "cancel_actor" AS ENUM ('mentee', 'mentor', 'admin', 'system');

-- CreateEnum
CREATE TYPE "no_show_party" AS ENUM ('mentee', 'mentor');

-- Required by the session exclusion constraint below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "offering_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'open',
    "meeting_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "session_id" UUID NOT NULL,
    "mentee_id" UUID NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'requested',
    "message" TEXT,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" "cancel_actor",
    "cancel_reason" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "no_show_party" "no_show_party",
    "payment_required" BOOLEAN NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_mentor_id_starts_at_idx" ON "session"("mentor_id", "starts_at");

-- CreateIndex
CREATE INDEX "booking_mentee_id_status_idx" ON "booking"("mentee_id", "status");

-- CreateIndex
CREATE INDEX "booking_session_id_status_idx" ON "booking"("session_id", "status");

-- A mentee cannot hold the same seat twice while the booking is active.
CREATE UNIQUE INDEX "booking_active_seat_uk" ON "booking"("session_id", "mentee_id")
WHERE "status" IN ('requested', 'awaiting_payment', 'confirmed');

-- R-15: a mentor cannot have two non-cancelled sessions overlapping in time.
ALTER TABLE "session" ADD CONSTRAINT "session_no_overlap"
EXCLUDE USING gist (
  "mentor_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("status" <> 'cancelled');

-- CHECK constraints that Prisma does not express.
ALTER TABLE "session" ADD CONSTRAINT "session_ends_after_starts_check"
CHECK ("ends_at" > "starts_at");

ALTER TABLE "session" ADD CONSTRAINT "session_capacity_positive_check"
CHECK ("capacity" >= 1);

ALTER TABLE "booking" ADD CONSTRAINT "booking_expires_after_request_check"
CHECK ("expires_at" > "requested_at");

ALTER TABLE "booking" ADD CONSTRAINT "booking_price_check"
CHECK (
  ("payment_required" = false AND "price_minor" = 0)
  OR ("payment_required" = true AND "price_minor" > 0)
);

ALTER TABLE "booking" ADD CONSTRAINT "booking_currency_check"
CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "booking" ADD CONSTRAINT "booking_cancel_fields_check"
CHECK (("cancelled_at" IS NULL) = ("cancelled_by" IS NULL));

ALTER TABLE "booking" ADD CONSTRAINT "booking_no_show_party_check"
CHECK (("status" = 'no_show') = ("no_show_party" IS NOT NULL));

ALTER TABLE "booking" ADD CONSTRAINT "booking_completed_at_check"
CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL));

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentor_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "mentee_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
