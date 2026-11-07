-- Milestone 9: server-managed token packages and durable purchases with snapshots.

CREATE TABLE "token_packages" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_quantity" INTEGER NOT NULL,
    "price_pesewas" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GHS',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "token_packages_code_key" ON "token_packages"("code");
CREATE INDEX "token_packages_is_active_display_order_idx" ON "token_packages"("is_active", "display_order");

CREATE TYPE "TokenPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'ABANDONED');

CREATE TABLE "token_purchases" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "package_code" TEXT NOT NULL,
    "package_name" TEXT NOT NULL,
    "token_quantity" INTEGER NOT NULL,
    "price_pesewas" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GHS',
    "status" "TokenPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "token_purchases_payment_id_key" ON "token_purchases"("payment_id");
CREATE INDEX "token_purchases_rider_id_created_at_idx" ON "token_purchases"("rider_id", "created_at");
CREATE INDEX "token_purchases_status_created_at_idx" ON "token_purchases"("status", "created_at");
CREATE INDEX "token_purchases_package_id_created_at_idx" ON "token_purchases"("package_id", "created_at");

ALTER TABLE "token_purchases"
  ADD CONSTRAINT "token_purchases_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "token_purchases"
  ADD CONSTRAINT "token_purchases_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "token_packages"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "token_purchases"
  ADD CONSTRAINT "token_purchases_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initial configurable catalog (not permanent hardcoded runtime constants).
INSERT INTO "token_packages" ("id", "code", "name", "token_quantity", "price_pesewas", "currency", "is_active", "display_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'STARTER', 'Starter', 20, 1000, 'GHS', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'STANDARD', 'Standard', 50, 2000, 'GHS', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRO', 'Pro', 150, 5000, 'GHS', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- One PURCHASE ledger credit per payment (idempotent token credit).
CREATE UNIQUE INDEX "token_ledger_one_purchase_per_payment"
  ON "token_ledger_entries" ("payment_id")
  WHERE "type" = 'PURCHASE' AND "payment_id" IS NOT NULL;
