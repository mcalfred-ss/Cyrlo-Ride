-- Milestone 6: approved booking statuses, payment deadline, webhook events, fee refunds.
-- Migrates legacy REQUESTED → AWAITING_PAYMENT. Does not seed zone geometry.

-- 1) Replace BookingStatus enum
CREATE TYPE "BookingStatus_new" AS ENUM (
  'AWAITING_PAYMENT',
  'PAYMENT_FAILED',
  'SEARCHING',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED'
);

ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "bookings"
  ALTER COLUMN "status" TYPE "BookingStatus_new"
  USING (
    CASE "status"::text
      WHEN 'REQUESTED' THEN 'AWAITING_PAYMENT'::"BookingStatus_new"
      WHEN 'ACCEPTED' THEN 'ACCEPTED'::"BookingStatus_new"
      WHEN 'CANCELLED' THEN 'CANCELLED'::"BookingStatus_new"
      WHEN 'COMPLETED' THEN 'COMPLETED'::"BookingStatus_new"
      WHEN 'EXPIRED' THEN 'EXPIRED'::"BookingStatus_new"
      ELSE 'AWAITING_PAYMENT'::"BookingStatus_new"
    END
  );

DROP TYPE "BookingStatus";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";

ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'AWAITING_PAYMENT'::"BookingStatus";

-- 2) Booking fee / search clocks and vehicle category
ALTER TABLE "bookings"
  ADD COLUMN "vehicle_category" "VehicleCategory",
  ADD COLUMN "payment_expires_at" TIMESTAMP(3),
  ADD COLUMN "search_expires_at" TIMESTAMP(3);

-- Existing rows (if any): default TRICYCLE and expired payment window so they are not treated as open unpaid.
UPDATE "bookings"
SET
  "vehicle_category" = COALESCE("vehicle_category", 'TRICYCLE'),
  "payment_expires_at" = COALESCE("payment_expires_at", "created_at")
WHERE "payment_expires_at" IS NULL OR "vehicle_category" IS NULL;

ALTER TABLE "bookings"
  ALTER COLUMN "vehicle_category" SET NOT NULL,
  ALTER COLUMN "payment_expires_at" SET NOT NULL;

CREATE INDEX "bookings_status_payment_expires_at_idx"
  ON "bookings"("status", "payment_expires_at");

-- 3) Status history
CREATE TABLE "booking_status_history" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "from_status" "BookingStatus",
  "to_status" "BookingStatus" NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" UUID,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_status_history_booking_id_created_at_idx"
  ON "booking_status_history"("booking_id", "created_at");

ALTER TABLE "booking_status_history"
  ADD CONSTRAINT "booking_status_history_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Webhook events
CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "provider_reference" TEXT,
  "payload_hash" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3),
  "processing_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key"
  ON "payment_webhook_events"("provider_event_id");
CREATE INDEX "payment_webhook_events_provider_reference_created_at_idx"
  ON "payment_webhook_events"("provider_reference", "created_at");

-- 5) Fee refunds
CREATE TYPE "PaymentRefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "payment_refunds" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "booking_id" UUID,
  "amount_pesewas" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'GHS',
  "status" "PaymentRefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "provider_refund_id" TEXT,
  "attempt_number" INTEGER NOT NULL DEFAULT 1,
  "requested_by_id" UUID,
  "reviewed_by_id" UUID,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_refunds_idempotency_key_key" ON "payment_refunds"("idempotency_key");
CREATE UNIQUE INDEX "payment_refunds_provider_refund_id_key" ON "payment_refunds"("provider_refund_id");
CREATE INDEX "payment_refunds_status_created_at_idx" ON "payment_refunds"("status", "created_at");
CREATE INDEX "payment_refunds_booking_id_created_at_idx" ON "payment_refunds"("booking_id", "created_at");

ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_amount_positive" CHECK ("amount_pesewas" > 0);

-- One PENDING booking-fee payment per booking (alongside existing SUCCESS partial unique).
CREATE UNIQUE INDEX "payments_one_pending_booking_fee"
  ON "payments" ("booking_id")
  WHERE "purpose" = 'BOOKING_FEE' AND "status" = 'PENDING' AND "booking_id" IS NOT NULL;
