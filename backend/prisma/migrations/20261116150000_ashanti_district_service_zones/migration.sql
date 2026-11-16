-- Ashanti district-zone model: one ServiceZone per District, geographic provenance.

ALTER TABLE "geo_districts"
  ADD COLUMN IF NOT EXISTS "catalogue_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "geo_districts_catalogue_id_key"
  ON "geo_districts"("catalogue_id");

ALTER TABLE "service_zones"
  ADD COLUMN IF NOT EXISTS "district_id" UUID,
  ADD COLUMN IF NOT EXISTS "geographic_source" TEXT,
  ADD COLUMN IF NOT EXISTS "geographic_attribution" TEXT,
  ADD COLUMN IF NOT EXISTS "geographic_dataset_version" TEXT,
  ADD COLUMN IF NOT EXISTS "geographic_shape_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "service_zones_district_id_key"
  ON "service_zones"("district_id");

CREATE INDEX IF NOT EXISTS "service_zones_district_id_status_idx"
  ON "service_zones"("district_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_zones_district_id_fkey'
  ) THEN
    ALTER TABLE "service_zones"
      ADD CONSTRAINT "service_zones_district_id_fkey"
      FOREIGN KEY ("district_id") REFERENCES "geo_districts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
