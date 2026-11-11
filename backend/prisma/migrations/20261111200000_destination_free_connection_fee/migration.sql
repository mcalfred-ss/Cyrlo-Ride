-- Destination-free booking + connection fee after rider acceptance.
-- Historical destination columns retained; newly nullable for pickup-only requests.
-- payment_expires_at becomes nullable until the GH₵1 connection fee is initiated on accept.

ALTER TABLE "bookings"
  ALTER COLUMN "destination_latitude" DROP NOT NULL,
  ALTER COLUMN "destination_longitude" DROP NOT NULL,
  ALTER COLUMN "payment_expires_at" DROP NOT NULL;
