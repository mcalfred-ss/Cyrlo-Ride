-- Phase 11A: durable refund processing, reconciliation cases, worker claim fields.

DO $$ BEGIN
  ALTER TYPE "PaymentRefundStatus" ADD VALUE 'MANUAL_RECONCILIATION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "payment_refunds"
  ADD COLUMN IF NOT EXISTS "locked_by" TEXT,
  ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provider_status" TEXT,
  ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "reconciliation_note" TEXT;

CREATE INDEX IF NOT EXISTS "payment_refunds_next_attempt_idx"
  ON "payment_refunds" ("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "payment_refunds_locked_at_idx"
  ON "payment_refunds" ("status", "locked_at");

CREATE TABLE IF NOT EXISTS "financial_reconciliation_cases" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "payment_id" UUID REFERENCES "payments"("id") ON DELETE RESTRICT,
  "refund_id" UUID REFERENCES "payment_refunds"("id") ON DELETE SET NULL,
  "token_purchase_id" UUID,
  "provider_reference" TEXT,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "opened_by_id" UUID,
  "resolved_by_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "financial_reconciliation_cases_status_idx"
  ON "financial_reconciliation_cases" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "financial_reconciliation_cases_payment_idx"
  ON "financial_reconciliation_cases" ("payment_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "financial_reconciliation_cases_open_payment_type_uidx"
  ON "financial_reconciliation_cases" ("payment_id", "case_type")
  WHERE "status" = 'OPEN' AND "payment_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "refund_reconciliation_attempts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "refund_id" UUID NOT NULL REFERENCES "payment_refunds"("id") ON DELETE CASCADE,
  "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_id" UUID,
  "outcome" TEXT NOT NULL,
  "local_status" TEXT NOT NULL,
  "provider_status" TEXT,
  "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "refund_reconciliation_attempts_refund_idx"
  ON "refund_reconciliation_attempts" ("refund_id", "attempted_at");
