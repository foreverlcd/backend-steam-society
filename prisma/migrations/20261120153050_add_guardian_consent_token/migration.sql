-- AlterTable
ALTER TABLE "user" ADD COLUMN     "guardian_email" TEXT;

-- CreateTable
CREATE TABLE "guardian_consent_token" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_consent_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardian_consent_token_token_hash_key" ON "guardian_consent_token"("token_hash");

-- CreateIndex
CREATE INDEX "guardian_consent_token_user_id_idx" ON "guardian_consent_token"("user_id");

-- AddForeignKey
ALTER TABLE "guardian_consent_token" ADD CONSTRAINT "guardian_consent_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
