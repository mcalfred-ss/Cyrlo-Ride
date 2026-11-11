-- Nationwide geographical hierarchy + service-zone lifecycle.

CREATE TYPE "GeoEntityStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "DistrictAdminType" AS ENUM ('DISTRICT', 'MUNICIPAL', 'METROPOLITAN', 'OTHER');
CREATE TYPE "CommunityVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED');
CREATE TYPE "ServiceZoneStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'LOCKED', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "BoundaryVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED');

CREATE TABLE "geo_countries" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "iso_code" CHAR(2) NOT NULL,
    "status" "GeoEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_countries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "geo_countries_iso_code_key" ON "geo_countries"("iso_code");
CREATE INDEX "geo_countries_status_idx" ON "geo_countries"("status");

CREATE TABLE "geo_regions" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "GeoEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "geo_regions_country_id_code_key" ON "geo_regions"("country_id", "code");
CREATE INDEX "geo_regions_country_id_status_idx" ON "geo_regions"("country_id", "status");
CREATE INDEX "geo_regions_name_idx" ON "geo_regions"("name");

CREATE TABLE "geo_districts" (
    "id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "admin_type" "DistrictAdminType" NOT NULL DEFAULT 'DISTRICT',
    "status" "GeoEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_districts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "geo_districts_region_id_code_key" ON "geo_districts"("region_id", "code");
CREATE INDEX "geo_districts_region_id_status_idx" ON "geo_districts"("region_id", "status");
CREATE INDEX "geo_districts_name_idx" ON "geo_districts"("name");

CREATE TABLE "geo_communities" (
    "id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "center_latitude" DECIMAL(9,6),
    "center_longitude" DECIMAL(9,6),
    "boundary" JSONB,
    "verification_status" "CommunityVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "status" "GeoEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_communities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "geo_communities_district_id_slug_key" ON "geo_communities"("district_id", "slug");
CREATE INDEX "geo_communities_district_id_status_idx" ON "geo_communities"("district_id", "status");
CREATE INDEX "geo_communities_name_idx" ON "geo_communities"("name");

ALTER TABLE "service_zones"
    ADD COLUMN "community_id" UUID,
    ADD COLUMN "slug" TEXT,
    ADD COLUMN "status" "ServiceZoneStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "boundary_verification_status" "BoundaryVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    ADD COLUMN "activated_at" TIMESTAMP(3),
    ADD COLUMN "activated_by_id" UUID,
    ADD COLUMN "suspended_at" TIMESTAMP(3),
    ADD COLUMN "suspended_by_id" UUID;

-- Backfill lifecycle from the existing booking gate without inventing verification for inactive zones.
UPDATE "service_zones"
SET
    "status" = CASE WHEN "is_active" THEN 'ACTIVE'::"ServiceZoneStatus" ELSE 'DRAFT'::"ServiceZoneStatus" END,
    "boundary_verification_status" = CASE
        WHEN "is_active" THEN 'VERIFIED'::"BoundaryVerificationStatus"
        ELSE 'UNVERIFIED'::"BoundaryVerificationStatus"
    END,
    "activated_at" = CASE WHEN "is_active" THEN "updated_at" ELSE NULL END;

CREATE INDEX "service_zones_status_idx" ON "service_zones"("status");
CREATE INDEX "service_zones_community_id_status_idx" ON "service_zones"("community_id", "status");
CREATE INDEX "service_zones_slug_idx" ON "service_zones"("slug");

ALTER TABLE "geo_countries"
    ADD CONSTRAINT "geo_countries_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "geo_regions"
    ADD CONSTRAINT "geo_regions_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "geo_countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "geo_regions"
    ADD CONSTRAINT "geo_regions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "geo_districts"
    ADD CONSTRAINT "geo_districts_region_id_fkey"
    FOREIGN KEY ("region_id") REFERENCES "geo_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "geo_districts"
    ADD CONSTRAINT "geo_districts_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "geo_communities"
    ADD CONSTRAINT "geo_communities_district_id_fkey"
    FOREIGN KEY ("district_id") REFERENCES "geo_districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "geo_communities"
    ADD CONSTRAINT "geo_communities_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_zones"
    ADD CONSTRAINT "service_zones_community_id_fkey"
    FOREIGN KEY ("community_id") REFERENCES "geo_communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_zones"
    ADD CONSTRAINT "service_zones_activated_by_id_fkey"
    FOREIGN KEY ("activated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_zones"
    ADD CONSTRAINT "service_zones_suspended_by_id_fkey"
    FOREIGN KEY ("suspended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
