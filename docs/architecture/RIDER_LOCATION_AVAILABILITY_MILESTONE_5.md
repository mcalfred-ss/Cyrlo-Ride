# Cyrlo Ride — Milestone 5: Rider location and availability

## What was implemented

- Rider location update / stop-sharing / own retrieval.
- Server-received timestamp (`received_at`) as the authoritative freshness clock.
- Central GPS freshness helper (30 s max age, 2 s device clock skew).
- Go-online / go-offline via `POST /riders/availability`.
- Centralized operational eligibility with structured reason codes.
- Active-trip protection: cannot go offline while booking status is `ACCEPTED`.
- Privileged staff location read with audit (no coordinates in audit metadata).
- Optional Socket.IO emits to the rider user room (and booking room when assigned); DB remains authoritative.
- Unit + Postgres tests; typecheck.

Not implemented (by design): matching, offers, booking creation, tokens/Paystack, trip GPS history table, destructive retention cleanup, `IN_PROGRESS` booking status.

## Conflict / deferred notes

- `API_CONTRACT.md` mentions refusing `AVAILABLE` without a wallet. Master matching rules require ≥1 token for *offers*. This milestone **does not** gate go-online on wallet/token balance (explicit M5 exclusion). Token checks belong in the financial/matching milestone.
- Product display states include `IN_PROGRESS`; Prisma still only has `ACCEPTED` among active trip statuses. Offline protection uses `ACCEPTED` only until `IN_PROGRESS` lands.
- Suspension makes the rider ineligible for new work via eligibility + auth middleware. Active trips are **not** auto-cancelled.

## Files created and modified

### Created

| Path | Role |
| --- | --- |
| `backend/prisma/migrations/20261107070000_rider_location_received_at/migration.sql` | Add `received_at` |
| `backend/src/modules/riders/operational-eligibility.ts` | Central eligibility evaluator |
| `backend/src/modules/locations/memory-locations-repository.ts` | Test double |
| `backend/src/modules/locations/module.db.test.ts` | Postgres location tests |
| `backend/src/modules/riders/availability.test.ts` | Availability / eligibility tests |
| `backend/src/infrastructure/realtime/publisher.ts` | Optional Socket.IO publish helpers |
| `docs/architecture/RIDER_LOCATION_AVAILABILITY_MILESTONE_5.md` | This report |

### Modified

| Path | Role |
| --- | --- |
| `backend/prisma/schema.prisma` | `RiderLocation.receivedAt` + indexes |
| `backend/src/config/constants.ts` | Clock skew + trip GPS retention constant |
| `backend/src/config/logger.ts` | Redact latitude/longitude |
| `backend/src/modules/locations/*` | Full location service/routes |
| `backend/src/modules/riders/module.service.ts` | Availability + eligibility |
| `backend/src/modules/riders/module.repository.ts` | Snapshot + availability update |
| `backend/src/modules/riders/module.routes.ts` / `controller` / `memory` | Wire availability |
| `backend/src/modules/riders/eligibility.ts` | Comment update (M3 subset retained) |
| `backend/src/common/middleware/authorize.ts` | `requireAnyPermission` |
| `backend/src/composition.ts` / `app.ts` / `server.ts` | Wire audit, admin location route, publisher |

## Database changes and migration status

- Migration: `20261107070000_rider_location_received_at`
- Adds non-null `received_at`; backfills from `updated_at`.
- Index: `(sharing_enabled, received_at)`.
- Target: **`cyrlo_ride_app` only**.
- No `trip_location_points` table in this milestone. `TRIP_GPS_RETENTION_DAYS = 30` documents the approved trip-trail retention for later work. No destructive cleanup job.

## API endpoints

Base prefix: `/api/v1`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/locations/rider` | Rider | Upsert latest GPS (`recordedAt` device; server sets `receivedAt`) |
| POST | `/locations/rider/stop` | Rider | `sharingEnabled=false` |
| GET | `/locations/rider/me` | Rider | Own latest point + freshness |
| GET | `/locations/rider/eligibility` | Rider | Operational eligibility (`requireOnline`) |
| POST | `/riders/availability` | Rider | `{ "availability": "AVAILABLE" \| "OFFLINE" }` |
| GET | `/riders/eligibility` | Rider | Same eligibility shape |
| GET | `/admin/riders/:riderId/location` | Staff MFA + `MonitorOperations` or `ViewTripGpsEvidence` | Privileged latest location (audited) |

### Validation / errors

- Invalid lat/lon or `recordedAt` → `400 VALIDATION_ERROR`
- Future `recordedAt` beyond 2 s skew → `409 CONFLICT`
- Older `recordedAt` than stored → `409 CONFLICT`
- Go-online prerequisites fail → `409 CONFLICT` with `details.reasons[]`
- Suspended go-online → `403 FORBIDDEN`
- Offline while `ACCEPTED` trip → `409 CONFLICT` (`ON_ACTIVE_TRIP`)
- Duplicate availability transition → `200` with `unchanged: true`

### Eligibility response

```json
{
  "riderId": "...",
  "eligible": false,
  "reasons": ["GPS_NOT_FRESH", "NOT_ONLINE"],
  "verificationEligible": true,
  "onActiveTrip": false,
  "gpsFresh": false
}
```

Reason codes: `ACCOUNT_NOT_ACTIVE`, `RIDER_NOT_APPROVED`, `NO_APPROVED_VEHICLE`, `NO_APPROVED_ACTIVE_ZONE`, `NO_LOCATION`, `GPS_NOT_SHARING`, `GPS_NOT_FRESH`, `NOT_ONLINE`, `ON_ACTIVE_TRIP`.

## GPS freshness

- Constant: `RIDER_LOCATION_MAX_AGE_MS = 30_000`
- Skew: `LOCATION_CLOCK_SKEW_MS = 2_000`
- Fresh iff device time ≤ now + skew **and** `now - receivedAt` ∈ `[0, 30000]` ms
- Helper: `evaluateLocationFreshness` / `isOperationallyFreshLocation` (prefer these over legacy `isFreshLocation`)

## Availability transition rules

| Transition | Rules |
| --- | --- |
| → `AVAILABLE` | Active account; rider `APPROVED`; ≥1 approved vehicle; ≥1 approved **active** zone; fresh shared GPS; not already handled as duplicate |
| → `OFFLINE` | Not on active `ACCEPTED` trip; sets `sharingEnabled=false` |
| Suspended | Ineligible for new work; cannot go online; trip not auto-ended |

Stored enum remains `OFFLINE` / `AVAILABLE` / `BUSY`. Riders only set `OFFLINE`/`AVAILABLE`. `BUSY` is reserved for later assignment flows (master prefers derived trip state over `BUSY`).

## Location privacy and retention

- Latest point only in `rider_locations` (one row per rider).
- No rider-to-rider location API.
- Staff read audited as `rider.location.accessed` without coordinates in metadata.
- Logger redacts `latitude` / `longitude`.
- Trip GPS trail + 30-day retention / legal hold: deferred; constant documented.

## Socket.IO

- `setRealtimeServer(io)` from `server.ts`.
- Emits `rider.location.updated` to `user:{riderId}` and, if assigned, `booking:{id}`.
- Emits `rider.availability.updated` to `user:{riderId}`.
- Never broadcasts to all sockets. Persistence does not depend on Socket.IO.

## Audit events

| Action | When |
| --- | --- |
| `rider.availability.online` | Go online |
| `rider.availability.offline` | Go offline |
| `rider.location.accessed` | Staff location read |

GPS pings are not individually audited (volume).

## Test and typecheck results

- Migration `20261107070000_rider_location_received_at` applied on **`cyrlo_ride_app`** (6 migrations up to date).
- `npm test`: **91 passed** (18 files).
- `npm run typecheck`: **passed**.

## Known limitations

- Token/wallet gate deferred.
- No trip location history table yet.
- `IN_PROGRESS` not in schema; active-trip = `ACCEPTED`.
- Suspension does not force-clear stored `AVAILABLE` flag in DB in this milestone; auth + eligibility block new work. A later admin suspend path may also force `OFFLINE`.
- Matching must call `evaluateOperationalEligibility` and must not bypass it.
