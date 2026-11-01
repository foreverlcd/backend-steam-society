-- Full-text and trigram search for the public catalog (stage 1.6).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Prisma does not model generated columns, so the column is created here.
ALTER TABLE "mentor_profile"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish'::regconfig, coalesce("headline", '')), 'A') ||
    setweight(to_tsvector('spanish'::regconfig, coalesce("bio", '')), 'B') ||
    setweight(to_tsvector('spanish'::regconfig, coalesce("city", '')), 'C')
  ) STORED;

CREATE INDEX "mentor_profile_search_vector_idx"
  ON "mentor_profile" USING GIN ("search_vector");

CREATE INDEX "mentor_profile_headline_trgm_idx"
  ON "mentor_profile" USING GIN ("headline" gin_trgm_ops);

CREATE INDEX "mentor_profile_bio_trgm_idx"
  ON "mentor_profile" USING GIN ("bio" gin_trgm_ops);

CREATE INDEX "mentor_profile_city_trgm_idx"
  ON "mentor_profile" USING GIN ("city" gin_trgm_ops);

CREATE INDEX "area_name_trgm_idx"
  ON "area" USING GIN ("name" gin_trgm_ops);
