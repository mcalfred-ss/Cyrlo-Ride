-- Milestone 3: rider onboarding, vehicles, encrypted identity, review history.
-- Legacy rider_profiles.ghana_card_number must remain unused (plaintext).

CREATE TYPE "VehicleCategory" AS ENUM ('TRICYCLE', 'CAR');
CREATE TYPE "VehicleVerificationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "RiderReviewDecisionType" AS ENUM ('APPROVED', 'REJECTED');

ALTER TYPE "RiderDocumentKind" ADD VALUE IF NOT EXISTS 'DRIVERS_LICENCE';
ALTER TYPE "RiderDocumentKind" ADD VALUE IF NOT EXISTS 'VEHICLE_REGISTRATION';
ALTER TYPE "RiderDocumentKind" ADD VALUE IF NOT EXISTS 'ROADWORTHINESS';
ALTER TYPE "RiderDocumentKind" ADD VALUE IF NOT EXISTS 'INSURANCE';

ALTER TABLE "rider_profiles"
  ADD COLUMN "drivers_licence_number" TEXT,
  ADD COLUMN "drivers_licence_expiry" TIMESTAMP(3),
  ADD COLUMN "submitted_at" TIMESTAMP(3);

CREATE INDEX "rider_profiles_verification_status_submitted_at_idx"
  ON "rider_profiles"("verification_status", "submitted_at");

CREATE TABLE "rider_identity_secrets" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_identity_secrets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rider_identity_secrets_rider_id_purpose_key"
  ON "rider_identity_secrets"("rider_id", "purpose");

CREATE TABLE "rider_vehicles" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "category" "VehicleCategory" NOT NULL,
    "registration_number" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "verification_status" "VehicleVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rider_vehicles_rider_id_verification_status_idx"
  ON "rider_vehicles"("rider_id", "verification_status");
CREATE INDEX "rider_vehicles_verification_status_submitted_at_idx"
  ON "rider_vehicles"("verification_status", "submitted_at");

ALTER TABLE "rider_documents"
  ADD COLUMN "vehicle_id" UUID,
  ADD COLUMN "content_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "size_bytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "checksum_sha256" TEXT,
  ADD COLUMN "retain_until" TIMESTAMP(3),
  ADD COLUMN "replaced_at" TIMESTAMP(3);

CREATE INDEX "rider_documents_vehicle_id_kind_idx"
  ON "rider_documents"("vehicle_id", "kind");

CREATE TABLE "rider_review_decisions" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "actor_id" UUID NOT NULL,
    "decision" "RiderReviewDecisionType" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_review_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rider_review_decisions_rider_id_created_at_idx"
  ON "rider_review_decisions"("rider_id", "created_at");
CREATE INDEX "rider_review_decisions_vehicle_id_created_at_idx"
  ON "rider_review_decisions"("vehicle_id", "created_at");

ALTER TABLE "rider_identity_secrets"
  ADD CONSTRAINT "rider_identity_secrets_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_vehicles"
  ADD CONSTRAINT "rider_vehicles_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_documents"
  ADD CONSTRAINT "rider_documents_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "rider_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_review_decisions"
  ADD CONSTRAINT "rider_review_decisions_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_review_decisions"
  ADD CONSTRAINT "rider_review_decisions_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "rider_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rider_review_decisions"
  ADD CONSTRAINT "rider_review_decisions_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
