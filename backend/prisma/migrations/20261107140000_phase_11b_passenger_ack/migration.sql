-- Phase 11B: passenger completion acknowledgement (not a status change).
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "passenger_acknowledged_at" TIMESTAMP(3);
