# Cyrlo Ride — Milestone 8: Trip execution, cancellation and disputes

## What was implemented

- Assigned rider trip start (`ACCEPTED` → `IN_PROGRESS`) and completion (`IN_PROGRESS` → `COMPLETED`).
- Rider cancel after acceptance and rider unable-to-complete (both → `CANCELLED`) with approved fee refund + token reversal.
- Passenger post-acceptance cancellation as a **support-review request** (booking unchanged; no automatic fee/token movement).
- Disputes within 24 hours after `COMPLETED` / `CANCELLED` for passenger or assigned rider.
- Support investigation, recommendations, cancellation-request review; Finance continues to execute refunds via existing MFA-gated workflow.
- Append-only `trip_location_points` while a rider is on an active trip.
- Availability release after `COMPLETED` / eligible `CANCELLED`; active-trip still blocks offline.

## Files created and modified

### Created

| Path | Role |
| --- | --- |
| `backend/prisma/migrations/20261107100000_trip_execution_disputes/` | Schema migration |
| `backend/src/modules/disputes/*` | Dispute + cancel-review module |
| `backend/src/modules/bookings/trip.db.test.ts` | Postgres trip/cancel tests |
| `backend/src/modules/disputes/module.db.test.ts` | Postgres dispute tests |
| `docs/architecture/TRIP_EXECUTION_DISPUTES_MILESTONE_8.md` | This report |

### Modified

Booking rules (`decideRefunds` rider fee+token), bookings service/routes/controller/schema/repository, wallet reverse debit, locations trip GPS append, payments refund notifications, composition/app, constants, realtime `booking.started` event name, Prisma schema.

## Database / migration

Migration: `20261107100000_trip_execution_disputes` on **`cyrlo_ride_app`**.

- `bookings.started_at`, `bookings.cancellation_actor_type`
- `trip_location_points` (append-only; `ON DELETE RESTRICT`)
- `booking_cancellation_requests` + partial unique one OPEN/UNDER_REVIEW per booking
- `disputes`, `dispute_events`
- Unique partial index: one ledger `REFUND` per booking

## Lifecycle transitions

| From | To | Actor / path |
| --- | --- | --- |
| ACCEPTED | IN_PROGRESS | Assigned rider `POST .../start` |
| IN_PROGRESS | COMPLETED | Assigned rider `POST .../complete` |
| ACCEPTED | CANCELLED | Assigned rider `POST .../rider-cancel` |
| IN_PROGRESS | CANCELLED | Assigned rider `POST .../unable-to-complete` |
| ACCEPTED/IN_PROGRESS | (unchanged) | Passenger `POST .../cancel-after-accept` → support case |
| COMPLETED/CANCELLED | (unchanged) | Dispute submit within 24h |

No `ARRIVED`. No arbitrary status PATCH. Reasons live on fields/records, not invented statuses.

## Refund / token reversal

`decideRefunds` aligned with approved matrix:

- Rider cancel / unable-to-complete → fee `REQUEST_REFUND` (if captured) + token `REQUEST_REFUND` (if debited).
- Passenger cancel after accept → `NONE` / `NONE`.
- Token reversal: new `REFUND` ledger row with `reverses_entry_id`; original debit immutable; key `token-refund:booking:{id}`.
- Fee refund: existing `payment_refunds` + finance `executeRefund` (recent MFA). Queued ≠ succeeded.

## APIs

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/bookings/:id/start` | Assigned rider |
| POST | `/api/v1/bookings/:id/complete` | Assigned rider |
| POST | `/api/v1/bookings/:id/rider-cancel` | Assigned rider |
| POST | `/api/v1/bookings/:id/unable-to-complete` | Assigned rider |
| POST | `/api/v1/bookings/:id/cancel-after-accept` | Passenger owner |
| POST | `/api/v1/bookings/:id/disputes` | Passenger or assigned rider |
| GET | `/api/v1/admin/disputes` | InvestigateDisputes |
| GET | `/api/v1/admin/disputes/:id` | InvestigateDisputes |
| POST | `/api/v1/admin/disputes/:id/recommend` | RecommendRefunds + recent MFA |
| GET | `/api/v1/admin/bookings/:id/trip-gps` | ViewTripGpsEvidence + recent MFA |
| GET/POST | `/api/v1/admin/cancellation-requests...` | Support review permissions |
| POST | `/api/v1/admin/payments/refunds/:id/execute` | Existing ExecuteRefunds + MFA |

## Unresolved decisions (documented, not guessed)

- Criteria for granting a post-acceptance passenger refund after support review.
- Whether a dispute after `COMPLETED` can override the “no refund” completion row (support may still queue a fee refund recommendation as an exception path; thresholds not invented).
- Monetary approval thresholds for Super Admin — none configured; existing permission model preserved.
- Trip GPS retention cleanup automation (constant `TRIP_GPS_RETENTION_DAYS=30` exists; no destructive job).

## Test / typecheck / migration status

| Check | Result |
| --- | --- |
| `npx prisma migrate deploy` | Applied `20261107100000_trip_execution_disputes` to **`cyrlo_ride_app`** |
| `npm run typecheck` | Passed |
| `npm test` | **22 files / 110 tests passed** |

Postgres coverage includes start/complete idempotency, wrong-rider rejection, rider cancel fee+token reversal (single refund/reversal), passenger post-accept support case without money movement, unable-to-complete blocked after COMPLETED, and 24h dispute window + support recommend-without-execute.

## Known limitations

- Passenger acknowledgement of completion not implemented (compatible later; completion does not depend on it).
- Fare collection / rider settlement not in scope.
- Support recommendation can queue a fee refund; it never calls Paystack.
- Identity / Ghana Card data excluded from dispute evidence payloads.
