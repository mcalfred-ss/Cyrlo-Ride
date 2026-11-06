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
