# Cyrlo Ride — Milestone 7: Rider matching and offer dispatch

## What was implemented

- Matching dispatch only for `SEARCHING` bookings with verified booking-fee SUCCESS.
- 5 km Haversine straight-line radius (exact boundary included).
- Matching eligibility on top of `evaluateOperationalEligibility` (tokens, radius, vehicle category, pickup zone, prior reject/timeout, active trip).
- Batches of at most 3 offers; next batch immediately when a batch has no pending offers.
- Offer lifecycle: `PENDING` → `ACCEPTED` / `REJECTED` / `TIMED_OUT` / `INVALIDATED`.
- Atomic accept with booking row lock, wallet `FOR UPDATE`, single token debit ledger entry, competing offers invalidated.
- Search expiry (5 minutes) → booking `EXPIRED`, pending offers invalidated, fee refund `REQUESTED`.
- Rider offer list/accept/reject; passenger matching status summary.
- Workers for dispatch + offer/search expiry (with unpaid worker from M6).
- Injectable candidate ordering; fail-closed offer timeout config.

## Unresolved decisions (not guessed)

### Offer response timeout

- Env: `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` (required for dispatch; **no default**).
- GPS freshness (30s) is **not** reused.
- Missing/invalid value → dispatch fails closed with `503 SERVICE_UNAVAILABLE`.
- Operators must set an explicit approved value before enabling matching in an environment.
- Tests set `15` only in `tests/setup.ts`.

### Candidate ordering

- Interface: `CandidateOrderingStrategy`.
- Production default: `StableByRiderIdOrderingStrategy` — **deterministic only**, not an approved business ranking (not nearest-first / oldest-online / random).
- Tests inject `IdentityOrderingStrategy` for fixed order.
- Product still must choose the ranking policy; changing strategy does not rewrite eligibility/dispatch.

## Files created and modified

### Created

| Path | Role |
| --- | --- |
| `backend/prisma/migrations/20261107090000_matching_offers/` | Offer fields, enum values, unique constraints |
| `backend/src/modules/matching/geo-distance.ts` | Haversine + radius check |
| `backend/src/modules/matching/candidate-ordering.ts` | Ordering strategy interface |
| `backend/src/modules/matching/offer-timeout.ts` | Fail-closed timeout config |
| `backend/src/modules/matching/matching-eligibility.ts` | Matching gate |
| `backend/src/jobs/matching-workers.ts` | Dispatch/expiry interval |
| `backend/src/modules/matching/module.db.test.ts` | Postgres concurrency |
| `docs/architecture/MATCHING_AND_OFFERS_MILESTONE_7.md` | This report |

### Modified

Matching/wallet modules, payments (post-SEARCHING dispatch hook), composition/app, booking-rules offer transitions, operational ineligibility codes, env/constants, test setup.

## Database / migration

Migration: `20261107090000_matching_offers` on **`cyrlo_ride_app`**.

- Offer: `batch_sequence`, `expires_at`; statuses `TIMED_OUT`, `INVALIDATED`.
- Unique: one `ACCEPTED` offer per booking; one `ACCEPTED`/`IN_PROGRESS` booking per rider.
- Ledger: `reverses_entry_id` for future token refunds.
- Indexes for pending offers and search deadlines.

## Eligibility rules

All required:

- Operational eligibility (active, approved, online, fresh GPS, sharing).
- Approved vehicle matching booking category.
- Approved for booking pickup zone (active).
- ≤ 5 km straight-line from pickup.
- Token balance ≥ 1.
- No other `ACCEPTED`/`IN_PROGRESS` trip.
- Not previously `REJECTED`/`TIMED_OUT`/`EXPIRED` on this booking.
- Re-checked inside accept transaction.

## Distance

`haversineDistanceMeters` / `isWithinMatchingRadius` with `MATCHING_RADIUS_METERS = 5000`.  
Exactly 5 km included; greater excluded. No road routing; destination unused.

## Batch dispatch

1. Confirm `SEARCHING`, fee SUCCESS, search deadline open.
2. Require configured offer timeout.
3. Exclude prior reject/timeout riders.
4. Filter eligible candidates; order via strategy; take ≤ 3.
5. Persist offers with batch sequence + response deadline.
6. Notify riders asynchronously.
7. When batch has zero `PENDING` (all reject/timeout), dispatch next batch immediately.
8. Stop at search deadline.

## Offer lifecycle

| Status | Meaning |
| --- | --- |
| PENDING | Awaiting rider response before `expiresAt` |
| ACCEPTED | Winning assignment |
| REJECTED | Rider declined |
| TIMED_OUT | Response deadline passed |
| INVALIDATED | Another winner, search expired, or booking left SEARCHING |

## Atomic acceptance

Transaction: lock booking + offer → recheck deadlines/status → `UPDATE bookings SET ACCEPTED WHERE SEARCHING` → accept offer → invalidate other pending → debit 1 token (wallet lock + ledger) → history → rider `BUSY`.

Partial unique indexes prevent double win / double debit.

## Search expiry

At `searchExpiresAt`: booking `EXPIRED`, pending offers `INVALIDATED`, fee refund requested (no token debit). Racing accept uses conditional updates so only one outcome wins.

## API

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/matching/offers` | Rider |
| POST | `/api/v1/matching/offers/:offerId/accept` | Rider |
| POST | `/api/v1/matching/offers/:offerId/reject` | Rider |
| GET | `/api/v1/matching/bookings/:bookingId/status` | Passenger owner |

Passenger status exposes offer counts only — no competing rider identities or coordinates.

## Audit / notifications

Audit: batch created, offer created/accepted/rejected/timed_out, booking assigned, token debited, search expired.  
Notifications: new offer, offer timed out, passenger assigned, search expired. Async; not transactional.

## Test / typecheck / migration status

| Check | Result |
| --- | --- |
| `npx prisma migrate deploy` | Applied `20261107090000_matching_offers` to **`cyrlo_ride_app`** only |
| `npm run typecheck` | Passed |
| `npm test` | **20 files / 105 tests passed** |

Postgres integration coverage includes concurrent dual accept (one winner, one token debit, competitors invalidated), reject → no re-offer to excluded rider, search expiry without token debit + fee refund queued, and fail-closed missing offer timeout.

## Known limitations

- Ranking policy unresolved (stable riderId only — not an approved product preference).
- Offer timeout must be set per environment (`RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS`); no default.
- Matching dispatch fails closed when timeout is unset/invalid.
- Token package purchase still unimplemented (tests seed wallets).
- Trip start/complete HTTP still later milestones.
- Fare calculation / post-accept passenger refunds not in scope.
