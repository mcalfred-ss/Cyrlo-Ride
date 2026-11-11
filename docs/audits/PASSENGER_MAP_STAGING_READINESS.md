# Cyrlo Ride — Passenger Map Staging Readiness Audit

**Date:** 2026-11-11  
**Scope:** Passenger map planning + live booking integration (read-only)  
**Rule:** No app code changes, migrations, zone activation, deploy, bookings, payments, or SMS in this audit.

---

## 1. Executive verdict

**READY WITH CONDITIONS**

The Flutter pickup → destination → route → live booking path is implemented against the real Ride Maps proxy and the existing `POST /bookings` contract. Relevant mapping/booking tests pass and analyzer is clean on the touched modules.

Controlled staging/device QA is appropriate **for map planning, search, route preview, and fail-closed booking create**. It is **not** appropriate for a successful paid booking E2E until Ops activates a verified service zone, and financial smoke remains high-risk because staging has historically been configured with **live** Paystack credentials (name confirmed in prior audit; not re-printed here).

| Gate | Status |
| --- | --- |
| Passenger map planning UX wired | Verified in code |
| Live booking uses real coords/labels | Verified in code |
| Hardcoded destination offset removed | Verified (`0.007` absent) |
| Simulated fee CTAs unreachable | Verified (no `startRequestRideFlow` call sites) |
| Ride Maps proxy default on | Verified (`USE_RIDE_MAPS_PROXY` default `true`) |
| Staging API health / readiness | Verified live this session |
| Active service zones | **Assumed still zero** (last DB-backed audit); not re-counted this session |
| Successful paid booking on staging | **Blocked** until zone activation + Paystack discipline |

---

## 2. Verified implementation details

### 2.1 Files reviewed

| File | Role |
| --- | --- |
| `apps/cyrlo_app/lib/passenger_app/map/application/passenger_trip_plan.dart` | Trip plan state machine |
| `apps/cyrlo_app/lib/passenger_app/map/presentation/passenger_map_screen.dart` | Map UI + Continue |
| `apps/cyrlo_app/lib/passenger_app/home/presentation/live_booking_flow.dart` | Live create + Paystack webview |
| `apps/cyrlo_app/lib/passenger_app/home/presentation/passenger_home_screen.dart` | Where to? / Plan a ride → map |
| `apps/cyrlo_app/lib/passenger_app/home/presentation/passenger_rider_detail_screen.dart` | Plan a ride → map |
| `apps/cyrlo_app/test/mapping/passenger_trip_plan_test.dart` | Controller tests |
| `apps/cyrlo_app/test/booking/live_booking_create_payload_test.dart` | Payload / offset / zone helper |

### 2.2 Pickup / destination accuracy

**Verified:**

- Coordinates are stored as `GeoPoint` doubles and passed through unchanged to route preview and `BookingsApi.create`.
- `GeoPoint.isValid` gates map placement and booking submit.
- Manual map taps call `placeMapPoint` → `_applyPickup` / `_applyDestination` with the tapped point.
- Search selection uses `hit.point` from the Maps proxy response.
- Changing pickup or destination clears the previous route (`clearRoute: true`) before reloading.

**Label association:**

- Reverse geocode runs for the same `point` argument later written into state together with the label in one `copyWith`.
- Search selection prefers `hit.address` then `hit.label` for that hit’s coordinates.
- Fallback label is formatted coordinates for that same point (not invented geography).

**Risk (non-critical → elevate if rapid pin-dragging is common):** reverse/apply paths are **not** generation-gated. Concurrent `_applyPickup` / `_applyDestination` awaits can finish out of order and overwrite a newer pin with an older one. Search and route loads **are** generation-gated.

### 2.3 Destination search

**Verified:**

- 350 ms debounce; only the last generation applies.
- Loading / empty / error / retry paths exist.
- Stale-response protection covered by unit test.
- Selecting a suggestion sets destination, clears suggestions, loads route.

### 2.4 Route preview

**Verified:**

- With default `AppConfig.useRideMapsProxy == true`, `routePreviewGatewayProvider` uses `RideMapsRoutePreviewGateway` → `POST /maps/routes` on the Ride API client (not Mapbox Directions in-app).
- Failures throw / set `routeUnavailable` and clear route; empty geometry (`points.length < 2`) does not keep a fabricated polyline.
- UI shows distance/duration with explicit “Route preview · not a fare”.
- Continue requires `canSubmitBooking` ⇒ valid pickup + destination + non-null route + not submitting.

### 2.5 Live booking wiring

**Verified:**

- `startLiveBookingFlow` requires `pickup` and `destination` arguments; no `+ 0.007` offset remains.
- Labels trimmed / capped to 200 chars to match schema max.
- Vehicle category emitted as `PRAGYA` via `VehicleCategory.pragya.apiValue`.
- Duplicate submit locked via `beginSubmit` / `isSubmitting`.
- Auth missing → error toast; `UNAUTHORIZED` / 401 handled.
- Service-area rejection (`outside the active service area`, etc.) → `serviceUnavailable` message; no success path.
- On recoverable submit errors, phase returns to `routeAvailable` when a route still exists — **trip selection preserved**.
- Passenger CTAs: home Where to?, empty Plan a ride, nearby request, rider detail Plan a ride → map. Grep shows **no remaining call sites** for `startRequestRideFlow` (file still present but unreachable from those CTAs).

### 2.6 Permissions / GPS

**Verified:**

- Denied / service-disabled / unavailable messages; no invented coordinates on failure.
- Map tap remains available when GPS fails.

**Caveat:** underlying `DeviceLocationService` maps many fix failures to `denied: true`, so the Flutter gateway may surface a “permission” message for some GPS/timeout failures. Permanent denial is not separately deep-linked to OS settings.

---

## 3. Backend contract compatibility

### 3.1 Schema (`createBookingSchema`)

Required / allowed:

| Field | Backend | Flutter `LiveBookingsApi.create` |
| --- | --- | --- |
| `pickup.latitude` / `longitude` | `z.number` in range | `GeoPoint` doubles |
| `destination.latitude` / `longitude` | same | same |
| `vehicleCategory` | `'OKADA' \| 'PRAGYA' \| 'ABOBOYAA'` | `category.apiValue` (`PRAGYA` from sheet) |
| `pickupLabel` | optional string 1–200 | optional, trimmed, max 200 |
| `destinationLabel` | optional string 1–200 | optional, trimmed, max 200 |
| Extra fields | `.strict()` rejects | none sent |

**Verified match** for structure, field names, numeric types, and label bounds.

### 3.2 Service eligibility

Backend `BookingsService.create` resolves `findActiveZoneCoveringPickup`; missing zone → **409 CONFLICT** — `"Pickup is outside the active service area"`.

Flutter `isServiceAreaRejection` matches that wording (and broader “service area” substrings). UI shows a clear unavailable message and does not navigate as success.

### 3.3 Response / payment handling

After create, Flutter uses `booking.payment` or `initializeBookingFee`, then opens Paystack authorization URL in-app. Post-return poll via `get` + `adoptBooking` / rides upsert. This matches the existing live-booking design; this audit did **not** execute create/initialize against staging.

---

## 4. Test results

### 4.1 Relevant suite (this session)

| Command | Result |
| --- | --- |
| `flutter test test/mapping test/booking/live_booking_create_payload_test.dart` | **28/28 passed** |
| `flutter analyze` on map + live booking + home + rider detail | **No issues found** |

### 4.2 Full Flutter suite (this session)

| Result | Count / note |
| --- | --- |
| Passed | **32** |
| Failed | **3** (pre-existing / unrelated to this map work) |

Failing (unchanged scope; not modified):

1. `test/ride_session/rider_accept_job_test.dart` — binding / SharedPreferences / disposed Ref  
2. `test/widget_test.dart` — `passenger reaches home with the four tabs` (OTP success key)  
3. `test/widget_test.dart` — `rider reaches approval after submitting documents` (OTP success key)

### 4.3 New test quality

**Genuine coverage of the trip-plan controller** with faked location, place lookup, and route gateways:

- Current location + reverse label  
- Permission denial without inventing coords  
- Independent pickup/destination pins  
- Debounce + stale search suppression  
- Suggestion → route load  
- Manual pin reverse label  
- Route failure + retry  
- Invalid submit / duplicate submit / submit unlock  
- Service-area helper wording  

**Weaker / isolated pieces:**

- Booking payload test uses a recording `BookingsApi` fake + source assertion that `0.007` is gone — validates contract shape and offset removal, **not** widget/`startLiveBookingFlow` UI orchestration, Dio encoding, or Paystack webview.
- No widget tests for `PassengerMapScreen` markers/polylines/Continue enablement.
- No mocked-Dio tests for `RideMapsPlaceLookupGateway` / `RideMapsRoutePreviewGateway` HTTP mapping.
- No test for reverse-geocode race under concurrent taps.
- No test that `startRequestRideFlow` remains unreferenced from passenger CTAs (manual grep only).

---

## 5. Critical and non-critical findings

### Critical / staging blockers

1. **Zero (or unverified-nonzero) active service zones** — last maps E2E audit documented zero ACTIVE zones; this session did **not** re-query Postgres. With zero ACTIVE covering polygons, every real create fails closed with service-unavailable. That is correct product behavior, but blocks “happy path” paid booking QA.
2. **Live Paystack credentials on staging (prior verification)** — implementation audit 2026-11 recorded live Paystack keys present by name only. This session did not open provider env files and prints no secrets. Any Continuue→Paystack path on a covering zone can hit real money rails. Treat as a deployment/QA **condition**, not a Flutter defect.

### Non-critical

3. Reverse/apply race without generation tokens (stale pin overwrite).  
4. GPS/timeout failures may present as permission denial.  
5. If the widget unmounts after `create` succeeds but before the loading dialog is popped, the dialog can leak while a booking already exists.  
6. `request_ride_flow.dart` (simulated fee) still in tree though unreachable from current passenger CTAs.  
7. Map fit uses center/zoom heuristics (`CyrloMapController` has no `fitBounds`).  
8. Unrelated Flutter test failures remain (3).

### Integration risks checked

| Risk | Assessment |
| --- | --- |
| Riverpod dispose | Debounce cancelled on provider dispose; provider is app-scoped (state survives leaving Map tab) |
| Async after dispose | Search/route generation guards ignore stale updates; screen uses `mounted` in camera callbacks; booking flow checks `context.mounted` after awaits |
| Submit before route ready | Blocked by `canSubmitBooking` + disabled Continue |
| Booking error preserves trip | Yes — pickup/destination/route retained; submit unlocks |
| Marker/polyline updates | Driven from `passengerTripPlanProvider` / route points; destination marker + route polyline present when state has them |
| Network timeouts | Dio connect 10s / receive 20s; failures surface as search/route/booking errors |

---

## 6. Staging deployment blockers

| Blocker | Severity | Notes |
| --- | --- | --- |
| No ACTIVE service zone covering QA pickups | **Blocks successful booking** | Fail-closed message is ready; activation is Ops-only |
| Live Paystack on staging | **Blocks careless payment QA** | Prefer explicit approval / test keys before Continuue smoke |
| Flutter app binary not redeployed in this audit | Process | Device QA needs a build that includes this integration |
| Unrelated test failures | Low for map QA | Do not gate map readiness; still fix separately |

**Not blockers for map-planning QA:**

- Staging `/api/v1/health` → ok (verified 2026-11-11 this session)  
- Staging `/api/v1/health/ready` → ready; `database: up`; Maps adapter `cyrlo-maps-http` configured (verified this session)  
- Flutter defaults: `API_BASE_URL=https://cyrloride.eqostack.com/api/v1`, `USE_RIDE_MAPS_PROXY=true`  
- Privileged geocode/search/routes go through Ride proxy; Maps API key is not shipped in the app (`cyrloMapsApiToken` default empty)

**Assumption (not re-verified this session):** Ride Maps proxy behavioral smoke from prior E2E (geocode/places/routes 200s with review JWT) still holds; health only confirms Maps HTTP is configured, not re-runs proxy payloads.

---

## 7. Recommended next steps (priority order)

1. **Device QA of planning only** — install build pointing at staging; exercise permission denial, map pin, search debounce, route draw, and Continue → expect service-unavailable toast while zones remain inactive. Do **not** complete Paystack.  
2. **Ops: confirm ACTIVE zone count** on staging DB (`ServiceZone` where `status=ACTIVE` and `isActive=true`) without activating unless approved.  
3. **If booking happy-path is required:** activate one verified community zone under existing admin process; re-test create inside/outside polygon.  
4. **Before any payment smoke:** confirm Paystack key mode (test vs live) without exposing secrets; only proceed with explicit financial approval if still live.  
5. **Hardening (post-QA):** generation-guard reverse/apply; optional Dio unit tests for Ride Maps gateways; widget test for Continue enablement; remove or quarantine dead `request_ride_flow` entry points.  
6. **Separately fix** the three unrelated Flutter test failures (OTP widget + rider accept binding).

---

## 8. Fact vs assumption legend

| Claim | Class |
| --- | --- |
| Trip plan / live booking source behavior | **Fact** (code inspection) |
| Offset removed; simulated CTA unreachable | **Fact** (grep + tests) |
| Booking JSON matches Zod schema | **Fact** (side-by-side) |
| Mapping tests 28/28; analyze clean | **Fact** (this session) |
| Full suite 32 pass / 3 fail | **Fact** (this session) |
| Staging health/ready up; Maps configured | **Fact** (HTTP this session) |
| Proxy geocode/route smoke still green | **Assumption** (prior E2E; not re-smoked) |
| Active service zone count = 0 | **Assumption** (prior maps E2E; not re-counted) |
| Staging Paystack still live keys | **Prior fact** (implementation audit); **not re-opened** this session |

---

*End of audit.*
