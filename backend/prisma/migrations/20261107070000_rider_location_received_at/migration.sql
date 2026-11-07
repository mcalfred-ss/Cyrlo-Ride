-- Milestone 5: server-received timestamp for GPS freshness (authoritative age).
-- Latest-location table only; trip GPS history remains a later milestone.

ALTER TABLE "rider_locations"
  ADD COLUMN "received_at" TIMESTAMP(3);

-- Existing rows: treat prior updated_at as the best available server receipt time.
UPDATE "rider_locations"
SET "received_at" = "updated_at"
WHERE "received_at" IS NULL;

ALTER TABLE "rider_locations"
  ALTER COLUMN "received_at" SET NOT NULL;

CREATE INDEX "rider_locations_sharing_enabled_received_at_idx"
  ON "rider_locations"("sharing_enabled", "received_at");
