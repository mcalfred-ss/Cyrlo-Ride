-- Milestone 4: service-zone metadata + rider-zone approvals.
-- Default new zones inactive until a verified boundary is activated by Ops/Super Admin.
-- Do not seed polygon coordinates.

CREATE TYPE "RiderZoneApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

ALTER TABLE "service_zones"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "updated_by_id" UUID;

-- Existing rows keep their is_active value; new creates default to false in application code.
-- Align Prisma default for new inserts: set DB default false going forward.
ALTER TABLE "service_zones" ALTER COLUMN "is_active" SET DEFAULT false;

CREATE INDEX "service_zones_name_idx" ON "service_zones"("name");

ALTER TABLE "service_zones"
  ADD CONSTRAINT "service_zones_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_zones"
  ADD CONSTRAINT "service_zones_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rider_zone_approvals" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "status" "RiderZoneApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "decided_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_zone_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rider_zone_approvals_rider_id_zone_id_key"
  ON "rider_zone_approvals"("rider_id", "zone_id");
CREATE INDEX "rider_zone_approvals_zone_id_status_idx"
  ON "rider_zone_approvals"("zone_id", "status");
CREATE INDEX "rider_zone_approvals_rider_id_status_idx"
  ON "rider_zone_approvals"("rider_id", "status");

CREATE TABLE "rider_zone_decisions" (
    "id" UUID NOT NULL,
    "approval_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "status" "RiderZoneApprovalStatus" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_zone_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rider_zone_decisions_rider_id_created_at_idx"
  ON "rider_zone_decisions"("rider_id", "created_at");
CREATE INDEX "rider_zone_decisions_zone_id_created_at_idx"
  ON "rider_zone_decisions"("zone_id", "created_at");
CREATE INDEX "rider_zone_decisions_approval_id_created_at_idx"
  ON "rider_zone_decisions"("approval_id", "created_at");

ALTER TABLE "rider_zone_approvals"
  ADD CONSTRAINT "rider_zone_approvals_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_zone_approvals"
  ADD CONSTRAINT "rider_zone_approvals_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rider_zone_decisions"
  ADD CONSTRAINT "rider_zone_decisions_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "rider_zone_approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_zone_decisions"
  ADD CONSTRAINT "rider_zone_decisions_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_zone_decisions"
  ADD CONSTRAINT "rider_zone_decisions_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rider_zone_decisions"
  ADD CONSTRAINT "rider_zone_decisions_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
