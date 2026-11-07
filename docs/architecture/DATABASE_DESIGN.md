# Database design

Source of truth today: `backend/prisma/schema.prisma` and migration `backend/prisma/migrations/20261106170000_init`. Money is integer pesewas. Identifiers are UUIDs. Table names are snake_case. API coordinates are latitude/longitude. GeoJSON positions are `[longitude, latitude]`.

This document does not add a migration. The first half is the schema that exists today. The last section is the approved target. It has not been migrated.

## Entity map

| Requested entity | In the schema | Notes |
| --- | --- | --- |
| User | `users` | One phone, one role: `PASSENGER`, `RIDER`, or `ADMIN`. Status `ACTIVE`, `SUSPENDED`, `DELETED` |
| PassengerProfile | `passenger_profiles` | 1:1 with user. `full_name` optional |
| RiderProfile | `rider_profiles` | 1:1 with user. Verification and availability live here |
| RiderVehicle | not a table | `vehicle_registration` and `vehicle_description` are columns on `rider_profiles`. No vehicle type column |
| RiderVerification | not a table | `verification_status` on `rider_profiles`: `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`. Files are `rider_documents` |
| OtpChallenge | `otp_challenges` | No user foreign key. A challenge can exist before the user. Stores `code_hash`, not the code |
| RefreshSession | `refresh_tokens` | Opaque token stored as `token_hash`. `revoked_at` supports revocation |
| Booking | `bookings` | Status, coordinates, labels, fee in pesewas, timestamps per terminal state |
| BookingOffer | `booking_offers` | Unique `(booking_id, rider_id)` |
| BookingStatusHistory | not a table | Status timestamps are columns on `bookings`. No event history |
| RiderLocation | `rider_locations` | One current point per rider. Not a trail |
| Wallet | `rider_wallets` | One row per rider. `token_balance` |
| WalletTransaction | `token_ledger_entries` | Append-only ledger. `idempotency_key` unique |
| Payment | `payments` | Paystack booking fee or token purchase |
| PaymentWebhookEvent | not a table | `payments.provider_event_id` is unique. A second event id for the same payment has nowhere to go except that column |
| ServiceZone | `service_zones` | GeoJSON `boundary` plus bounding box columns |
| AuditLog | `audit_logs` | Actor, action, entity, metadata, IP |

Also present and not in the request list: `notifications`, `rider_documents`.

No school, student, guardian, or route tables exist. Do not add them in the local-ride work.

## ERD

```text
users
  | 1
  |-- 0..1 passenger_profiles
  |-- 0..1 rider_profiles
  |         |-- 0..1 rider_locations
  |         |-- 0..1 rider_wallets
  |         |-- * rider_documents
  |         |-- * token_ledger_entries
  |         |-- * booking_offers
  |         '-- * bookings (as assigned rider)
  |-- * refresh_tokens
  |-- * bookings (as passenger)
  |-- * payments
  |-- * notifications
  '-- * audit_logs (actor, nullable)

otp_challenges   (no FK; phone + purpose)

service_zones
  '-- * bookings (optional)

bookings
  |-- * booking_offers
  |-- * payments
  '-- * token_ledger_entries
```

A passenger user does not get a rider profile. A rider user does not need a passenger profile. The OTP verify contract rejects a phone that already belongs to the other role (`docs/BUSINESS_RULES.md`). The database enforces one phone via `users.phone_number` unique, not a role check. The service must enforce the role check.

`bookings.rider_id` is null until accept. Offers point at riders who were asked. In the current enum a rejection does not change the booking, which stays `REQUESTED`. The target replaces that pre-accept state with `SEARCHING`. See the target section.

## Booking columns that matter

`bookings.status`: `REQUESTED`, `ACCEPTED`, `CANCELLED`, `COMPLETED`, `EXPIRED`.

There is no `PENDING_PAYMENT` status. `POST /payments/booking-fee` takes a `bookingId`, so the current contract creates the booking before payment. Offers must not be inserted until a successful booking-fee payment exists. That rule is not a database constraint. It has to be in the booking service.

Fee amount default is `100`. The payments table, not the booking row, records whether it was captured.

`booking_offers.status`: `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`.

## Financial constraints already in the migration

From `prisma/financial-constraints.sql`, applied at the end of `20261106170000_init`:

- `rider_wallets.token_balance >= 0`
- `token_ledger_entries.balance_after >= 0`
- `payments.amount_pesewas > 0`
- at most one `SUCCESS` row with `purpose = BOOKING_FEE` per `booking_id`
- at most one `DEDUCTION` ledger row per `booking_id`
- at most one `REFUND` ledger row per `booking_id`

Application idempotency keys, already named in code:

| Key | Use |
| --- | --- |
| `booking-fee:{bookingId}` | The fee payment row |
| `token-debit:booking:{bookingId}` | The acceptance debit |
| `token-refund:booking:{bookingId}` | The single refund of that debit |
| `token-purchase:{paymentId}` | Crediting a pack after Paystack success |

`payments.provider_reference` and `payments.provider_event_id` are unique. A replayed webhook with the same event id can be stored once on the payment row. A second event id cannot. The target moves event identity to `payment_webhook_events`.

`TokenLedgerEntry.paymentId` is a plain column. There is no Prisma relation to `payments`. That is a schema gap, not a second ledger.

## Location

`rider_locations` is the latest fix. `recorded_at` is the device time. `updated_at` is the server write. Matching uses `isFreshLocation` (not older than 30 seconds, not in the future) and `sharing_enabled`. Going offline sets sharing off. The table cannot answer "where was this rider an hour ago." A trail is not required for the current product and is not proposed as a migration here.

## Documents and the Ghana Card column

`rider_documents` stores `kind` (`GHANA_CARD`, `RIDER_PHOTO`, `VEHICLE_PHOTO`) and `storage_key`. Bytes are not in Postgres. No object-storage client exists. The onboarding HTTP schema does not accept document keys.

`rider_profiles.ghana_card_number` is plaintext `TEXT`. Nothing writes it. The target does not use this column. Do not start storing card numbers in it.

## Zones

`service_zones.boundary` is JSON. `isInsideBoundingBox` then `isPointInRing` are the tested checks. Pickup must fall in an active zone. Destination is stored even if it is outside the zone. No zone rows are seeded.

## History today

There is no `booking_status_history` table. `bookings` stores `requested_at`, `accepted_at`, `cancelled_at`, `completed_at`, and `expired_at`. Those columns are a snapshot, not a log. The target adds an append-only history table. It is not created in this phase.

## Future school data

Do not overload `bookings`. When school transport is approved, it should get its own tables (route, stop, enrolment, trip) and may reference `users`. Local-ride queries stay on the local booking set. Client school pins, if ever shown, come from a JSON asset parsed by `SchoolCatalog` and are not rows in this database until a product decision says they are.

## Approved target (not migrated)

The authoritative list is `CYRLO_RIDE_MASTER_SPEC.md` section 13. In addition to the rows below: unpaid timeout column (10 minutes), search deadline (5 minutes), status `IN_PROGRESS`, vehicle category limited to tricycle and car, per-zone rider approval, staff role grants, a provisional token-pack table, trip GPS points for disputes, and dispute records. `REQUESTED` is not a target status. `ghana_card_number` is not the identity store. Deactivating a zone must not delete or null historical bookings.

Launch packs, not yet a table: `STARTER` (20 tokens, 1000 pesewas), `STANDARD` (50, 2000), `PRO` (150, 5000).

## Approved target objects already listed

These objects are required by the finalized business rules and the financial review. They are a design, not a migration.

| Need | Target | Why the current table is not enough |
| --- | --- | --- |
| Search clock | `bookings.search_expires_at`, status `SEARCHING` | No clock column. `REQUESTED` mixes unpaid and searching |
| Unpaid and failed fees | Statuses `AWAITING_PAYMENT` and `PAYMENT_FAILED` | A failed fee cannot be told apart from an open search |
| One winner | Partial unique index on one `ACCEPTED` offer per booking, and on one `ACCEPTED` or `IN_PROGRESS` booking per rider | Two offers can both be `ACCEPTED`. Two bookings can name the same rider |
| Status history | `booking_status_history` (`booking_id`, from, to, actor, reason, `created_at`) | Snapshot timestamps overwrite the story of a later cancel |
| Webhook processing | `payment_webhook_events` with a unique provider event id, payload hash, and processed time | `payments.provider_event_id` stores one id |
| Fee refunds | `payment_refunds`: payment id, amount, status `REQUESTED` / `PROCESSING` / `SUCCEEDED` / `FAILED`, provider refund id, idempotency key | No refund status. Changing the payment off `SUCCESS` would hide the capture |
| Token refund link | `token_ledger_entries.reverses_entry_id` nullable, self foreign key, `ON DELETE RESTRICT` | A refund only shares `booking_id` with the debit |
| Ledger to payment | Foreign key from `payment_id` to `payments`, `ON DELETE RESTRICT` | The column is a bare UUID |
| Identity secret | `rider_identity_secrets`: rider id, ciphertext, nonce, key version. No plaintext number | `ghana_card_number` is plaintext on the profile |
| Document bytes | Remain outside Postgres. `storage_key` only | Already true for `rider_documents`. Keep it |

Also required when the migration is eventually written, from the financial review:

- `ON DELETE RESTRICT` for `payments.booking_id` and `token_ledger_entries.booking_id`, replacing `SET NULL`.
- Checks that coordinates are in range, `booking_fee_pesewas = 100`, a `DEDUCTION` delta is negative, a `REFUND` or `PURCHASE` delta is positive, and a booking status matches its timestamp and rider id.
- No `DELETE` of payments, ledger rows, refund rows, webhook events, or status history by the application role.

`rider_profiles` keeps `verification_status` and `verification_notes` as the administrative review. Those columns must not contain the card number. Availability stays on the profile. The secret table is not joined by ordinary rider queries.

Wallet balance updates stay on `rider_wallets`, written only in the locked transaction described in `FINANCIAL_ARCHITECTURE.md`. The non-negative checks already in the first migration stay. They must not be dropped by a later Prisma diff. See `DATABASE_AND_FINANCIAL_REVIEW.md`.
