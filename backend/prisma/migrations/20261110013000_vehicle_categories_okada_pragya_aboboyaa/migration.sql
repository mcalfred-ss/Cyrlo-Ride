-- Align vehicle categories with product: Okada, Pragya, Aboboyaa.
-- Remap legacy TRICYCLE → PRAGYA, CAR → OKADA before swapping the enum.

ALTER TYPE "VehicleCategory" RENAME TO "VehicleCategory_old";

CREATE TYPE "VehicleCategory" AS ENUM ('OKADA', 'PRAGYA', 'ABOBOYAA');

ALTER TABLE "rider_vehicles"
  ALTER COLUMN "category" DROP DEFAULT;

ALTER TABLE "rider_vehicles"
  ALTER COLUMN "category" TYPE "VehicleCategory"
  USING (
    CASE "category"::text
      WHEN 'TRICYCLE' THEN 'PRAGYA'::"VehicleCategory"
      WHEN 'CAR' THEN 'OKADA'::"VehicleCategory"
      WHEN 'OKADA' THEN 'OKADA'::"VehicleCategory"
      WHEN 'PRAGYA' THEN 'PRAGYA'::"VehicleCategory"
      WHEN 'ABOBOYAA' THEN 'ABOBOYAA'::"VehicleCategory"
      ELSE 'PRAGYA'::"VehicleCategory"
    END
  );

ALTER TABLE "bookings"
  ALTER COLUMN "vehicle_category" TYPE "VehicleCategory"
  USING (
    CASE "vehicle_category"::text
      WHEN 'TRICYCLE' THEN 'PRAGYA'::"VehicleCategory"
      WHEN 'CAR' THEN 'OKADA'::"VehicleCategory"
      WHEN 'OKADA' THEN 'OKADA'::"VehicleCategory"
      WHEN 'PRAGYA' THEN 'PRAGYA'::"VehicleCategory"
      WHEN 'ABOBOYAA' THEN 'ABOBOYAA'::"VehicleCategory"
      ELSE 'PRAGYA'::"VehicleCategory"
    END
  );

DROP TYPE "VehicleCategory_old";
