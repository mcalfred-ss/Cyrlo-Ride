# Database and financial review

This file records the source as inspected on 2026-11-06. It is not the approved target. Booking status `REQUESTED`, the boolean refund helpers, and the single `ADMIN` role appear here because they are what the code does. The target is `CYRLO_RIDE_MASTER_SPEC.md`. Corrections in this review that tell a future migration to call `shouldRefundBookingFee` are superseded by the refund matrix. Do not extend those booleans.

Review date: 2026-11-06. Source inspected: `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261106170000_init/migration.sql`, `backend/prisma/financial-constraints.sql`, and the booking, wallet, payment, and auth modules under `backend/src`. No schema, migration, or application file was changed. Tests were not re-run. The database was not migrated or queried.

The migration SQL matches the Prisma models, then appends the checks and partial unique indexes from `financial-constraints.sql`. Those extra rules are not represented in `schema.prisma`.

Wallet, payment, booking, and auth **services do not move data**. Each public method calls `notImplemented`. Repositories only hold a `PrismaClient`. The findings below separate three layers:

- a database rule that Postgres would enforce after this migration
- a pure function that exists and is unit-tested
- an operation that is not implemented

## Summary

| ID | Topic | Classification |
| --- | --- | --- |
| D1 | Model, key, and index inventory matches the migration | PASS |
| D2 | Financial checks are outside Prisma's model | NEEDS IMPROVEMENT |
| D3 | Booking and ledger rows can be detached from the money they record | NEEDS IMPROVEMENT |
| D4 | Status, money, and profile invariants are not checked in the database | NEEDS IMPROVEMENT |
| D5 | `token_ledger_entries.payment_id` has no foreign key | NEEDS IMPROVEMENT |
| D6 | National ID is a plaintext column | SECURITY RISK |
| W1 | Stored token balance cannot be negative | PASS |
| W2 | Debit, credit, and refund operations | MISSING |
| W3 | Ledger rows are not update-protected | NEEDS IMPROVEMENT |
| W4 | One deduction and one refund per booking id | PASS |
| W5 | A refund does not reference the debit it reverses | NEEDS IMPROVEMENT |
| W6 | Concurrent balance updates can lose a token without going negative | NEEDS IMPROVEMENT |
| P1 | Paystack initialize, verify API, and webhook handler | MISSING |
| P2 | Webhook signature check | PASS |
| P3 | Same idempotency key or same successful booking fee cannot be inserted twice | PASS |
| P4 | Several pending fees, and a second purchase credit, are still possible | NEEDS IMPROVEMENT |
| P5 | Payment status can move backwards | NEEDS IMPROVEMENT |
| P6 | A cedis refund has no representation | MISSING |
| B1 | Booking and offer transition functions | PASS |
| B2 | Cancellation and expiry behaviour | MISSING |
| B3 | The database does not enforce the state machine or one acceptance | NEEDS IMPROVEMENT |
| B4 | Accept does not debit a token | MISSING |
| B5 | Status history | MISSING |
| A1 | OTP hash, expiry, and attempt helpers | PASS |
| A2 | OTP verify, resend lock, and single active challenge | MISSING |
| A3 | Access-token sign and verify | PASS |
| A4 | Access-token algorithm is not pinned, and the token is not rechecked against the user row | NEEDS IMPROVEMENT |
| A5 | Refresh rotation and revocation | MISSING |
| A6 | Role middleware exists and is unused | NEEDS IMPROVEMENT |
| A7 | Resource ownership checks | MISSING |

## 1. Database

### Inventory

Every primary key is a UUID. `passenger_profiles`, `rider_profiles`, `rider_locations`, and `rider_wallets` use the user id as the primary key. `otp_challenges` has no foreign key. A challenge can exist before a user does.

| Model | Relationships | On delete |
| --- | --- | --- |
| `User` | Refresh tokens, passenger profile, rider profile, passenger bookings, payments, notifications, audit rows | See children |
| `RefreshToken` | `user_id` → `users.id` | CASCADE |
| `OtpChallenge` | None | — |
| `PassengerProfile` | `user_id` → `users.id` | CASCADE |
| `RiderProfile` | `user_id` → `users.id`. Children: location, wallet, documents, rider bookings, offers, ledger | CASCADE from user |
| `RiderDocument` | `rider_id` → `rider_profiles.user_id` | CASCADE |
| `RiderLocation` | `rider_id` → `rider_profiles.user_id` | CASCADE |
| `ServiceZone` | Referenced by bookings | Booking zone id is SET NULL |
| `Booking` | `passenger_id` → `users.id`. Optional `rider_id` → rider profile. Optional `service_zone_id`. Children: offers, payments, ledger | Passenger RESTRICT. Rider SET NULL. Zone SET NULL |
| `BookingOffer` | `booking_id`, `rider_id` | Both RESTRICT |
| `Payment` | `user_id`. Optional `booking_id` | User RESTRICT. Booking SET NULL |
| `RiderWallet` | `rider_id` → rider profile | CASCADE |
| `TokenLedgerEntry` | `rider_id`. Optional `booking_id`. `payment_id` is a bare UUID | Rider RESTRICT. Booking SET NULL. Payment has no foreign key |
| `Notification` | `user_id` | CASCADE |
| `AuditLog` | Optional `actor_id` | SET NULL |

Unique constraints in the migration:

| Name | Columns | Partial predicate |
| --- | --- | --- |
| `users_phone_number_key` | `phone_number` | — |
| `refresh_tokens_token_hash_key` | `token_hash` | — |
| `booking_offers_booking_id_rider_id_key` | `(booking_id, rider_id)` | — |
| `payments_provider_reference_key` | `provider_reference` | — |
| `payments_idempotency_key_key` | `idempotency_key` | — |
| `payments_provider_event_id_key` | `provider_event_id` | — |
| `token_ledger_entries_idempotency_key_key` | `idempotency_key` | — |
| `payments_one_successful_booking_fee` | `booking_id` | `purpose = BOOKING_FEE AND status = SUCCESS AND booking_id IS NOT NULL` |
| `token_ledger_one_debit_per_booking` | `booking_id` | `type = DEDUCTION AND booking_id IS NOT NULL` |
| `token_ledger_one_refund_per_booking` | `booking_id` | `type = REFUND AND booking_id IS NOT NULL` |

Postgres unique indexes still allow many NULLs. Several payments can share a null `provider_reference` or a null `provider_event_id`. Deductions with a null `booking_id` are not covered by the one-debit index.

Secondary indexes: refresh tokens by user; OTP by phone, purpose, and created time; documents by rider and kind; locations by sharing flag and recorded time; zones by active flag; bookings by passenger and created time, by rider and status, and by status and requested time; offers by rider and status; payments by user and created time, and by booking and purpose; ledger by rider and created time; notifications by user and created time; audit by entity and by actor and created time.

Checks, present only in the migration SQL:

- `rider_wallets.token_balance >= 0`
- `token_ledger_entries.balance_after >= 0`
- `payments.amount_pesewas > 0`

No other check constraints exist. There is no check that a coordinate is inside WGS84, that `booking_fee_pesewas` is 100, that a timestamp matches `bookings.status`, that `token_delta` has the sign of its ledger type, or that a passenger user cannot also own a rider profile.

### D1. Inventory matches the migration

**PASS.** Table list, column types, primary keys, foreign keys, ordinary unique indexes, and secondary indexes in `20261106170000_init` match `schema.prisma`. `onDelete` in the schema matches the SQL (`Cascade`, required relations defaulting to `RESTRICT`, optional relations defaulting to `SET NULL`).

### D2. Financial checks sit outside the Prisma schema

**NEEDS IMPROVEMENT.**

Evidence: `schema.prisma` has no `@@check` and no partial `@@unique` for the fee and ledger rules. Those statements are appended at the bottom of the migration and copied in `financial-constraints.sql`. Prisma's schema is what `prisma db push` and the next `migrate dev` diff treat as the desired database. A later diff can emit `DROP CONSTRAINT` / `DROP INDEX` for rules the schema does not know about.

Consequence: a routine schema change can silently remove the non-negative balance checks and the one-fee / one-debit / one-refund indexes. `db push` never applies `financial-constraints.sql` at all.

Correction: keep the SQL, and add a check that fails if those three constraints and three partial indexes are absent. Re-append them in any generated migration that drops them. Do not use `db push` against this database.

### D3. Financial rows can be detached or removed

**NEEDS IMPROVEMENT.**

Evidence: `payments.booking_id` and `token_ledger_entries.booking_id` are `ON DELETE SET NULL`. `booking_offers` is `ON DELETE RESTRICT`, so a booking that already has offers cannot be deleted. A booking with a payment or a ledger row and no offers can be deleted, and those rows lose `booking_id`. `rider_wallets` is `ON DELETE CASCADE` from the rider profile, while the ledger only restricts deleting the profile. `DELETE FROM rider_wallets WHERE rider_id = ...` is allowed and leaves the ledger in place. Nothing stops `DELETE` on `payments` or `token_ledger_entries`.

Consequence: the fee and the token movement can survive without the booking they belong to, or the balance row can disappear while the ledger still says the rider holds tokens. A new wallet at balance 0 would then disagree with the ledger.

Correction: use `ON DELETE RESTRICT` for payment and ledger booking foreign keys. Point the ledger at the wallet as well, or reject wallet deletes while ledger rows exist. Revoke `DELETE` and `UPDATE` on `payments`, `token_ledger_entries`, and `audit_logs` from the application role. Corrections belong in a later migration, not in this review.

### D4. Cross-field invariants are application-only

**NEEDS IMPROVEMENT.**

Evidence from the migration: no check joins `bookings.status` to `rider_id`, `accepted_at`, `cancelled_at`, `completed_at`, or `expired_at`. No check limits latitude, longitude, heading, or accuracy. No check forces `booking_fee_pesewas = 100` or even `> 0`. No check requires `BOOKING_FEE` payments to have a booking id, or forbids a booking id on `TOKEN_PURCHASE`. No check ties `users.role` to which profile exists, so one user can have both profiles. No partial unique index limits a rider to one `ACCEPTED` booking, or a booking to one `ACCEPTED` offer. `rider_documents` is indexed on `(rider_id, kind)` and is not unique, so a rider can have many Ghana Card rows.

Consequence: a row can say `ACCEPTED` with no rider and no `accepted_at`, or `COMPLETED` and `CANCELLED` timestamps together. Two accepted offers can exist for one booking. The 100-pesewa fee can be overwritten with another integer. Matching cannot trust the table without repeating the rules in code.

Correction: add checks for coordinate ranges, fee amount, payment purpose versus `booking_id`, and status versus the matching timestamp and rider id. Add a partial unique index on `booking_offers (booking_id) WHERE status = 'ACCEPTED'` and on `bookings (rider_id) WHERE status = 'ACCEPTED'`. Keep the role/profile rule in the auth service as well, because a check across two tables needs a trigger or a later schema.

### D5. Ledger payment id is not a foreign key

**NEEDS IMPROVEMENT.**

Evidence: `TokenLedgerEntry.paymentId` is an optional UUID. The migration creates no `token_ledger_entries_payment_id_fkey`. Prisma declares no relation.

Consequence: a purchase row can name a payment that does not exist. Deleting a payment does not affect the credit that payment produced.

Correction: add a foreign key to `payments.id` with `ON DELETE RESTRICT`, and a partial unique index on `payment_id` where `type = 'PURCHASE'`.

### D6. Ghana Card number is plaintext

**SECURITY RISK.**

Evidence: `rider_profiles.ghana_card_number` is nullable `TEXT`. There is no hash, no encryption, and no column comment restricting it. The onboarding service does not write it yet. The column is still in the initial migration, so the first deploy creates a place for a national identity number in the main application database.

Consequence: a database backup or a SQL injection later exposes the identity number together with the phone number. The backup script writes a full custom-format dump.

Correction: do not store the raw number. Store a hash when uniqueness is required, and keep the document image in private object storage under `rider_documents.storage_key`. If the raw number is legally required, encrypt it with a key that is not in the database backup, and keep it out of logs and audit metadata.

## 2. Wallet

`WalletServiceImpl` implements `getBalance`, `creditPurchase`, `debitForAcceptance`, and `refundForBooking` by calling `notImplemented`. `WalletRepository.database()` is never used. No file calls `prisma.$transaction` or `FOR UPDATE`.

`IdempotencyKey` names the intended keys:

- `token-purchase:{paymentId}`
- `token-debit:booking:{bookingId}`
- `token-refund:booking:{bookingId}`

`acceptanceTokenDelta` is `-1`, from `TOKEN_COST_PER_ACCEPTANCE`.

### W1. Negative stored balance

**PASS**, for the column only.

Evidence: `rider_wallets_token_balance_nonnegative` and `token_ledger_balance_after_nonnegative` are in the applied migration. An `UPDATE` or `INSERT` that stores a negative integer fails.

This does not make a debit safe. See W6.

### W2. Debit, credit, and refund operations

**MISSING.**

Evidence: the four wallet methods throw `NOT_IMPLEMENTED`. The module test expects that. No statement adds a ledger row and updates `token_balance` together.

Consequence: nothing can deduct a token on accept, credit a pack, or refund a token. The keys and the delta are names and a constant, not a transaction.

Correction: one database function or one Prisma transaction that locks the wallet row, inserts the ledger row, and sets `token_balance` from the locked value. The service returns the existing row when the idempotency key already exists.

### W3. Ledger immutability

**NEEDS IMPROVEMENT.**

Evidence: `token_ledger_entries` has `created_at` and no `updated_at`, so the table is shaped like an append-only log. There is no trigger or grant that blocks `UPDATE` or `DELETE`. `token_delta` is any integer. `balance_after` is any non-negative integer. Nothing requires `balance_after` to equal the previous balance plus `token_delta`. `ADJUSTMENT` has no idempotency rule beyond a unique key the caller chooses.

Consequence: a later statement can change a posted deduction or delete it. The balance check still passes. The ledger then stops being evidence.

Correction: revoke `UPDATE` and `DELETE` on the ledger from the application role. Add a check that `DEDUCTION` has a negative delta, `PURCHASE` and `REFUND` have a positive delta, and a deduction or refund names a booking. Write adjustments only from an audited admin path with their own idempotency key.

### W4. Duplicate deduction for one booking

**PASS**, when the debit row includes `booking_id`.

Evidence: `token_ledger_one_debit_per_booking` allows one `DEDUCTION` per non-null `booking_id`. The idempotency key is also unique. `IdempotencyKey.tokenDebit` and `tokenRefund` differ, and `domain.test.ts` asserts that. The same partial pattern allows one `REFUND` per booking.

A deduction with a null `booking_id`, or a second deduction that uses a new idempotency key and a null booking, is not stopped by the partial index. The key uniqueness stops only an exact key replay.

### W5. Refunds do not point at the original debit

**NEEDS IMPROVEMENT.**

Evidence: a refund is a second `token_ledger_entries` row with `type = REFUND`, the same `booking_id`, and key `token-refund:booking:{bookingId}`. There is no `reverses_entry_id`. The unique refund index does not require a `DEDUCTION` to exist. `token_delta` on the refund is not required to be the negation of the debit. `shouldRefundToken` decides whether a refund should happen. It does not write one.

Consequence: a refund can be stored for a booking that was never debited, or for a different number of tokens than the debit. Support cannot show which ledger row was reversed except by matching `booking_id` and the key convention.

Correction: require a `DEDUCTION` for that booking before inserting the refund, in the same transaction. Set the refund delta from the stored debit, not from the caller. Optionally add `reverses_entry_id` referencing the debit row.

### W6. Concurrent debits

**NEEDS IMPROVEMENT.**

Evidence: the non-negative check rejects a stored negative number. It does not serialize readers. No code locks `rider_wallets`. The one-debit index is per booking, so two different bookings are two legal deductions.

If the future debit reads `token_balance`, subtracts 1 in the application, and writes the result back, two accepts at balance 1 can both read 1 and both write 0. Both ledger inserts succeed. The rider spends two tokens and the stored balance falls by one. The check stays satisfied.

Consequence: token liability is wrong under concurrency even though the balance never shows a negative number.

Correction: `SELECT token_balance FROM rider_wallets WHERE rider_id = $1 FOR UPDATE`, then insert and update inside that transaction. Refuse the debit when the locked balance is below 1. The conditional update `WHERE token_balance >= 1` is the same lock's effect if it is the only writer.

## 3. Payments

`PaymentsServiceImpl.initiateBookingFee`, `initiateTokenPurchase`, and `handlePaystackWebhook` throw `NOT_IMPLEMENTED`. There is no Paystack HTTP client. `verifyPaystackSignature` is the only provider code. `express.json` keeps `req.rawBody` on the request. The webhook route is not registered, so that buffer is unused.

`PaymentStatus` is `PENDING`, `SUCCESS`, `FAILED`, `ABANDONED`. There is no refunded status and no refund table.

### P1. Initialization, verification, and webhook handling

**MISSING.**

Evidence: the service methods do not call Paystack, do not insert `payments`, and do not read `rawBody`. No code calls `GET /transaction/verify/:reference`.

Consequence: a passenger cannot pay the booking fee, a rider cannot buy tokens, and a Paystack retry has no handler to be idempotent against.

Correction: initialize on the server with the stored amount and the idempotency key. Treat the webhook as a hint. Confirm the reference, amount, currency, and status with Paystack's verify API or by trusting only a signature-checked event whose amount matches the stored row. Ignore amounts supplied by the Flutter app.

### P2. Signature validation

**PASS.**

Evidence: `verifyPaystackSignature` computes HMAC-SHA512 over the raw buffer with the secret, rejects a missing signature, an empty secret, or a different length, then compares with `timingSafeEqual`. `domain.test.ts` covers a valid signature, a wrong secret, and a short signature.

The helper does not parse the event or enforce amount. That remains part of P1.

### P3. Duplicate success rows for one key or one booking fee

**PASS**, for the cases the indexes cover.

Evidence: `idempotency_key` is `NOT NULL` and unique. `IdempotencyKey.bookingFee(bookingId)` is `booking-fee:{bookingId}`, so a second insert for the same booking fee key fails. `payments_one_successful_booking_fee` rejects a second `SUCCESS` booking fee for the same non-null `booking_id`. `provider_reference` and `provider_event_id` are unique when they are not null.

### P4. Duplicate pending fees and duplicate credits

**NEEDS IMPROVEMENT.**

Evidence: the successful-fee index ignores `PENDING`, `FAILED`, and `ABANDONED`. Two pending booking-fee rows for one booking insert successfully if they use different idempotency keys. The key helper uses the booking id, so the intended key would collide. A bug that mints another key would not. The index also ignores a `SUCCESS` fee whose `booking_id` is null, and many of those are allowed.

Wallet credits are not unique per payment. Only the idempotency key is unique. Two `PURCHASE` rows can share `payment_id` if the keys differ. W5's missing foreign key makes that worse.

Webhook retries that send a new event id cannot be stored beside the first, because `provider_event_id` is a single nullable column. A retry of the same id can be detected only after a handler exists. A second event type (`charge.success` then `refund.processed`) has nowhere to go.

Consequence: two checkouts can be open for one booking. A replay that does not reuse the exact ledger key can credit tokens twice. A second event can be dropped or can fail the unique constraint and leave the payment state unclear.

Correction: partial unique index on `payments (booking_id) WHERE purpose = 'BOOKING_FEE' AND status IN ('PENDING', 'SUCCESS')`. Partial unique index on `token_ledger_entries (payment_id) WHERE type = 'PURCHASE'`. Store each webhook delivery in its own table keyed by the event id, and make the handler a no-op when that id is already processed.

### P5. Payment status transitions

**NEEDS IMPROVEMENT.**

Evidence: no function maps `PENDING` to `SUCCESS`, `FAILED`, or `ABANDONED`. The column can be updated from `SUCCESS` back to `PENDING` or `FAILED`. Doing that removes the row from `payments_one_successful_booking_fee` and frees the booking for another successful fee.

Consequence: a later update can reopen a captured fee and allow a second capture, or can mark a captured fee failed without a refund record.

Correction: a status function that allows only `PENDING → SUCCESS`, `PENDING → FAILED`, and `PENDING → ABANDONED`. Do not update a `SUCCESS` row in place to represent a refund. Record the refund separately (P6).

### P6. Refund representation

**MISSING.**

Evidence: `shouldRefundBookingFee` returns true when the fee was captured, the rider has not accepted, and the next status is `CANCELLED` or `EXPIRED`. It returns false after acceptance. The domain test covers those three calls. No column stores a refund reference, a refunded amount, or a refunded time. `PaymentPurpose` has no refund value. No code calls a Paystack refund API.

Consequence: the predicate can say a fee should be returned, and the database cannot record that Paystack returned it. Marking the original row `FAILED` would also drop the successful-fee uniqueness (P5).

Correction: a refund record that references the original payment, stores the provider refund id and the amount, and does not change the original row away from `SUCCESS`. Apply it only when `shouldRefundBookingFee` is true and `accepted_at` is null.

## 4. Bookings

`BookingsServiceImpl.createRequest`, `cancel`, and `complete` throw `NOT_IMPLEMENTED`. `Matching` accept and reject do the same. The executable booking logic is `booking-rules.ts`.

### B1. Transition functions

**PASS.**

Evidence: `assertBookingTransition` and `assertOfferTransition` throw `409 CONFLICT` when the edge does not exist and `403 FORBIDDEN` when the actor is wrong. Terminal states have no exits.

| From | To | Actor |
| --- | --- | --- |
| `REQUESTED` | `ACCEPTED` | `RIDER` |
| `REQUESTED` | `CANCELLED` | `PASSENGER`, `ADMIN`, `SYSTEM` |
| `REQUESTED` | `EXPIRED` | `SYSTEM` |
| `ACCEPTED` | `CANCELLED` | `PASSENGER`, `RIDER`, `ADMIN`, `SYSTEM` |
| `ACCEPTED` | `COMPLETED` | `RIDER` |

Offer edges from `PENDING`: rider accept, rider reject, system expire, and cancel by passenger, admin, or system. A rider reject does not have a booking transition. The booking can stay `REQUESTED`.

`domain.test.ts` checks rider accept and complete, passenger accept denied, completed booking closed, and offer reject versus accept.

The functions compare the status the caller passes in. They do not read the row. A caller that skips them can write any status. The database will accept it (B3).

### B2. Cancellation and expiry behaviour

**MISSING.**

Evidence: cancel and complete are unimplemented. No job selects `status = REQUESTED`. `bookings` has `requested_at` and `expired_at`, and an index on `(status, requested_at)`, and no `expires_at` deadline. No constant defines how long a request lives. `shouldRefundBookingFee` and `shouldRefundToken` are not called from a service.

`shouldRefundToken` treats a missing `cancelledBy` as refundable, because it only excludes `RIDER`. A caller that omits the actor refunds the token.

Consequence: nothing cancels, expires, completes, or refunds. When those functions are wired, an omitted actor silently refunds a token.

Correction: implement cancel and complete by loading the row, calling `assertBookingTransition`, and writing the status and the single timestamp in one transaction. Require `cancelledBy` when asking `shouldRefundToken`. Add the expiry deadline only after the product chooses the duration. The sweep is `SYSTEM` and only from `REQUESTED`.

### B3. Acceptance concurrency is not enforced by the schema

**NEEDS IMPROVEMENT.**

Evidence: one booking row has one `rider_id`, but nothing stops two transactions from both observing `REQUESTED` and both writing `ACCEPTED`. There is no `WHERE status = 'REQUESTED'` update in code, and no partial unique index on one accepted offer. Two `booking_offers` rows can both be `ACCEPTED`. The one-debit index would reject the second deduction for that same booking. It would not roll back an offer update that already committed on its own.

A rider can also hold two `ACCEPTED` bookings. The business rule that an eligible rider is not already on an accepted booking is not a constraint.

Consequence: the named rider, the accepted offer, and the debited rider can disagree if accept is more than one transaction. Last write wins on `rider_id`.

Correction: in one transaction, lock the booking (`FOR UPDATE`), update it only `WHERE status = 'REQUESTED'`, accept one offer, cancel the other pending offers, set the rider `BUSY`, and insert the debit (B4, W6). Add the partial unique indexes from D4 so a bug cannot commit two accepted offers.

### B4. Token deduction is not part of accept

**MISSING.**

Evidence: `acceptanceTokenDelta` is `-1`. No accept method reads it. `debitForAcceptance` throws. The booking module does not call the wallet module.

Consequence: a future accept that only updates status will give the rider a booking without paying a token. A debit written in a second transaction can succeed after the booking has already been cancelled.

Correction: the accept transaction in B3 inserts the debit with `IdempotencyKey.tokenDebit` before commit. A retry of that key returns the accepted booking and does not insert again.

### B5. Status history and auditability

**MISSING.**

Evidence: there is no `booking_status_history` table. `bookings` stores one timestamp per terminal state and a single `cancellation_reason`. A second event overwrites `updated_at` and cannot record both an accept and a later cancel as separate facts beyond those columns. `AuditLog` can store an actor and a JSON payload. `audit` service `record` throws `NOT_IMPLEMENTED`, and no booking function writes an audit row. Audit rows are not append-only (D3).

Consequence: after cancel, the row can show `cancelled_at` and `accepted_at` together, which is useful, but it cannot show who accepted, which offer won, or that an admin cancelled. A direct SQL update can change `status` with no trail.

Correction: insert a history row in the same transaction as each transition the state machine allows: from status, to status, actor, time. Keep the timestamp columns as the current snapshot. Write admin cancels to `audit_logs` as well, and revoke updates on that table.

## 5. Authentication

`AuthServiceImpl.requestOtp`, `verifyOtp`, `refresh`, and `logout` throw `NOT_IMPLEMENTED`. The helpers below are real. `authenticate` and `requireRole` are not referenced by any router. Socket.IO calls `verifyAccessToken` directly and joins `user:{userId}`.

### A1. OTP helpers

**PASS**, for the three functions that exist.

Evidence: `hashOtpCode` is HMAC-SHA256 through `hashSecretValue`. The digest is 64 hex characters. The domain test checks that length. `isOtpExpired` is true when `now >= expiresAt`. `canAttemptOtp` is true only while `attempts < maxAttempts`. Defaults in `env.ts` are 300 seconds, 5 attempts, and a 60 second resend cooldown. The schema stores `code_hash`, `expires_at`, `attempts`, `max_attempts`, and `consumed_at`. It does not store the code.

HMAC is appropriate for a short code only because the pepper is server-side. A leaked pepper makes the 6-digit space trivial to search. The attempt limit is the control that has to run.

### A2. OTP issuance and verify

**MISSING.**

Evidence: no service inserts a challenge, increments `attempts`, sets `consumed_at`, or calls `secretsMatch` on a code. `isOtpExpired` ignores `consumed_at`. The index `(phone_number, purpose, created_at)` does not limit how many unconsumed challenges exist. `attempts` has no check against `max_attempts`. The global rate limiter is 300 requests per 15 minutes and is not an OTP lock. The Flutter client accepts `123456` locally. That constant is not in the backend. It must not become the server code.

Consequence: when verify is written carelessly it can accept any unconsumed code, skip the attempt counter, or allow a consumed code until `expires_at`. Parallel verify requests can pass `canAttemptOtp` before either increment commits.

Correction: one active challenge per phone and purpose. Increment attempts with `UPDATE ... WHERE attempts < max_attempts AND consumed_at IS NULL` and proceed only when a row changes. Compare with `secretsMatch`. Set `consumed_at` in that same update. Apply a tight per-phone limit. Do not accept a fixed test code.

### A3. Access token

**PASS**, for sign and verify as written.

Evidence: `signAccessToken` puts `sub` and `role` in a JWT with `expiresIn`. `verifyAccessToken` rejects a non-object payload, a non-string `sub`, and a role outside `PASSENGER`, `RIDER`, and `ADMIN`, and maps failure to `401`. The domain test round-trips a token and rejects it under the refresh secret. `loadEnv` rejects equal access and refresh secrets, and in production rejects secrets that contain `change-me` or `development-only`. Default access lifetime is 900 seconds.

### A4. Algorithm pin and live user check

**NEEDS IMPROVEMENT.**

Evidence: `jwt.sign` and `jwt.verify` do not pass `algorithms`, `issuer`, or `audience`. The dependency is `jsonwebtoken` `^9.0.2`. Version 9 defaults a string secret to HS256 inside the library. This call does not say so itself. `authenticate` copies `sub` and `role` from the token onto the request and does not load `users`. A suspended or deleted user remains authorized until the access token expires. Socket.IO does the same. `node_modules` is not installed in this workspace, so the resolved library file was not opened.

Consequence: a token minted with a future library default, or a role that an admin has since removed, is accepted for up to 15 minutes. Suspension is not immediate.

Correction: pass `algorithms: ['HS256']` on sign and verify. After verify, reject the request when `users.status` is not `ACTIVE`. Keep the access token short. Do not put a privilege in the token that the database no longer has, without that check.

### A5. Refresh rotation and revocation

**MISSING.**

Evidence: `createRefreshToken` returns 32 random bytes as base64url. `hashSecretValue` can store an HMAC. Neither is called from `refresh` or `logout`. The `refresh_tokens` table has `token_hash` unique, `expires_at`, and `revoked_at`, plus an index on `user_id`. There is no successor column, no family id, and no service that sets `revoked_at`. Logout is unimplemented. Many unrevoked hashes per user are allowed.

Consequence: a stolen refresh token cannot be rotated or revoked, because nothing issues or revokes one. When refresh is added as "insert another row" without revoking the presented hash, a stolen token keeps working until `expires_at` (default 30 days).

Correction: on refresh, lock the hash row, reject it when it is missing, expired, or revoked, insert the new hash, and set `revoked_at` on the presented row in that transaction. If a revoked hash is presented again, revoke the other live hashes for that user. Logout sets `revoked_at`. Store only the hash. The mobile app still needs secure storage. That dependency is not in the Flutter project.

### A6. Role authorization

**NEEDS IMPROVEMENT.**

Evidence: `requireRole` returns `401` when `req.auth` is missing and `403` when `req.auth.role` is not in the allowed list. No route mounts `authenticate` or `requireRole`. The business routers are empty, so this is not a bypass of a live booking API. It is unused protection. The role compared is the token claim, which A4 does not reconcile with the database.

Consequence: the first route that forgets the middleware is public. A route that uses only `requireRole` still trusts a stale role claim.

Correction: mount `authenticate` and `requireRole` on every business router when that router gains handlers. Follow it with the user-status read from A4.

### A7. Resource ownership

**MISSING.**

Evidence: no function compares `req.auth.sub` with `bookings.passenger_id`, `bookings.rider_id`, `booking_offers.rider_id`, `rider_locations.rider_id`, or `notifications.user_id`. `requireRole` would treat every rider as allowed to complete every ride.

Consequence: knowing a UUID would be enough to cancel, complete, or read another person's booking once those routes exist and check only the role.

Correction: in the service, load the row and require the caller to be the passenger, the assigned rider, or an admin, as each action specifies. Use `404` when the row exists but is not theirs. Use `403` when it is theirs and the role still cannot do the action.

## What this review did not do

No migration was created. No constraint was added. No service was implemented. Paystack, Postgres, and the test suite were not executed. Classifications describe the current source. They are not approval to change it.
