-- Phase 13A: Finance / matrix authorization gate for Paystack refund execution.
-- Worker may only claim rows with authorized_at set.

ALTER TABLE "payment_refunds"
  ADD COLUMN IF NOT EXISTS "authorized_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "authorized_by_id" UUID;

CREATE INDEX IF NOT EXISTS "payment_refunds_authorized_status_idx"
  ON "payment_refunds" ("status", "authorized_at", "next_attempt_at");

-- Already-submitted or terminal rows were executed under prior policy; mark authorized.
UPDATE "payment_refunds"
SET "authorized_at" = COALESCE("submitted_at", "created_at")
WHERE "authorized_at" IS NULL
  AND "status" IN ('PROCESSING', 'SUCCEEDED', 'FAILED', 'MANUAL_RECONCILIATION');

-- Matrix-policy REQUESTED rows remain auto-executable.
UPDATE "payment_refunds"
SET "authorized_at" = "created_at"
WHERE "authorized_at" IS NULL
  AND "status" = 'REQUESTED'
  AND (
    "reason" IN (
      'passenger_cancel_before_accept',
      'search_expired',
      'late_payment_after_deadline',
      'rider_cancel_after_accept',
      'rider_unable_to_complete'
    )
    OR "reason" LIKE 'matrix:%'
  );

-- Support recommendations (dispute_recommendation:*, passenger_cancel_review:*, etc.)
-- stay unauthorized until Finance authorizes.
