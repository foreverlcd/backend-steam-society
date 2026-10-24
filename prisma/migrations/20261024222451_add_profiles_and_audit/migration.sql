-- CreateEnum
CREATE TYPE "mentor_status" AS ENUM ('draft', 'pending_review', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "education_level" AS ENUM ('school', 'undergraduate', 'graduate', 'career_change', 'other');

-- CreateTable
CREATE TABLE "language" (
    "code" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "language_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "mentor_profile" (
    "user_id" UUID NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "years_experience" INTEGER,
    "country" VARCHAR(2),
    "city" TEXT,
    "status" "mentor_status" NOT NULL DEFAULT 'draft',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "min_notice_hours" INTEGER NOT NULL DEFAULT 24,
    "max_advance_days" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mentor_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mentee_profile" (
    "user_id" UUID NOT NULL,
    "goals" TEXT,
    "education_level" "education_level",
    "country" VARCHAR(2),
    "city" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mentee_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mentor_area" (
    "mentor_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,

    CONSTRAINT "mentor_area_pkey" PRIMARY KEY ("mentor_id","area_id")
);

-- CreateTable
CREATE TABLE "mentee_interest" (
    "mentee_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,

    CONSTRAINT "mentee_interest_pkey" PRIMARY KEY ("mentee_id","area_id")
);

-- CreateTable
CREATE TABLE "mentor_language" (
    "mentor_id" UUID NOT NULL,
    "language_code" VARCHAR(2) NOT NULL,

    CONSTRAINT "mentor_language_pkey" PRIMARY KEY ("mentor_id","language_code")
);

-- CreateTable
CREATE TABLE "mentee_language" (
    "mentee_id" UUID NOT NULL,
    "language_code" VARCHAR(2) NOT NULL,

    CONSTRAINT "mentee_language_pkey" PRIMARY KEY ("mentee_id","language_code")
);

-- CreateTable
CREATE TABLE "onboarding_response" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "question_code" TEXT NOT NULL,
    "answer" JSON NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata" JSON NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentor_profile_status_idx" ON "mentor_profile"("status");

-- CreateIndex
CREATE INDEX "mentor_area_area_id_idx" ON "mentor_area"("area_id");

-- CreateIndex
CREATE INDEX "mentee_interest_area_id_idx" ON "mentee_interest"("area_id");

-- CreateIndex
CREATE INDEX "mentor_language_language_code_idx" ON "mentor_language"("language_code");

-- CreateIndex
CREATE INDEX "mentee_language_language_code_idx" ON "mentee_language"("language_code");

-- CreateIndex
CREATE INDEX "onboarding_response_user_id_idx" ON "onboarding_response"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_response_user_id_question_code_key" ON "onboarding_response"("user_id", "question_code");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");

-- AddForeignKey
ALTER TABLE "mentor_profile" ADD CONSTRAINT "mentor_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_profile" ADD CONSTRAINT "mentor_profile_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentee_profile" ADD CONSTRAINT "mentee_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_area" ADD CONSTRAINT "mentor_area_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentor_profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_area" ADD CONSTRAINT "mentor_area_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentee_interest" ADD CONSTRAINT "mentee_interest_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "mentee_profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentee_interest" ADD CONSTRAINT "mentee_interest_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_language" ADD CONSTRAINT "mentor_language_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentor_profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_language" ADD CONSTRAINT "mentor_language_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "language"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentee_language" ADD CONSTRAINT "mentee_language_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "mentee_profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentee_language" ADD CONSTRAINT "mentee_language_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "language"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_response" ADD CONSTRAINT "onboarding_response_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks that Prisma cannot express.
ALTER TABLE "language"
  ADD CONSTRAINT "language_code_check" CHECK ("code" ~ '^[a-z]{2}$');

ALTER TABLE "mentor_profile"
  ADD CONSTRAINT "mentor_profile_country_check" CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "mentor_profile_years_experience_check" CHECK ("years_experience" IS NULL OR "years_experience" >= 0),
  ADD CONSTRAINT "mentor_profile_min_notice_hours_check" CHECK ("min_notice_hours" >= 0),
  ADD CONSTRAINT "mentor_profile_max_advance_days_check" CHECK ("max_advance_days" > 0);

ALTER TABLE "mentee_profile"
  ADD CONSTRAINT "mentee_profile_country_check" CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$');

ALTER TABLE "onboarding_response"
  ADD CONSTRAINT "onboarding_response_version_check" CHECK ("version" > 0);

-- audit_log is append-only. A trigger keeps the invariant even for raw SQL.
CREATE FUNCTION reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW
EXECUTE FUNCTION reject_audit_log_mutation();
