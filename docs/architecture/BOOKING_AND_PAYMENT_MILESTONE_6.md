# Cyrlo Ride — Milestone 6: Passenger booking and booking-fee payments

## What was implemented

- Passenger booking create / list / get / cancel (pre-acceptance).
- Approved booking statuses (retired `REQUESTED`).
- Pickup point-in-polygon against **active** service zones (bbox then ring; Polygon and MultiPolygon).
- Fixed GH₵1.00 (100 pesewas) booking-fee payment init via Paystack client abstraction.
- Signed Paystack webhook with `payment_webhook_events` idempotency.
- On-time fee SUCCESS → `SEARCHING` + `searchExpiresAt` (5 minutes, matching later).
- 10-minute unpaid timeout → `PAYMENT_FAILED` (in-process worker + lazy check).
- Late SUCCESS → payment recorded, booking not revived, `payment_refunds` `REQUESTED`.
- Pre-accept cancel with fee SUCCESS → refund `REQUESTED`.
- Finance list/execute refund endpoints (ExecuteRefunds + recent MFA).
- Active-trip offline protection includes `ACCEPTED` and `IN_PROGRESS`.
- In-app notifications (async, non-transactional).

Not implemented: matching/offers, token packs/debit, fare collection, post-accept cancel refunds, trip start/complete HTTP, Flutter.

## Conflicts / deferred (not silently changed)

- Legacy `shouldRefundBookingFee` / `shouldRefundToken` kept as deprecated wrappers; new code uses `decideRefunds` (approved matrix). Rider-cancel token refund is encoded in `decideRefunds` for later matching.
- API_CONTRACT still mentions `REQUESTED` in places; HTTP now returns approved statuses.
- Token purchase endpoint remains unimplemented.
- Search expiry / matching not run in this milestone (`SEARCHING` is the handoff).

## Files created and modified

### Created

| Path | Role |
| --- | --- |
| `backend/prisma/migrations/20261107080000_booking_payment_lifecycle/` | Statuses, clocks, history, webhooks, refunds |
| `backend/src/infrastructure/payments/paystack-client.ts` | Initialize + refund client (HTTP + memory) |
| `backend/src/infrastructure/notifications/notify.ts` | Async in-app notify helper |
| `backend/src/jobs/expire-unpaid-bookings.ts` | 30s unpaid expiry worker |
| `backend/src/modules/bookings/module.db.test.ts` | Postgres booking/payment flows |
| `docs/architecture/BOOKING_AND_PAYMENT_MILESTONE_6.md` | This report |

### Modified (primary)

`booking-rules.ts`, bookings/payments modules, `composition`/`app`, `operational-eligibility` / riders repo active-trip statuses, `idempotency` keys, `constants`, `domain.test.ts`, `tests/setup.ts`.

## Prisma / migration

Migration: `20261107080000_booking_payment_lifecycle` on **`cyrlo_ride_app`**.

- `BookingStatus`: `AWAITING_PAYMENT`, `PAYMENT_FAILED`, `SEARCHING`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `EXPIRED`, `CANCELLED` (legacy `REQUESTED` mapped to `AWAITING_PAYMENT`).
- Booking: `vehicle_category`, `payment_expires_at`, `search_expires_at`.
- `booking_status_history` (append-only, Restrict on booking delete).
- `payment_webhook_events` unique `provider_event_id`.
- `payment_refunds` + positive amount check.
- Partial unique: one `PENDING` booking fee per booking (SUCCESS unique already existed).

## API endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/bookings` | Passenger/Rider | Create `AWAITING_PAYMENT` + fee init |
| GET | `/api/v1/bookings` | Passenger/Rider | Own bookings |
| GET | `/api/v1/bookings/:bookingId` | Owner | Own booking |
| POST | `/api/v1/bookings/:bookingId/cancel` | Owner | Cancel if `AWAITING_PAYMENT`/`SEARCHING` |
| POST | `/api/v1/payments/booking-fee` | Passenger/Rider | Re-init Paystack for pending fee |
| POST | `/api/v1/payments/paystack/webhook` | Signature | Reconcile charge |
| GET | `/api/v1/admin/payments/refunds` | Finance ViewPayments | List refunds |
| POST | `/api/v1/admin/payments/refunds/:id/execute` | ExecuteRefunds + recent MFA | Call provider refund |

No client status patch. Amount never accepted from client.

## Lifecycle transitions (this milestone)

| From | To | Trigger |
| --- | --- | --- |
| — | `AWAITING_PAYMENT` | Create |
| `AWAITING_PAYMENT` | `SEARCHING` | Verified on-time fee SUCCESS |
| `AWAITING_PAYMENT` | `PAYMENT_FAILED` | Timeout or charge.failed |
| `AWAITING_PAYMENT` / `SEARCHING` | `CANCELLED` | Passenger cancel |
| Late SUCCESS | (no status revive) | Refund `REQUESTED` |

## Booking fee

- Always `BOOKING_FEE_PESEWAS = 100`, currency `GHS`.
- Idempotency key `booking-fee:{bookingId}`.
- Provider reference unique; webhook matches amount/currency/reference/booking metadata.

## Webhook idempotency

1. Verify HMAC-SHA512 over raw body.
2. Insert `payment_webhook_events` by provider event id (duplicate → no-op).
3. Apply effect in DB transaction / conditional updates.
4. Mark event processed.

## Timeout

- Deadline = creation + 10 minutes (`paymentExpiresAt`).
- Worker every 30s in API process (`NODE_ENV !== test`).
- Also evaluated on booking read/cancel.
- Concurrent with webhook: only `AWAITING_PAYMENT` → `SEARCHING` or `PAYMENT_FAILED` via conditional transitions.

## Late payment

- Payment → `SUCCESS` (immutable).
- Booking stays failed/cancelled/expired unpaid outcome.
- `payment_refunds` row `REQUESTED` with reason `late_payment_after_deadline`.
- Finance executes via admin endpoint (does not falsely mark SUCCEEDED without provider).

## Pickup zone validation

- Load active zones whose bbox contains pickup.
- Then `isPointInBoundary` (ray cast; holes excluded).
- Boundary on edge of exterior ring counts as inside (standard even-odd crossing).
- No district-wide fallback; no invented coordinates.

## Active-trip offline

`ACTIVE_TRIP_BOOKING_STATUSES = ['ACCEPTED', 'IN_PROGRESS']` in eligibility + locations/riders repositories.

## Audit / notifications

Audit: `booking.created`, `booking.cancelled`, `payment.late_success.refund_queued`, `payment.refund.executed`.  
Notifications: awaiting payment, paid/searching, failed, expired, cancelled, refund requested/completed (async).

## Test / typecheck / migration status

- Migration `20261107080000_booking_payment_lifecycle` applied on **`cyrlo_ride_app`** (7 migrations up to date).
- `npm test`: **97 passed** (19 files).
- `npm run typecheck`: **passed**.

## Known limitations

- No Paystack network calls in `NODE_ENV=test` (Memory client).
- Production requires `PAYSTACK_SECRET_KEY` and a running API process (or external cron calling `expireUnpaidBookings`).
- Matching does not consume `SEARCHING` yet.
- Refund execute depends on Paystack refund API availability; otherwise rows stay `REQUESTED`/`FAILED` for finance follow-up.
