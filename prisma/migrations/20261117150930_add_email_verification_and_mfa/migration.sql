-- CreateTable
CREATE TABLE "email_verification_token" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_totp" (
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "last_used_time_step" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_totp_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_code" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_token_token_hash_key" ON "email_verification_token"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_token_user_id_idx" ON "email_verification_token"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_code_user_id_code_hash_key" ON "mfa_recovery_code"("user_id", "code_hash");

-- AddForeignKey
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_code" ADD CONSTRAINT "mfa_recovery_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written (ADR-024) ---------------------------------------------------
ALTER TABLE "user_totp"
  ADD CONSTRAINT "user_totp_last_used_time_step_check" CHECK ("last_used_time_step" IS NULL OR "last_used_time_step" >= 0),
  ADD CONSTRAINT "user_totp_secret_ciphertext_check" CHECK ("secret_ciphertext" LIKE 'v1.%');

ALTER TABLE "email_verification_token"
  ADD CONSTRAINT "email_verification_token_expires_after_creation_check" CHECK ("expires_at" > "created_at");

-- Accounts created before e-mail verification existed (development and demo
-- data only; there are no real users yet) are treated as verified so they keep
-- working. New registrations start unverified.
UPDATE "user" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
