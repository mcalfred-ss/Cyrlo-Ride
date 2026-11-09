-- AlterTable
CREATE TYPE "PassengerGender" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "passenger_profiles"
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "gender" "PassengerGender",
  ADD COLUMN "home_location" TEXT,
  ADD COLUMN "home_latitude" DECIMAL(9,6),
  ADD COLUMN "home_longitude" DECIMAL(9,6);
