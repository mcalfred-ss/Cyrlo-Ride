# Cyrlo Ride — Complete Maps Functionality Audit

**Date:** 2026-11-11  
**Mode:** READ-ONLY (no code changes, migrations, deploys, zone activations, bookings, payments, or SMS)  
**Scope:** Cyrlo Maps + Ride Maps proxy + Flutter mapping + Ghana coverage + service zones + nearby riders  
**Commit context:** local workspace at audit time; staging live health checks against `api.cyrlomap.eqostack.com` and `cyrloride.eqostack.com`

---

## 1. Executive verdict

**WORKING WITH LIMITATIONS — mapping infrastructure is real and largely fail-closed; end-to-end passenger map UX and live supply visualization are incomplete.**

| Layer | Verdict |
| --- | --- |
| Cyrlo Maps host (`/health`, `/ready`) | **WORKING** (live 200; Mapbox provider configured) |
| Ride Maps JWT proxy (`/api/v1/maps/*`) | **WORKING** (auth + prior staging smoke); live privileged calls not re-run this session (would need OTP) |
| Flutter → Ride proxy wiring | **WORKING** for reverse geocode / config; places/routes gateways wired but unused by passenger booking |
| Passenger pickup-only booking map | **WORKING WITH LIMITATIONS** (unit-tested; Chrome/device map QA incomplete; staging 0 ACTIVE zones) |
| Ghana landmarks + GH filter | **WORKING** for backend `/maps/places/search` (Kumasi starter catalog); **not exercised by current passenger booking UI** |
| Routing / route estimate | **WORKING** as proxy + ops surface; **unused** by destination-free passenger booking (retain) |
| Service-zone geometry + ACTIVE gate | **WORKING** in code/tests; staging still **0 bookable ACTIVE zones** (prior audits) |
| Nearby riders on passenger map | **NOT WORKING** as a live Maps feature (empty stub; real proximity is backend matching only) |
| Physical-device / browser map rendering | **NOT TESTED** in this audit (prior Chrome QA blocked; device QA incomplete) |

**Do not treat unit/proxy success as proof that tiles, GPS permissions, or happy-path booking work on a phone.** Staging still cannot complete a real create→match path without an ACTIVE service zone (activation is Ops-only; none performed here).

---

## 2. Complete mapping architecture

### 2.1 Request flow

```
Flutter (apps/cyrlo_app)
  ├─ CyrloMapView / CyrloMapController (cyrlo_maps SDK, git-pinned)
  │    tiles ← public Mapbox pk. (dart-define OR GET /maps/config)
  │            OR MissingTokenPolicy.cartoFallback / offlineCanvas
  ├─ DeviceLocationGateway → Geolocator (permissions + GPS)
  ├─ PlaceLookupGateway  ─┐
  └─ RoutePreviewGateway ─┴─ USE_RIDE_MAPS_PROXY=true (default)
       RideMaps*Gateway → ApiClient (Ride JWT)
         → POST/GET https://cyrloride.eqostack.com/api/v1/maps/*
              authenticate + requireActiveAccount
              MapsService → HttpCyrloMapsClient
                Authorization: Bearer CYRLO_MAPS_API_KEY (server-only)
                → https://api.cyrlomap.eqostack.com/v1/*
                     → Mapbox (and related providers behind Cyrlo Maps)
```

**Privileged Maps secret never ships in the Flutter binary** when the proxy path is used. Flutter constructs `CyrloMapsApiClient` with `apiKey: ''` (`mapping_providers.dart`).

### 2.2 Primary files

| Layer | Path |
| --- | --- |
| Ride mount | `backend/src/app.ts` → `api.use('/maps', …)` |
| Proxy routes | `backend/src/modules/maps/module.routes.ts` |
| Schemas | `backend/src/modules/maps/module.schema.ts` |
| Service | `backend/src/modules/maps/module.service.ts` |
| HTTP client | `backend/src/infrastructure/maps/cyrlo-maps.client.ts` |
| Maps provider (readiness) | `backend/src/infrastructure/maps/maps.provider.ts` |
| Ghana landmarks | `backend/src/modules/maps/landmarks/ghana-landmarks.catalog.ts` |
| Landmark search/merge | `backend/src/modules/maps/landmarks/ghana-landmarks.search.ts` |
| Flutter providers | `apps/cyrlo_app/lib/core/mapping/mapping_providers.dart` |
| Ride gateways | `apps/cyrlo_app/lib/core/mapping/ride_maps_gateway.dart` |
| GPS | `apps/cyrlo_app/lib/core/mapping/device_location_gateway.dart` |
| Map projects | `apps/cyrlo_app/lib/core/mapping/ride_map_projects.dart` |
| Passenger map UI | `apps/cyrlo_app/lib/passenger_app/map/presentation/passenger_map_screen.dart` |
| Trip plan | `apps/cyrlo_app/lib/passenger_app/map/application/passenger_trip_plan.dart` |
| Architecture note | `docs/architecture/CYRLO_MAPS_INTEGRATION.md` |

### 2.3 Ride `/maps/*` surface

| Method | Path | Auth | Upstream |
| --- | --- | --- | --- |
| GET | `/maps/config` | JWT + active account | Local tile token + optional Cyrlo Maps `/v1/config` |
| POST | `/maps/geocode` | same | `/v1/geocode` |
| POST | `/maps/geocode/reverse` | same | `/v1/geocode/reverse` |
| POST | `/maps/places/search` | same | landmarks merge + `/v1/places/search` |
| POST | `/maps/routes` | same | `/v1/routes` |
| POST | `/maps/routes/estimate` | same | `/v1/routes/estimate` |

Unconfigured Maps client → `501 NOT_IMPLEMENTED` (`MapsService.requireClient`).

### 2.4 Config (names only — no secret values)

| Variable | Role |
| --- | --- |
| `CYRLO_MAPS_BASE_URL` | Maps API origin (default `https://api.cyrlomap.eqostack.com`) |
| `CYRLO_MAPS_API_KEY` | Server Bearer to Cyrlo Maps |
| `CYRLO_MAPS_TIMEOUT_MS` | Default 10_000 |
| `MAPBOX_ACCESS_TOKEN` | Public `pk.` exposed via `/maps/config` for tiles |
| `USE_RIDE_MAPS_PROXY` | Flutter dart-define; default **true** |
| `CYRLO_MAPS_API_TOKEN` | Flutter; must stay empty for privileged calls |

Logger redacts `*.CYRLO_MAPS_API_KEY` and `*.MAPBOX_ACCESS_TOKEN` (`backend/src/config/logger.ts`).

---

## 3. Feature-by-feature status

Status key: **WORKING** | **WORKING WITH LIMITATIONS** | **NOT WORKING** | **NOT TESTED**

| Feature | Status | Evidence |
| --- | --- | --- |
| Cyrlo Maps `/health` | **WORKING** | Live `200` `{"data":{"status":"ok"}}` (2026-11-11) |
| Cyrlo Maps `/ready` | **WORKING** | Live `200` `provider":"mapbox","provider_configured":true` |
| Ride `/api/v1/health` | **WORKING** | Live `200` service `cyrlo-ride-api` |
| Ride `/api/v1/health/ready` | **WORKING** | Live `200` `maps.configured:true`, `adapter:"cyrlo-maps-http"` |
| Ride `/maps/config` auth gate | **WORKING** | Unauthenticated live `401` (this audit) |
| Privileged proxy geocode/places/routes | **WORKING WITH LIMITATIONS** | Prior staging smoke all `200` (`CYRLO_RIDE_MAPS_E2E_TEST_REPORT.md` §3.4); not re-authenticated this session |
| Map init / tiles / pan / zoom | **NOT TESTED** (this audit) | Code: `CyrloMapView` + `RideMapProjects.passengerRequest`; Chrome/device QA incomplete per prior reports |
| Current location marker / pickup marker | **WORKING WITH LIMITATIONS** | Unit: `passenger_trip_plan_test`, `trip_pin_controller_test`; UI wires markers when pin set — no device visual proof here |
| Markers update on pickup change | **WORKING** (unit) | Tap-again updates pickup only |
| Screen resize / network interrupt / bad config | **NOT TESTED** | `MissingTokenPolicy.cartoFallback` coded; no live interrupt matrix |
| Private API credentials in client | **WORKING** (fail-closed) | `apiKey: ''`; `MapToken.acceptPublic` strips `sk.`; unit `deferred_maps_api_client_test` |
| GPS permission request | **WORKING WITH LIMITATIONS** | Gateway via Geolocator; unit covers deny/disable; permanent-denied collapsed into `denied` |
| Permission denied / services off | **WORKING** (unit) | Message + no invented coords |
| GPS timeout / accuracy / stale client location | **NOT TESTED** / **WORKING WITH LIMITATIONS** | Accuracy passed through when fix present; no dedicated timeout UX test |
| Manual pickup (map tap) | **WORKING** (unit + code) | `placeMapPoint` → reverse label |
| Reverse geocoding (pickup) | **WORKING WITH LIMITATIONS** | Trip plan + profile call proxy; live reverse proven in prior smoke; depends on JWT + Maps |
| Invalid coordinates | **WORKING** (API prior smoke + Flutter `isValid` guard) | Invalid reverse → `400 VALIDATION_ERROR` (E2E report) |
| Destination-free passenger flow | **WORKING** (unit) | Pickup only; CTA Find a Rider; no destination search in booking UI |
| Ghana places search + landmarks | **WORKING** (backend unit + prior smoke) | Not called from current passenger booking UI |
| Accra curated landmarks | **WORKING WITH LIMITATIONS** | BBox accepts Accra; catalog is **Kumasi/Ashanti only** (8 entries) |
| Routing for passenger booking | **N/A (intentionally unused)** | Gateways retained; no production caller |
| Rider navigation / in-trip routing | **NOT TESTED** | `navigationEnabled: true` on map projects; no rider turn-by-turn audit |
| Service-zone PIP + ACTIVE booking gate | **WORKING** (unit) | `findActiveZoneCoveringPickup`; create 409 outside |
| Zone activate safeguards | **WORKING** (unit) | VERIFIED boundary + ACTIVE hierarchy required; create cannot activate |
| Staging bookable zone coverage | **NOT WORKING** for happy path | Prior audits: **0 ACTIVE**; Kokobin LOCKED — not re-queried DB this session |
| Nearby riders on map | **NOT WORKING** | `nearbyRidersProvider` returns empty list by design |
| Backend nearby matching (dispatch) | **WORKING** (unit) | 5 km radius, 30 s GPS freshness, zone approval, AVAILABLE |

---

## 4. API endpoint audit

### 4.1 Cyrlo Maps (direct, read-only)

| Endpoint | This audit | Notes |
| --- | --- | --- |
| `GET /health` | **200** | OK |
| `GET /ready` | **200** | Mapbox configured |
| `GET /v1/config` | **401** unauthenticated | Expected; privileged |
| `POST /v1/geocode` | **NOT TESTED** (direct) | Covered via Ride proxy in prior E2E |
| `POST /v1/geocode/reverse` | **NOT TESTED** (direct) | Same |
| `POST /v1/places/search` | **NOT TESTED** (direct) | Same |
| `POST /v1/routes` | **NOT TESTED** (direct) | Same |
| `POST /v1/routes/estimate` | **NOT TESTED** (direct) | Same |

### 4.2 Ride Maps proxy

| Endpoint | Auth | Validation | Rate limit | Failure handling | Evidence |
| --- | --- | --- | --- | --- | --- |
| `GET /maps/config` | JWT | none body | Global `apiRateLimiter` | Upstream config failure → `provider: null`; still returns tile token field | Live unauth **401**; prior auth **200** with `pk.` only |
| `POST /maps/geocode` | JWT | `geocodeBodySchema` | Global | Client timeout / AppError mapping | Prior smoke **200** Kumasi |
| `POST /maps/geocode/reverse` | JWT | lat/lng schema | Global | Same | Prior **200**; invalid → **400** |
| `POST /maps/places/search` | JWT | `placeSearchBodySchema` | Global | Provider down → landmarks-only if any | Prior **200** Kejetia; unit merge/filter |
| `POST /maps/routes` | JWT | `routeBodySchema` | Global | Requires client | Prior **200**, 91 geometry points |
| `POST /maps/routes/estimate` | JWT | `routeBodySchema` | Global | Used by `CyrloMapsProvider` readiness path | Prior **200** |

**Maps-specific rate limiter:** none beyond the shared API limiter (`app.ts`). Rider GPS uses a dedicated limiter elsewhere; maps do not.

**Logging:** client documents “Never logs the API key”; pino redact paths include Maps/Mapbox secrets.

### 4.3 Ride readiness maps block (live)

```json
"maps": {
  "configured": true,
  "adapter": "cyrlo-maps-http",
  "baseUrlConfigured": true
}
```

Source: `GET https://cyrloride.eqostack.com/api/v1/health/ready` (2026-11-11). Confirms staging env has Maps client configured — **not** a substitute for authenticated proxy smoke.

---

## 5. Flutter integration audit

### 5.1 Passenger booking map (current product)

| Behavior | Status | Notes |
| --- | --- | --- |
| Pickup-only trip plan | **WORKING** | `PassengerTripPlanController` — no destination |
| Bootstrap GPS on open | **WORKING** (code) | `initState` → `useCurrentLocationAsPickup` |
| Map tap pickup | **WORKING** (unit) | Invalid coords ignored |
| Reverse label on pickup | **WORKING WITH LIMITATIONS** | `_reverseLabel` via Ride proxy; falls back to prefer/coord label |
| Find a Rider → live create | **WORKING WITH LIMITATIONS** | `startLiveBookingFlow` from map; unit payload tests pass; staging create fail-closed without ACTIVE zone |
| Destination search UI | **Intentionally absent** | Do not reintroduce |
| Route polyline UI | **Absent** (OK for product) | Gateway retained |
| Places search UI | **Absent** | Backend capability retained |

### 5.2 Gateways

| Gateway | Wired | Production callers (booking) |
| --- | --- | --- |
| `RideMapsPlaceLookupGateway.reverse` | Yes | Trip plan + passenger details |
| `RideMapsPlaceLookupGateway.search` / `forward` | Yes | **None** in passenger booking |
| `RideMapsRoutePreviewGateway.preview` | Yes | **None** |
| `CyrloMapsApiClient` (direct) | Diagnostic only | `apiKey: ''` |

### 5.3 Platforms

| Platform | This audit |
| --- | --- |
| Flutter unit (`test/mapping`, booking payload) | **PASS** — 21 mapping + 7 booking payload tests |
| Chrome / CanvasKit map QA | **NOT TESTED** — prior `PASSENGER_MAP_CHROME_QA_REPORT.md`: blocked at create-account |
| Android / iOS physical GPS | **NOT TESTED** — prior `PASSENGER_MAP_DEVICE_QA_REPORT.md`: incomplete |
| Windows desktop map | **NOT TESTED** |

### 5.4 Credential exposure

| Asset | Risk |
| --- | --- |
| `CYRLO_MAPS_API_KEY` | Server-only — **OK** if proxy stays default |
| Mapbox `pk.` | Public by design via `/maps/config` / dart-define — **OK**; `sk.` rejected client+server helpers |
| Disabling proxy + setting Flutter Maps token | Residual footgun — keep token empty |

---

## 6. Ghana geographic coverage

| Check | Status | Evidence |
| --- | --- | --- |
| Destination-free uses pickup only | **WORKING** | Trip plan + live booking payload tests; map CTA |
| Ghana-scoped places search retained | **WORKING** (backend) | `MapsService.places` defaults `country=GH`, types filter, bbox post-filter |
| Landmark catalog available | **WORKING WITH LIMITATIONS** | 8 verified Ashanti/Kumasi entries; Nominatim-sourced 2026-11-11 |
| Landmark aliases | **WORKING** (unit) | KNUST, Kejetia, KATH, City Mall, etc. |
| Foreign results excluded | **WORKING** (unit) | Rejects Côte d’Ivoire / Korea / Congo; drops international provider hits |
| Search UI location context | **NOT TESTED** in product UI | Places API unused by booking; would return landmark+provider labels if called |
| Pickup reverse geocode Ghanaian usefulness | **WORKING WITH LIMITATIONS** | Prior Kumasi reverse **200**; quality not systematically sampled Accra/nationwide |
| Kumasi handling | **WORKING** (default center 6.6885,-1.6244 + landmarks) | |
| Accra handling | **WORKING WITH LIMITATIONS** | BBox includes Accra; **no Accra curated landmarks** yet |
| Nationwide hierarchy consistency | **WORKING WITH LIMITATIONS** | Geo admin model exists for zones/communities; landmark catalog not nationwide |
| Invented coordinates | **WORKING** (policy) | Catalog requires verification source; unavailable gateways refuse to invent |

**Passenger booking must not regain destination selection.** Ghana places/landmarks remain for other product surfaces and future search (e.g. profile, ops, rider tools).

---

## 7. Service-zone validation

### 7.1 Geometry

| Concern | Behavior | Status |
| --- | --- | --- |
| Storage | GeoJSON Polygon / MultiPolygon + bbox columns | **WORKING** |
| Validation | Closed rings, type check, vertex cap 5000 | **WORKING** (unit) |
| Self-intersection | Explicitly **not** fully detected | **WORKING WITH LIMITATIONS** (`zone-geometry.ts` comment) |
| Point-in-polygon | Ray casting; holes supported | **WORKING** (unit, MultiPolygon) |
| Invalid geometry | Throws; activation re-validates | **WORKING** (unit) |

### 7.2 Lifecycle (ACTIVE / LOCKED / DRAFT)

| Rule | Confirmed |
| --- | --- |
| Create always DRAFT / inactive; `activate:true` rejected | Yes — unit |
| DRAFT → UNDER_REVIEW → verify → LOCKED → activate → ACTIVE | Yes — unit lifecycle |
| Boundary must be **VERIFIED** before activate | Yes |
| Community + district + region + country must be **ACTIVE**; community **VERIFIED** | Yes |
| Only **ACTIVE** + `isActive` zones bookable | Yes — `findActiveZoneCoveringPickup` |
| Overlap at booking | Smallest bbox area, then oldest `createdAt` — **no activate-time overlap rejection** |
| This audit activated zones | **None** |

### 7.3 Staging reality

Prior DB-backed audits (`CYRLO_RIDE_IMPLEMENTATION_AUDIT.md`, destination-free audits): **0 ACTIVE bookable zones**; Kokobin **LOCKED** / inactive. This session did **not** re-query Postgres. Happy-path create→match remains blocked until Ops activates a verified zone.

---

## 8. Nearby rider discovery

### 8.1 Flutter map supply

| Check | Status |
| --- | --- |
| Live rider coordinates on map | **NOT WORKING** — `NearbyRidersController` finishes load with **empty** list; comment forbids demo pins |
| Availability / zone filters in UI | **N/A** — no data |
| Fake rider coordinates | **Not used** (empty, not fabricated) |

### 8.2 Backend matching (actual supply path)

| Check | Status | Evidence |
| --- | --- | --- |
| Rider coords required | **WORKING** | `location: { isNot: null }` in `loadMatchingCandidates` |
| Uses actual stored location | **WORKING** | Eligibility haversine vs pickup |
| Availability | **WORKING** | `AVAILABLE` + APPROVED + active user |
| Service-zone eligibility | **WORKING** | Zone approval for pickup zone; zone `isActive` |
| Stale GPS | **WORKING** | `RIDER_LOCATION_MAX_AGE_MS = 30_000` → `GPS_NOT_FRESH` |
| Distance consistency | **WORKING** | Haversine; `MATCHING_RADIUS_METERS = 5_000` inclusive |
| Unavailable excluded | **WORKING** | Unit matrix excludes offline/suspended/wrong vehicle/zero tokens/active trip |

**Gap:** passenger map “nearby riders” is disconnected from matching. Dispatch can work without map dots; map dots cannot work until a read API is wired.

---

## 9. Security and configuration findings

| Finding | Severity | Notes |
| --- | --- | --- |
| Maps API key server-side only (proxy default) | Positive | Intended architecture |
| Unauthenticated `/maps/*` rejected | Positive | Live 401 on `/maps/config` |
| Unauthenticated Cyrlo Maps `/v1/config` rejected | Positive | Live 401 |
| Public Mapbox `pk.` via config | Expected | Not a secret; ensure no `sk.` |
| Logger redaction of Maps/Mapbox keys | Positive | Configured |
| No maps-specific rate limit | Low | Relies on global API limiter; abuse surface exists for authenticated clients |
| Flutter direct client with empty key | Positive | Fail-closed for privileged ops |
| Staging Maps configured (`health/ready`) | Positive | Live ready block |
| Staging 0 ACTIVE zones | Operational | Blocks paid booking QA; safe fail-closed |
| Residual: `USE_RIDE_MAPS_PROXY=false` + token | Low | Documented footgun |

No secrets are reproduced in this document.

---

## 10. Testing

### 10.1 Executed this audit (automated)

| Suite | Result |
| --- | --- |
| Backend maps + landmarks + infrastructure maps | **64** tests passed (earlier batch including zones/bookings maps helpers); landmarks **9/9**; maps infra+service **31** in focused run |
| Backend service-zones `module.test.ts` | **26/26** passed |
| Backend matching `module.test.ts` | **6/6** passed (radius, stale GPS, eligibility) |
| Flutter `test/mapping/*` | **21/21** passed |
| Flutter `live_booking_create_payload_test.dart` | **7/7** passed |

### 10.2 Prior live / staging (not re-run with OTP this session)

| Check | Source |
| --- | --- |
| Authenticated proxy geocode/reverse/places/routes/estimate/config | `CYRLO_RIDE_MAPS_E2E_TEST_REPORT.md` |
| Chrome passenger map QA | Incomplete — `PASSENGER_MAP_CHROME_QA_REPORT.md` |
| Device map QA | Incomplete — `PASSENGER_MAP_DEVICE_QA_REPORT.md` |

### 10.3 Missing tests (high value)

| Area | Gap | Suggested type |
| --- | --- | --- |
| GPS permanent denial vs denied | Collapsed statuses | Unit + device |
| GPS timeout / accuracy thresholds | No dedicated tests | Unit + device |
| Manual pickup + reverse against live proxy | Unit uses fakes | Integration (JWT) |
| Ghana-only search from Flutter gateway | No Dio gateway tests | Unit (mocked Dio) |
| Landmark selection UX | No UI (by product choice) | N/A until surface exists |
| Map rendering / tiles / resize / offline | None automated | Browser + device |
| Service-zone boundary edge (exact vertex, self-intersect) | Partial | Unit geometry |
| Nearby riders client wiring | Stub only | Integration when API exists |
| Provider outage → landmarks-only | Service unit partial | Integration |
| Auth failure on `/maps/*` from Flutter | Booking payload covers ApiException shape | Gateway unit |
| DB-backed zone cover on staging | Prior audits only | Staging read-only SQL (Ops) |

**Classification reminder:** unit pass ≠ browser tiles ≠ physical GPS ≠ staging booking.

---

## 11. Prioritized fixes

### P0 — Blocking real map/booking confidence

1. **Ops: ACTIVE service zone** for controlled staging (verified boundary + verified community chain) — **not done in this audit**.
2. **Complete Chrome + one Android/iOS device map QA** (tiles, GPS deny/allow, pickup reverse label, Find a Rider → zone reject with pickup retained).
3. **Wire or deliberately hide** empty nearby-riders UI so passengers are not shown a barren “supply” surface that looks like a bug.

### P1 — Correctness / product integrity

4. Distinct **permanentlyDenied** location UX (settings deep-link messaging).
5. Flutter **RideMaps*Gateway** Dio unit tests (auth 401, validation 400, empty results, timeout).
6. Expand Ghana landmark catalog beyond Kumasi (Accra starter set) with the same verification process — **no invented coords**.
7. Document overlap policy: activate-time conflict detection if multi-zone pilots expand.

### P2 — Retain / harden for future

8. Keep **routes / estimate** proxy endpoints; add smoke to CI without Flutter UI dependency.
9. Optional maps-specific rate limit for authenticated geocode/places.
10. Geometry: optional self-intersection / winding checks before verify.
11. Rider in-trip navigation requirements analysis (SDK `navigationEnabled` vs product need).

---

## 12. Recommended next implementation phase

**Phase goal:** Prove the destination-free pickup map path on staging without reintroducing destination booking.

1. **Ops readiness:** Confirm/activate one pilot ACTIVE zone (explicit Ops approval). Re-verify Maps `health/ready` + authenticated `/maps/config` + reverse geocode.
2. **Device QA pack:** GPS permission matrix + map tiles + reverse label + Find a Rider → SEARCHING (no payment until accept policy).
3. **Supply visibility decision:** Either (a) implement authenticated nearby-rider read API feeding `nearbyRidersProvider` with real GPS + freshness rules, or (b) remove/hide map rider chrome until ready.
4. **Ghana search as a non-booking surface:** Keep backend Ghana places/landmarks; only add UI where product needs place lookup (not passenger destination).
5. **Routing:** Leave infrastructure; do not delete; schedule rider-navigation discovery separately.
6. **Test backlog:** Gateway Dio tests + geometry edge cases + one staging smoke script (JWT review user) for `/maps/*` in CI.

---

## Appendix A — Live probes this session (read-only)

| Probe | Result |
| --- | --- |
| `GET https://api.cyrlomap.eqostack.com/health` | 200 OK |
| `GET https://api.cyrlomap.eqostack.com/ready` | 200 ready, Mapbox configured |
| `GET https://api.cyrlomap.eqostack.com/v1/config` (no auth) | 401 |
| `GET https://cyrloride.eqostack.com/api/v1/health` | 200 OK |
| `GET https://cyrloride.eqostack.com/api/v1/health/ready` | 200; maps configured |
| `GET https://cyrloride.eqostack.com/api/v1/maps/config` (no auth) | 401 |

No bookings, payments, SMS, zone activations, or authenticated Maps privileged bodies were executed in this audit.

## Appendix B — Related audits

| Document | Relevance |
| --- | --- |
| `CYRLO_RIDE_MAPS_E2E_TEST_REPORT.md` | Authenticated proxy smoke + early Flutter gaps |
| `GHANA_DESTINATION_SEARCH_AND_LANDMARKS_REPORT.md` | Landmark merge (destination UX since removed from booking) |
| `DESTINATION_FREE_BOOKING_IMPLEMENTATION_REPORT.md` | Pickup-only create |
| `PASSENGER_MAP_CHROME_QA_REPORT.md` / `PASSENGER_MAP_DEVICE_QA_REPORT.md` | Incomplete visual/GPS QA |
| `CYRLO_RIDE_IMPLEMENTATION_AUDIT.md` | Staging zone counts |
| `docs/architecture/CYRLO_MAPS_INTEGRATION.md` | Proxy architecture |

---

*End of audit.*
