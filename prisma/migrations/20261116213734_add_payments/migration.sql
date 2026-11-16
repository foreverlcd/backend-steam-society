-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('created', 'pending', 'paid', 'failed');

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "booking_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_ref" VARCHAR(128),
    "status" "payment_status" NOT NULL DEFAULT 'created',
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "fee_minor" INTEGER NOT NULL,
    "net_minor" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "checkout_url" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "provider" VARCHAR(32) NOT NULL,
    "event_id" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_booking_id_key" ON "payment"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_ref_key" ON "payment"("provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotency_key_key" ON "payment"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_event_id_key" ON "webhook_event"("provider", "event_id");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written invariants (not expressible in Prisma).
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_amount_positive" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "payment_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "payment_fee_bps_range" CHECK ("fee_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "payment_fee_non_negative" CHECK ("fee_minor" >= 0 AND "net_minor" >= 0),
  ADD CONSTRAINT "payment_fee_split" CHECK ("fee_minor" + "net_minor" = "amount_minor"),
  ADD CONSTRAINT "payment_paid_at" CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL));
