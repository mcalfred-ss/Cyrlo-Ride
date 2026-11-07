-- Milestone 7: matching offers, batch metadata, token ledger reversal pointer.
-- Does not invent offer-timeout defaults or ranking policy.

ALTER TYPE "BookingOfferStatus" ADD VALUE 'TIMED_OUT';
ALTER TYPE "BookingOfferStatus" ADD VALUE 'INVALIDATED';

ALTER TABLE "booking_offers"
  ADD COLUMN "batch_sequence" INTEGER,
  ADD COLUMN "expires_at" TIMESTAMP(3);

-- Existing rows (if any): treat as batch 0 with immediate expiry so they cannot be accepted.
UPDATE "booking_offers"
SET
  "batch_sequence" = COALESCE("batch_sequence", 0),
  "expires_at" = COALESCE("expires_at", "offered_at")
WHERE "batch_sequence" IS NULL OR "expires_at" IS NULL;

ALTER TABLE "booking_offers"
  ALTER COLUMN "batch_sequence" SET NOT NULL,
  ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX "booking_offers_booking_id_status_idx" ON "booking_offers"("booking_id", "status");
CREATE INDEX "booking_offers_status_expires_at_idx" ON "booking_offers"("status", "expires_at");

-- At most one winning offer per booking.
CREATE UNIQUE INDEX "booking_offers_one_accepted_per_booking"
  ON "booking_offers" ("booking_id")
  WHERE "status" = 'ACCEPTED';

-- At most one active trip assignment per rider.
CREATE UNIQUE INDEX "bookings_one_active_trip_per_rider"
  ON "bookings" ("rider_id")
  WHERE "rider_id" IS NOT NULL AND "status" IN ('ACCEPTED', 'IN_PROGRESS');

CREATE INDEX "bookings_status_search_expires_at_idx"
  ON "bookings"("status", "search_expires_at");

ALTER TABLE "token_ledger_entries"
  ADD COLUMN "reverses_entry_id" UUID;

ALTER TABLE "token_ledger_entries"
  ADD CONSTRAINT "token_ledger_entries_reverses_entry_id_fkey"
  FOREIGN KEY ("reverses_entry_id") REFERENCES "token_ledger_entries"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "token_ledger_entries_booking_id_type_idx"
  ON "token_ledger_entries"("booking_id", "type");
