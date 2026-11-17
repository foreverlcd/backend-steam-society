-- AlterTable
ALTER TABLE "email_outbox" ADD COLUMN     "dedupe_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_dedupe_key_key" ON "email_outbox"("dedupe_key");
