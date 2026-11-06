-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PASSENGER', 'RIDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN');

-- CreateEnum
CREATE TYPE "RiderVerificationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiderAvailability" AS ENUM ('OFFLINE', 'AVAILABLE', 'BUSY');

-- CreateEnum
CREATE TYPE "RiderDocumentKind" AS ENUM ('GHANA_CARD', 'RIDER_PHOTO', 'VEHICLE_PHOTO');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'CANCELLED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BookingOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('BOOKING_FEE', 'TOKEN_PURCHASE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('PURCHASE', 'DEDUCTION', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'IN_APP');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passenger_profiles" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passenger_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "rider_profiles" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "verification_status" "RiderVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "availability" "RiderAvailability" NOT NULL DEFAULT 'OFFLINE',
    "ghana_card_number" TEXT,
    "vehicle_registration" TEXT,
    "vehicle_description" TEXT,
    "verification_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "rider_documents" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "kind" "RiderDocumentKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_locations" (
    "rider_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy_meters" DECIMAL(8,2),
    "heading" DECIMAL(5,2),
    "sharing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_locations_pkey" PRIMARY KEY ("rider_id")
);

-- CreateTable
CREATE TABLE "service_zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "boundary" JSONB NOT NULL,
    "min_latitude" DECIMAL(9,6) NOT NULL,
    "max_latitude" DECIMAL(9,6) NOT NULL,
    "min_longitude" DECIMAL(9,6) NOT NULL,
    "max_longitude" DECIMAL(9,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "rider_id" UUID,
    "service_zone_id" UUID,
    "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "pickup_latitude" DECIMAL(9,6) NOT NULL,
    "pickup_longitude" DECIMAL(9,6) NOT NULL,
    "destination_latitude" DECIMAL(9,6) NOT NULL,
    "destination_longitude" DECIMAL(9,6) NOT NULL,
    "pickup_label" TEXT,
    "destination_label" TEXT,
    "booking_fee_pesewas" INTEGER NOT NULL DEFAULT 100,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_offers" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "status" "BookingOfferStatus" NOT NULL DEFAULT 'PENDING',
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "booking_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "booking_id" UUID,
    "purpose" "PaymentPurpose" NOT NULL,
    "amount_pesewas" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GHS',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'paystack',
    "provider_reference" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "provider_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_wallets" (
    "rider_id" UUID NOT NULL,
    "token_balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_wallets_pkey" PRIMARY KEY ("rider_id")
);

-- CreateTable
CREATE TABLE "token_ledger_entries" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "booking_id" UUID,
    "payment_id" UUID,
    "type" "LedgerEntryType" NOT NULL,
    "token_delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_number_purpose_created_at_idx" ON "otp_challenges"("phone_number", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "rider_documents_rider_id_kind_idx" ON "rider_documents"("rider_id", "kind");

-- CreateIndex
CREATE INDEX "rider_locations_sharing_enabled_recorded_at_idx" ON "rider_locations"("sharing_enabled", "recorded_at");

-- CreateIndex
CREATE INDEX "service_zones_is_active_idx" ON "service_zones"("is_active");

-- CreateIndex
CREATE INDEX "bookings_passenger_id_created_at_idx" ON "bookings"("passenger_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_rider_id_status_idx" ON "bookings"("rider_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_requested_at_idx" ON "bookings"("status", "requested_at");

-- CreateIndex
CREATE INDEX "booking_offers_rider_id_status_idx" ON "booking_offers"("rider_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "booking_offers_booking_id_rider_id_key" ON "booking_offers"("booking_id", "rider_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_event_id_key" ON "payments"("provider_event_id");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_booking_id_purpose_idx" ON "payments"("booking_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "token_ledger_entries_idempotency_key_key" ON "token_ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "token_ledger_entries_rider_id_created_at_idx" ON "token_ledger_entries"("rider_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passenger_profiles" ADD CONSTRAINT "passenger_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_profiles" ADD CONSTRAINT "rider_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_documents" ADD CONSTRAINT "rider_documents_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_locations" ADD CONSTRAINT "rider_locations_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_zone_id_fkey" FOREIGN KEY ("service_zone_id") REFERENCES "service_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_offers" ADD CONSTRAINT "booking_offers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_offers" ADD CONSTRAINT "booking_offers_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_wallets" ADD CONSTRAINT "rider_wallets_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Applied with the initial migration. Prisma does not express these rules itself.
ALTER TABLE "rider_wallets"
  ADD CONSTRAINT "rider_wallets_token_balance_nonnegative" CHECK ("token_balance" >= 0);

ALTER TABLE "token_ledger_entries"
  ADD CONSTRAINT "token_ledger_balance_after_nonnegative" CHECK ("balance_after" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_pesewas" > 0);

CREATE UNIQUE INDEX "payments_one_successful_booking_fee"
  ON "payments" ("booking_id")
  WHERE "purpose" = 'BOOKING_FEE' AND "status" = 'SUCCESS' AND "booking_id" IS NOT NULL;

CREATE UNIQUE INDEX "token_ledger_one_debit_per_booking"
  ON "token_ledger_entries" ("booking_id")
  WHERE "type" = 'DEDUCTION' AND "booking_id" IS NOT NULL;

CREATE UNIQUE INDEX "token_ledger_one_refund_per_booking"
  ON "token_ledger_entries" ("booking_id")
  WHERE "type" = 'REFUND' AND "booking_id" IS NOT NULL;
