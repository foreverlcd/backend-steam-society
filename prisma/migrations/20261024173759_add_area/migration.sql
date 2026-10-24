-- CreateTable
CREATE TABLE "area" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "area_name_key" ON "area"("name");

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
