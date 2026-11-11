# Cyrlo Ride — Mapping End-to-End Test Report

**Date:** 2026-11-11  
**Scope:** Flutter mapping experience + Ride `/maps/*` proxy against staging  
**Commit under test:** `8261244` (local and staging)  
**Rules followed:** no deploy, no zone activation, no payments, no real SMS (review OTP only), no Maps/Mapbox secrets in Flutter

---

## 1. Mapping architecture

```
Flutter UI
  ├─ CyrloMapView (cyrlo_maps SDK) ← public Mapbox pk. tile token OR CARTO/OSM fallback
  ├─ TripPinController ← map tap / My location (pickup only)
  ├─ DeviceLocationGateway ← Geolocator permissions + GPS
  ├─ PlaceLookupGateway ──┐
  └─ RoutePreviewGateway ─┴─ when USE_RIDE_MAPS_PROXY=true (default)
                              RideMaps*Gateway → ApiClient (JWT)
                                → https://cyrloride.eqostack.com/api/v1/maps/*
                                  → Cyrlo Maps API (Bearer key server-side)
```

**Privileged geocode/search/routes never use the Maps API key in the app.**  
`CYRLO_MAPS_API_TOKEN` defaults empty; `CyrloMapsApiClient` is constructed with `apiKey: ''`.

| Layer | Primary files |
| --- | --- |
| Config | `lib/core/config/app_config.dart`, `api_paths.dart` |
| Providers | `lib/core/mapping/mapping_providers.dart` |
| Ride proxy | `lib/core/mapping/ride_maps_gateway.dart` |
| Location | `lib/core/mapping/device_location_gateway.dart` |
| Place/route abstractions | `place_lookup_gateway.dart`, `route_preview_gateway.dart` |
| Map project | `ride_map_projects.dart` (Kumasi default center 6.6885, -1.6244) |
| Pickup state | `passenger_app/map/application/trip_pin_controller.dart` |
| Passenger map UI | `passenger_app/map/presentation/passenger_map_screen.dart` |
| Rider map UI | `rider_app/map/presentation/rider_map_screen.dart` |
| Reverse geocode UX | `passenger_app/profile/presentation/passenger_details_screen.dart` |
| Live booking (unwired) | `passenger_app/home/presentation/live_booking_flow.dart` |
| Simulated booking | `passenger_app/home/presentation/request_ride_flow.dart` |

---

## 2. Screens and controllers (actual behavior)

| Surface | What it does for mapping |
| --- | --- |
| **Passenger Map** | Renders `CyrloMapView`; tap → `TripPinController.placeAt` (pickup only); FAB “My location” → GPS + camera move; nearby rider markers (list currently empty) |
| **Passenger Home / rider detail** | Calls `startRequestRideFlow` (simulated fee), **not** `startLiveBookingFlow` |
| **Passenger details** | “Use my location” → GPS + **reverse geocode via Ride proxy**; falls back to coordinate label on failure |
| **Live booking flow** | Resolves pickup via GPS/map; **hardcodes destination** ~800 m north; creates booking via API — **no UI caller found** |
| **TripPinController** | Explicitly **pickup-only**; comment: destination stays off-app |
| **Route preview gateway** | Implemented for Ride proxy; **no screen calls it** |
| **Place search / forward geocode** | Implemented in gateway; **no destination/pickup search UI** |

---

## 3. Test matrix

### 3.1 Current location

| Case | Result | Evidence |
| --- | --- | --- |
| Permission denied → message, no invented pin | **PASS** (unit) | `trip_pin_controller_test.dart` |
| Services disabled → message | **PASS** (unit) | same |
| GPS fix → sets pickup | **PASS** (unit) | FakeDeviceLocationGateway |
| Loading (`isResolvingLocation`) | **PASS** (code + UI progress) | map screen LinearProgressIndicator |
| Camera to current location after fix | **PASS** (code inspection) | FAB moves `_mapController` to pickup |
| Permanently denied vs denied | **GAP** | Gateway collapses denied/null fix to `denied` only — no distinct permanent-denied UX |
| Android / iOS device matrix | **NOT RUN** | No Android SDK / incomplete VS toolchain on this workstation; Chrome web not a substitute for GPS permissions |

### 3.2 Pickup selection

| Case | Result | Evidence |
| --- | --- | --- |
| Map tap sets pickup | **PASS** (unit + code) | `placeAt`, map `onTap` |
| Moving pin (second tap) | **PASS** (unit) | updates pickup only |
| Search / suggestions / select suggestion | **MISSING** | No pickup search UI |
| Reverse geocode on map pin | **MISSING** on map | Only on passenger details “use location” |
| Confirm label + coords into booking | **PARTIAL** | Simulated flow seeds pin; live flow would send coords if wired |

### 3.3 Destination selection

| Case | Result | Evidence |
| --- | --- | --- |
| Search / suggestions / map pin / reverse / confirm | **NOT IMPLEMENTED** | `TripPinState` has no destination field |
| Overwrite isolation vs pickup | **N/A** | No destination state machine |
| Live booking destination | **FABRICATED OFFSET** | `pickup.lat + 0.007` in `live_booking_flow.dart` |

### 3.4 Cyrlo Maps via Ride proxy (staging, review account)

Auth: OTP review passenger `+233555010001` / fixed OTP `246810` (no SMS). No booking or payment.

| Endpoint | HTTP | Result |
| --- | --- | --- |
| `POST /maps/geocode` Kumasi | 200 | 3 hits, labels present |
| `POST /maps/geocode/reverse` 6.6885,-1.6244 | 200 | result present |
| `POST /maps/places/search` Kejetia | 200 | 3 hits |
| `POST /maps/routes/estimate` | 200 | ~2148.8 m / ~588.3 s |
| `POST /maps/routes` | 200 | geometry **91** points; distance matches estimate |
| Invalid reverse coords | 400 | `VALIDATION_ERROR` |
| Nonsense place query | 200 | **0** results (empty, not invented) |
| `GET /maps/config` | 200 | `mapboxPublicToken` is `pk.` (not `sk.`) |
| Unauthenticated geocode | 401 | `UNAUTHORIZED` |
| Secret leak in JSON bodies | — | **None observed** |

### 3.5 Map rendering

| Case | Result | Notes |
| --- | --- | --- |
| Map SDK | Single `cyrlo_maps` / `CyrloMapView` | No second SDK introduced |
| Initial camera | Kumasi center zoom 14 | `RideMapProjects.passengerRequest` |
| Missing tile token | CARTO fallback policy | Staging had no `MAPBOX_ACCESS_TOKEN` env name; config can still return `pk.` after login |
| Pickup marker | Code present | When `tripPinProvider.pickup` set |
| Destination marker | **MISSING** | No destination pin |
| Route polyline | **MISSING in UI** | Gateway exists; not bound to map |
| Gestures / marker updates | Code present | Nearby riders empty so marker density not live-tested |

### 3.6 Route estimation

| Case | Result | Notes |
| --- | --- | --- |
| Proxy estimate/routes | **PASS** (API smoke) | Distance/duration/geometry returned |
| Flutter displays estimate | **NOT IMPLEMENTED** | No UI binding |
| Fabricated distance on failure | **PASS** (unit) | `UnavailableRoutePreviewGateway` throws |
| Fare calculation | **OUT OF SCOPE / NOT IMPLEMENTED** | Correctly not invented |

### 3.7 Booking integration

| Case | Result | Notes |
| --- | --- | --- |
| Reachable UX | **Simulated** | `startRequestRideFlow` → `Future.delayed` fee → local `ActiveRideRequest` |
| Live API create | **Code exists, unwired** | `startLiveBookingFlow` has **zero** UI callers |
| Live destination | Hardcoded offset + labels “Current location” / “Nearby destination” | Not user-selected |
| Coordinates shape for API | Correct in `LiveBookingsApi.create` | `{pickup:{lat,lng}, destination:{…}, labels}` |
| Real booking / payment | **NOT RUN** | Policy |

### 3.8 Service-zone integration

| Case | Result | Notes |
| --- | --- | --- |
| Backend checks active zone on create | **IMPLEMENTED** | `findActiveZoneCoveringPickup`; message “outside the active service area” |
| Staging active zones | **0** | Kokobin = `LOCKED`, `is_active=false` |
| Pickup inside active zone | **NOT EXECUTABLE** without activation (forbidden this task) |
| Locked / suspended / outside | Backend gates on `ACTIVE` only | Locked/suspended behave as non-bookable |
| Flutter pre-check before create | **MISSING** | Relies on backend 4xx after create attempt |

---

## 4. Automated Flutter mapping tests (this run)

```
test/mapping/*  → 11 passed
```

| File | Coverage |
| --- | --- |
| `deferred_maps_api_client_test.dart` | Direct client refuses privileged calls without key |
| `geo_point_and_place_lookup_test.dart` | Conversions; unavailable gateways don’t invent data |
| `trip_pin_controller_test.dart` | Tap, update, deny, disable, clear |

**Gateway Dio unit tests for `RideMaps*Gateway`:** not present (recommended backlog).

---

## 5. Existing three Flutter failures — mapping related?

| Failure | Root cause | Mapping-related? | Action this task |
| --- | --- | --- | --- |
| `widget_test` passenger home | Expects `otp-success-check` after FakeAuth verify; widget not found / verify path changed | **No** | Document only |
| `widget_test` rider approval | Same OTP helper | **No** | Document only |
| `rider_accept_job_test` | `SignupController` needs `WidgetsFlutterBinding` / SharedPreferences; container dispose race | **No** | Document only |

**No mapping test failures were present; no mapping code was changed.**

---

## 6. Missing functionality (verified)

1. Destination picker (search, pin, reverse, confirm).  
2. Pickup/destination place-search UI.  
3. Route polyline + distance/duration display.  
4. Wire `startLiveBookingFlow` (or equivalent) instead of simulated fee.  
5. Reverse-geocode label on map pickup confirmation.  
6. Distinct permanent-denied location handling.  
7. Client-side service-area messaging before booking create.  
8. Device E2E on Android/iOS GPS permissions (blocked on this machine).  
9. `routes/estimate` Flutter client path (API works; app uses `/maps/routes` for preview only when called).

---

## 7. API integration verdict

**Ride → Cyrlo Maps proxy works on staging** for geocode, reverse, places, routes, estimate, config, validation, empty results, and auth rejection. Public tile token is `pk.` only. Secrets were not observed in API JSON.

**Flutter privileged gateways are correctly pointed at the proxy**, but **most gateways are unused by booking UX**. The passenger map today is primarily a **pickup pin + empty nearby layer**, not a full pickup→destination→route product flow.

---

## 8. Service-zone verdict

Backend eligibility is correct in principle (active polygon only). Staging cannot accept live bookings for mapping E2E of “inside zone” until Ops verifies community + activates a zone — **out of scope / not done**. With zero active zones, any real `POST /bookings` from the live flow would fail closed.

---

## 9. Screenshots / evidence

| Evidence | Location / note |
| --- | --- |
| Mapping unit output | 11/11 passed locally |
| Proxy smoke | Staging script results in §3.4 (HTTP codes + counts) |
| Device screenshots | **Unavailable** — no Android emulator / incomplete Windows desktop toolchain |

---

## 10. Prioritized mapping backlog

### P0 — Product-complete mapping UX
1. Destination selection UI (search + map + reverse) without overwriting pickup.  
2. Bind `routePreviewGateway` to draw polyline + show distance/duration (no fare invention).  
3. Replace simulated request path with live booking using real pickup/destination labels.  
4. Surface backend “outside service area” clearly when create fails.

### P1 — Location & polish
5. Permanent-denied settings deep-link messaging.  
6. Reverse-geocode label chip on confirmed pickup.  
7. Android/iOS device permission matrix QA.  
8. Unit tests for `RideMapsPlaceLookupGateway` / `RideMapsRoutePreviewGateway` with mocked Dio.

### P2 — Ops / geo readiness (not Flutter-only)
9. After approved activation of a verified zone, re-run booking create with pickup inside/outside polygon.  
10. Ensure staging public Mapbox `pk.` is reliably available via `/maps/config` for tiles.

### Explicit non-goals (this report)
- Do not add a second map SDK.  
- Do not embed Maps API key or Mapbox secret in Flutter.  
- Do not invent fare engine.  
- Do not activate Kokobin without Ops approval.

---

## 11. Bottom line

| Question | Answer |
| --- | --- |
| Does hosted Cyrlo Maps work through Ride? | **Yes** (verified with review OTP on staging). |
| Does Flutter call Mapbox for privileged ops? | **No** (proxy default; empty Maps API key). |
| Does the complete Flutter mapping booking experience work end-to-end? | **No** — destination/search/route UI missing; reachable booking is simulated; live flow unwired; no active service zone for real creates. |
| Mapping unit tests healthy? | **Yes** (11/11). |
| Audit’s three Flutter failures mapping-related? | **No** — left untouched. |

---

*End of mapping E2E report.*
