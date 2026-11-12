# Cyrlo Ride — Live Rider Discovery Implementation Report

**Date:** 2026-11-12  
**Branch:** `feature/live-rider-discovery`  
**Mode:** Implementation + unit tests; no VPS deploy; no zone activation; no live Paystack; no real SMS/push during tests

---

## 1. Executive summary

Passenger map nearby supply is now backed by a **read-only discovery endpoint** that reuses the existing matching eligibility engine (5 km / 30 s freshness / AVAILABLE / zone / vehicle / tokens). Rider GPS reporting was hardened (overlap lock, soft-fail ticks, stop when offline). Socket.IO now emits offer/accept events; Flutter connects and listens, with **polling retained as the durable fallback**. GH₵1 fee-on-accept is unchanged; Postgres concurrency and Paystack test-mode gates remain **unverified for live accept→payment**.

---

## 2. Architecture inspected (Phase 1)

| Area | Existing | Gap filled |
| --- | --- | --- |
| Rider GPS upload | `POST /locations/rider`, Flutter 20s loop in `rider_availability_provider` | Hardened interval 15s, overlap prevention, soft-fail, stop-sharing offline |
| Matching engine | `loadMatchingCandidates` + `evaluateMatchingEligibility` + dispatch | Reused by `discoverNearby` — no second matcher |
| Passenger nearby UI | Empty stub provider | Wired to `POST /matching/nearby` |
| Booking create / accept / fee | Destination-free SEARCHING + accept→PENDING fee | Unchanged; recovery + status poll added |
| Socket.IO | Server + publisher; Flutter client connect-only | Offer/accept publish + client listeners |
| Offer delivery | In-app notification + 8s rider poll | Socket refresh + poll fallback |

---

## 3. Files changed (high level)

### Backend
- `modules/matching/approximate-location.ts` (+ tests)
- `modules/matching/discover-nearby.unit.test.ts`
- `modules/matching/module.schema.ts` — `nearbyDiscoveryBodySchema`
- `modules/matching/module.service.ts` — `discoverNearby`; publish offer/accept
- `modules/matching/module.repository.ts` — `findActiveZoneCoveringPickup`
- `modules/matching/module.routes.ts` / `module.controller.ts` — `POST /matching/nearby`
- `infrastructure/realtime/events.ts` / `publisher.ts` — `matching.offer.created`, booking accepted fan-out

### Flutter
- `rider_app/availability/.../rider_availability_provider.dart` — GPS loop hardening
- `passenger_app/home/data/nearby_riders_api.dart` — discovery client
- `passenger_app/home/application/nearby_riders_provider.dart` — live poll on pickup
- `passenger_app/map/application/passenger_booking_recovery.dart` — restore + SEARCHING poll
- `passenger_app/map/application/nearby_riders_map_motion.dart` — sync approx home
- `passenger_app/map/presentation/passenger_map_screen.dart` — nearby status line
- `passenger_app/home/presentation/passenger_home_screen.dart` / `live_booking_flow.dart`
- `core/services/realtime_client.dart` + `shared/providers/realtime_session.dart`
- `core/constants/realtime_events.dart` / `api_paths.dart`
- `app.dart` — watch realtime + recovery
- Tests: `test/booking/nearby_discovery_parse_test.dart`

---

## 4. Rider GPS reporting

- Publishes only while local online state is true after successful `AVAILABLE`.
- Interval **15s** (under 30s freshness).
- Overlapping publishes coalesced via `_publishInFlight`.
- Invalid / denied / services-off: hard fail on go-online; soft skip on ticks.
- Offline: cancel timer → set OFFLINE → `POST /locations/rider/stop`.
- Backend remains authoritative for availability and freshness.
- **No fake coordinates.**

**Background location:** still foreground/interval while app process runs; OS background restrictions not fully productized (known limitation).

---

## 5. Nearby rider matching

`POST /api/v1/matching/nearby` (passenger JWT):

1. Validate pickup + vehicle category.
2. Resolve ACTIVE zone covering pickup (same PIP rules as booking create).
3. If none → `{ inServiceArea: false, riders: [] }`.
4. Else `loadMatchingCandidates` + `evaluateMatchingEligibility` (AVAILABLE, fresh ≤30s, ≤5 km, tokens, vehicle, zone).
5. Return privacy-safe rows: first-name display, vehicle, ETA band, **approximate** lat/lng (~300 m grid), no phone, no exact GPS.

---

## 6. Passenger map integration

- Pickup change triggers discovery refresh + 12s poll.
- Markers use approximate points only.
- Loading / empty / outside-zone / error messages on map panel and home.
- Find a Rider remains pickup-only create (no destination).

---

## 7. Real-time request delivery

| Path | Behavior |
| --- | --- |
| Primary durable | Rider Jobs poll every 8s (`listOffers`) |
| Socket enhancement | On offer create → `matching.offer.created` to rider user room → refresh offers |
| Passenger | On accept → `booking.accepted` + matching status poll every 5s while SEARCHING |
| Fallback | Polling continues if Socket.IO is down |

---

## 8. Acceptance and assignment

- Unchanged atomic accept path + connection-fee init.
- Passenger recovery: list bookings → adopt live SEARCHING/ACCEPTED/IN_PROGRESS after refresh.
- Rider retrieves offers via existing matching API.

---

## 9. GH₵1 connection fee

- Unchanged amount/currency/timing (on accept).
- P0 accept+fee row / lock ordering / idempotency preserved.
- **Automated tests still use MemoryPaystack / unit helpers.**
- **Postgres race suites for accept+fee: NOT proven in this work.**
- **Staging Paystack test-mode: NOT confirmed in this work — do not smoke live accept→payment.**

---

## 10. Privacy safeguards

- Pre-accept map: approximate grid only; no phone; first-name / category label only.
- Exact GPS still rider-self + staff + assigned booking room (existing location publisher).
- Discovery never invents riders.

---

## 11. Tests executed

| Suite | Result |
| --- | --- |
| `matching/approximate-location.test.ts` | PASS |
| `matching/discover-nearby.unit.test.ts` | PASS |
| `matching/module.test.ts` | PASS |
| `bookings/connection-fee-lifecycle.test.ts` | PASS (with matching batch) |
| Flutter `nearby_discovery_parse_test` | PASS |
| Flutter `live_booking_create_payload_test` | PASS |
| Flutter `passenger_trip_plan_test` | PASS |

**Not run / not claimed:** Postgres concurrent accept+fee; physical GPS; live Socket.IO E2E; live Paystack; staging booking happy-path payment.

---

## 12. Known limitations

1. Rider background GPS under Android/iOS kill state incomplete.
2. Nearby discovery requires tokens ≥1 (same as dispatch) — riders without tokens do not appear.
3. No passenger-facing ratings in discovery (schema has no trip-rating aggregate wired here).
4. Socket.IO is best-effort; poll is required.
5. Map marker motion still eases around approximate cells (cosmetic; not exact GPS).
6. Unrelated local WIP (Ghana location / food geo) was stashed during this branch — restore after merge.

---

## 13. PostgreSQL concurrency test status

**NOT VERIFIED** in this milestone. Prior P0 verification remains: unit/MemoryPaystack only. Hold live accept→payment until DB `FOR UPDATE` interleaving tests pass.

---

## 14. Paystack test-mode status

**NOT CONFIRMED** this session. Do not initiate real charges or refunds in staging QA until ops confirms test keys (or Memory).

---

## 15. Git

| Item | Value |
| --- | --- |
| Branch | `feature/live-rider-discovery` |
| Commit | fcbf6fd |
| Remote | `origin` → GitHub `mcalfred-ss/Cyrlo-Ride` |
| Merged to main | **No** |
| Deployed | **No** |

---

## 16. Staging QA instructions (controlled)

**Prerequisites:** ACTIVE Atwima Kwanwoma zone (ops already stated); API with Maps + `OTP_STATIC_LOGINS`; migration applied if not already.

1. Rider `+233555010002` / OTP `246810` → Go online outdoors with GPS → confirm location updates.
2. Passenger `+233555010001` / OTP `246810` → map pickup **inside** active zone → nearby markers appear (approx) or empty state if no eligible riders.
3. Find a Rider → SEARCHING; rider Jobs shows offer (poll ≤8s or socket).
4. Rider accepts → passenger sees assigned state after poll/socket.
5. **Stop before Paystack checkout** until test keys + Postgres race gates are confirmed.
6. Pickup outside zone → discovery `inServiceArea:false` / create 409.

**Do not:** invent GPS, activate extra zones in this flow, send SMS to non-allowlisted numbers, or charge live Paystack.

---

## 17. Implemented vs unverified

| Feature | Status |
| --- | --- |
| Rider GPS reporting loop | **Implemented** (unit/device GPS not run here) |
| Nearby discovery API | **Implemented** (unit) |
| Passenger map wiring | **Implemented** (unit parse + code) |
| Socket offer/accept events | **Implemented** (code; live E2E unverified) |
| Polling fallback | **Implemented** (existing + extended) |
| Booking recovery after refresh | **Implemented** (code) |
| Atomic accept + GH₵1 fee | **Preserved** (prior unit) |
| Postgres accept races | **Unverified** |
| Live Paystack journey | **Unverified — blocked** |
| Physical-device GPS / map tiles | **Unverified** |

---

*End of report.*
