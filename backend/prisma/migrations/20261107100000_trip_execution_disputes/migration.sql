-- Milestone 8: trip start/complete timestamps, trip GPS trail, passenger cancel review, disputes.

ALTER TABLE "bookings"
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "cancellation_actor_type" TEXT;

CREATE TABLE "trip_location_points" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy_meters" DECIMAL(8,2),
    "heading" DECIMAL(6,2),
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_location_points_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_location_points_booking_id_recorded_at_idx" ON "trip_location_points"("booking_id", "recorded_at");
CREATE INDEX "trip_location_points_rider_id_recorded_at_idx" ON "trip_location_points"("rider_id", "recorded_at");

ALTER TABLE "trip_location_points"
  ADD CONSTRAINT "trip_location_points_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "CancellationRequestStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DECLINED', 'ESCALATED');
CREATE TYPE "SupportRecommendation" AS ENUM ('NONE', 'REFUND_FEE', 'NO_REFUND', 'ESCALATE');
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED');

CREATE TABLE "booking_cancellation_requests" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CancellationRequestStatus" NOT NULL DEFAULT 'OPEN',
    "recommendation" "SupportRecommendation" NOT NULL DEFAULT 'NONE',
    "recommended_by_id" UUID,
    "resolution_notes" TEXT,
    "refund_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "booking_cancellation_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_cancellation_requests_booking_id_status_idx" ON "booking_cancellation_requests"("booking_id", "status");
CREATE INDEX "booking_cancellation_requests_status_created_at_idx" ON "booking_cancellation_requests"("status", "created_at");
CREATE INDEX "booking_cancellation_requests_passenger_id_created_at_idx" ON "booking_cancellation_requests"("passenger_id", "created_at");

-- At most one open passenger cancellation request per booking.
CREATE UNIQUE INDEX "booking_cancellation_requests_one_open_per_booking"
  ON "booking_cancellation_requests" ("booking_id")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');

ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_passenger_id_fkey"
  FOREIGN KEY ("passenger_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "submitter_role" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "recommendation" "SupportRecommendation" NOT NULL DEFAULT 'NONE',
    "recommended_by_id" UUID,
    "resolution_notes" TEXT,
    "refund_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "disputes_booking_id_created_at_idx" ON "disputes"("booking_id", "created_at");
CREATE INDEX "disputes_status_created_at_idx" ON "disputes"("status", "created_at");
CREATE INDEX "disputes_submitted_by_id_created_at_idx" ON "disputes"("submitted_by_id", "created_at");

ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "dispute_events" (
    "id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispute_events_dispute_id_created_at_idx" ON "dispute_events"("dispute_id", "created_at");

ALTER TABLE "dispute_events"
  ADD CONSTRAINT "dispute_events_dispute_id_fkey"
  FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dispute_events"
  ADD CONSTRAINT "dispute_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- token_ledger_one_refund_per_booking already exists from init / financial constraints.
