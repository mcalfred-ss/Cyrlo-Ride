# Database design

One PostgreSQL database. One Prisma schema at `backend/prisma/schema.prisma`. One migration history. Modules do not get separate databases.

Prisma models use camelCase fields and snake_case table names. Identifiers are UUIDs. Money is an integer number of pesewas. `GHS 1.00` is `100`.

## Groups

Identity: `users`, `refresh_tokens`, `otp_challenges`, `passenger_profiles`.

Riders: `rider_profiles`, `rider_documents`, `rider_locations`, `rider_wallets`.

Coverage: `service_zones`. The `boundary` column is a GeoJSON Polygon. Positions in that JSON are `[longitude, latitude]`. The bounding-box columns are a coarse filter before the polygon test.

Rides: `bookings`, `booking_offers`.

Money: `payments`, `token_ledger_entries`.

Messages and history: `notifications`, `audit_logs`.

A phone number belongs to one user and one role in v1. OTP rows can exist before the user does, so they are not a foreign key. Refresh tokens and OTP codes are stored as hashes.

## Booking and offers

`bookings.status` is `REQUESTED`, `ACCEPTED`, `CANCELLED`, `COMPLETED`, or `EXPIRED`.

`booking_offers` records each rider who was asked. A rejection is an offer status, not a terminal booking status. One rider has at most one offer per booking.

The booking does not store a copy of the token debit or the fee payment. Those rows point at the booking and are protected by idempotency keys:

- `booking-fee:{bookingId}`
- `token-debit:booking:{bookingId}`
- `token-refund:booking:{bookingId}`
- `token-purchase:{paymentId}`

## Financial constraints

The first migration must add these database rules on top of the Prisma schema. Application code is not enough.

- `rider_wallets.token_balance >= 0`
- `token_ledger_entries.balance_after >= 0`
- `payments.amount_pesewas > 0`
- at most one successful `BOOKING_FEE` payment per booking
- at most one `DEDUCTION` ledger row per booking
- at most one `REFUND` ledger row per booking

Token debit, booking acceptance, and the offer update run in one transaction. A repeated webhook or a retried accept uses the same idempotency key and does not post a second ledger row.

## Location

`rider_locations` keeps the latest point for a rider. `recorded_at` is the GPS time, not the time the row was updated. `sharing_enabled` is false when the rider is offline. Matching ignores rows older than 30 seconds even if the flag is still true.

## Documents

`rider_documents.storage_key` points at private object storage. The database does not store the file bytes and does not store a public URL.

## Backups and access

PostgreSQL is bound to the VPS localhost. The API is the only application client. `backend/scripts/backup-postgres.sh` writes a custom-format dump and deletes dumps older than 14 days. Run it from cron on the server.
