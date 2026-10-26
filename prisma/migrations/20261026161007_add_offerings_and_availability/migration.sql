-- CreateEnum
CREATE TYPE "offering_type" AS ENUM ('one_to_one', 'group');

-- CreateTable
CREATE TABLE "availability_rule" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "mentor_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "offering_type" NOT NULL DEFAULT 'one_to_one',
    "duration_minutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "is_free" BOOLEAN NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offering_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_rule_user_id_weekday_idx" ON "availability_rule"("user_id", "weekday");

-- CreateIndex
CREATE INDEX "offering_mentor_id_active_idx" ON "offering"("mentor_id", "active");

-- AddForeignKey
ALTER TABLE "availability_rule" ADD CONSTRAINT "availability_rule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offering" ADD CONSTRAINT "offering_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentor_profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain checks that Prisma cannot express.
ALTER TABLE "availability_rule"
  ADD CONSTRAINT "availability_rule_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7),
  ADD CONSTRAINT "availability_rule_time_format_check" CHECK (
    "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  ADD CONSTRAINT "availability_rule_time_order_check" CHECK ("end_time" > "start_time"),
  ADD CONSTRAINT "availability_rule_timezone_check" CHECK (length("timezone") > 0),
  ADD CONSTRAINT "availability_rule_valid_range_check" CHECK (
    "valid_from" IS NULL
    OR "valid_to" IS NULL
    OR "valid_to" >= "valid_from"
  );

ALTER TABLE "offering"
  ADD CONSTRAINT "offering_price_check" CHECK (
    ("is_free" AND "price_minor" = 0)
    OR (NOT "is_free" AND "price_minor" > 0)
  ),
  ADD CONSTRAINT "offering_duration_check" CHECK ("duration_minutes" BETWEEN 15 AND 240),
  ADD CONSTRAINT "offering_capacity_check" CHECK ("capacity" >= 1),
  ADD CONSTRAINT "offering_one_to_one_capacity_check" CHECK (
    "type" <> 'one_to_one' OR "capacity" = 1
  ),
  ADD CONSTRAINT "offering_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
