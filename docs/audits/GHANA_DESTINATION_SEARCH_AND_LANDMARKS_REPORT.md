# Ghana destination search and landmarks

**Date:** 2026-11-11  
**Scope:** Passenger destination search restricted to Ghana; curated landmark directory; service-zone rejection verification.  
**Constraints observed:** Reuse Cyrlo Maps; no invented coordinates; no service-zone activation; no real payments/SMS/bookings; no auto-deploy; pickup / reverse geocode / routes unchanged.

---

## 1. Existing search implementation findings

### Ride → Cyrlo Maps proxy

| Piece | Location | Finding |
| --- | --- | --- |
| HTTP client | `backend/src/infrastructure/maps/cyrlo-maps.client.ts` | `POST /v1/places/search` previously sent only `text`, `limit`, `bias` |
| Ride service | `backend/src/modules/maps/module.service.ts` | Pass-through; no country filter, no catalog |
| Schema | `backend/src/modules/maps/module.schema.ts` | `placeSearchBodySchema` had no `country` |
| Auth | JWT on `/api/v1/maps/*` | Unchanged |

Chrome QA showed destination queries returning unrelated international hits (e.g. Côte d’Ivoire, South Korea) because the provider was not constrained and Ride did not post-filter.

### Flutter passenger search

| Piece | Finding |
| --- | --- |
| `RideMapsPlaceLookupGateway` | Posts to `/maps/places/search` with text + optional pickup `bias` |
| `PassengerTripPlanController` | 350ms debounce + search generation guard (stale responses discarded) |
| Suggestions UI | Title = `label`, subtitle = `address`; map tap still places destination |
| Empty state | Generic “No places found…” (replaced in this work) |

### Provider capabilities inspected

Cyrlo Maps place search already supports proximity via `bias`. Country / types are forwarded on the request body so the hosted Maps API can apply provider filters (`country=GH`, relevant place types). Ride additionally applies a Ghana WGS84 bbox post-filter so foreign hits never reach Flutter even if upstream ignores `country`.

Reverse geocode (`POST /maps/geocode/reverse`) and routes (`POST /maps/routes`) were left unrestricted — map viewport and pin placement remain global.

### Booking / service-zone path (inspection)

`BookingsService.create` calls `findActiveZoneCoveringPickup` **before** creating payment rows or calling `paystack.initializeTransaction`. Flutter `startLiveBookingFlow` only opens Paystack after a successful `create` (and optional `initializeBookingFee`). Zone rejection surfaces via `isServiceAreaRejection` → `markServiceUnavailable` without checkout.

No service zone was activated during this work.

---

## 2. Changes made

### Backend — Ghana filter at provider/proxy layer

1. **`HttpCyrloMapsClient.searchPlaces`** — forwards `country` and `types` to Cyrlo Maps.
2. **`MapsService.places`** — for passenger destination search:
   - Defaults `country` to `GH`.
   - Requests types: `poi`, `landmark`, `address`, `street`, `place`, `locality`, `neighborhood`.
   - Passes pickup `bias` when present.
   - Filters provider hits with Ghana bbox.
   - Merges curated landmarks **ahead** of provider results; drops near-duplicates (~80 m / same name within 500 m).
   - If the provider fails but landmarks match, returns landmarks only.
3. **Schema** — optional `country` on place search; constants `PASSENGER_DESTINATION_COUNTRY` / `PASSENGER_DESTINATION_PLACE_TYPES`.

### Backend — curated landmark directory

| File | Role |
| --- | --- |
| `backend/src/modules/maps/landmarks/ghana-landmarks.catalog.ts` | Verified landmark records + Ghana bbox helper |
| `backend/src/modules/maps/landmarks/ghana-landmarks.search.ts` | Alias scoring, proximity boost, duplicate detection, merge |

Architecture is nationwide-ready (add rows with the same verification fields). Starter set is Ashanti/Kumasi only.

Each landmark stores: official name, aliases, lat/lng, region/district/community, category, source, sourceRef, verifiedAt.  
Hits are **not** persisted as DB place records — search merges in memory only.

### Flutter — search UX (minimal)

1. Empty state: *“No matching places in Ghana. Try a landmark, street, or nearby area.”*
2. Selecting a suggestion uses the **landmark/place name** (`label`) as the destination field (address remains suggestion context).
3. Debounce, stale-response guard, map-pin destination, and route preview unchanged.

### Service-zone verification (code + tests only)

- Confirmed create rejects outside ACTIVE zone with `Pickup is outside the active service area`.
- Confirmed Paystack `initializeTransaction` is not called on that path (`paystack.initializations` assertion in DB test).
- Flutter keeps pickup/destination/route after `markServiceUnavailable`.
- Live booking source order: `create` → then `initializeBookingFee`; zone catch uses `markServiceUnavailable`.

---

## 3. Landmark data sources and verification status

**Method:** Read-only OpenStreetMap Nominatim lookups with `countrycodes=gh` (2026-11-11). Coordinates were copied from those results — none invented.

| Id | Name | Aliases | Approx location | Category | Status |
| --- | --- | --- | --- | --- | --- |
| `gh-knust` | Kwame Nkrumah University of Science and Technology | KNUST | Oduom, Ashanti | university | Verified |
| `gh-kejetia-market` | Kejetia Market | Kejetia | Adum, Ashanti | market | Verified |
| `gh-kath` | Komfo Anokye Teaching Hospital | KATH, Komfo Anokye | Adum, Ashanti | hospital | Verified |
| `gh-kumasi-city-mall` | Kumasi City Mall | KCM, City Mall Kumasi | Asokwa, Ashanti | mall | Verified |
| `gh-adum` | Adum | Adum Kumasi | Adum, Ashanti | community | Verified |
| `gh-ahodwo` | Ahodwo | Ahodwo Kumasi | Ahodwo, Ashanti | community | Verified |
| `gh-santasi` | Santasi Roundabout | Santasi | Patasi, Ashanti | landmark | Verified (Nominatim “Santasi Kumasi” hit) |
| `gh-tafo` | Tafo | Old Tafo, Tafo Kumasi | Pankrono / Old Tafo | community | Verified |

**Not done:** Nationwide expansion beyond this starter set; third-party survey GPS; storing every provider hit in Postgres.

---

## 4. Tests and results

### Backend (vitest)

```text
npx vitest run \
  src/infrastructure/maps/cyrlo-maps.client.test.ts \
  src/modules/maps/landmarks/ghana-landmarks.search.test.ts \
  src/modules/maps/module.service.test.ts
```

**Result:** 3 files, **27 passed**.

Covered:

- Ghana-only / bbox exclusion of Côte d’Ivoire, South Korea, Congo-class coordinates
- Provider request includes `country=GH`, types, bias
- Landmark aliases (KNUST, KATH, Kejetia, City Mall, …)
- Proximity bias
- Duplicate detection (catalog clean; synthetic duplicate detected)
- Merge ordering + near-duplicate drop
- Empty search
- Reverse/route still callable without destination filters
- Client forwards country/types/bias

**Also updated:** `module.db.test.ts` asserts `paystack.initializations.length === 0` after outside-zone create rejection (requires Postgres when that suite runs).

### Flutter

```text
flutter test test/mapping/passenger_trip_plan_test.dart
flutter test test/booking/live_booking_create_payload_test.dart
```

**Result:** **20 + 4 passed**.

Covered:

- Debounce + stale protection (existing)
- Pickup bias passed into search
- Empty Ghana message
- Landmark selection updates destination + route
- Service unavailable preserves pickup/destination/route
- Zone rejection does not count as payment init; flow source orders create before checkout

### Typecheck

`npx tsc -p tsconfig.json --noEmit` — clean for these changes.

---

## 5. Remaining limitations

1. **Provider `country` / `types` support** — Ride always sends them; if a Maps deployment ignores unknown fields, Ghana bbox still drops foreign coordinates. Types may be partially ignored depending on upstream.
2. **Catalog coverage** — Starter set is Kumasi-focused; Accra and other regions need the same Nominatim (or survey) verification before adding rows.
3. **Community centroids** — OSM community points (Adum, Tafo, …) are representative, not parcel-precise.
4. **No permanent place DB** — Intentional; only curated landmarks are versioned in code.
5. **Service zones** — Still inactive in pilot; booking outside coverage correctly rejects, but end-to-end “happy path” booking still needs an ACTIVE zone (out of scope — do not activate here).
6. **Map viewport** — Intentionally not clipped to Ghana.

---

## 6. Manual Chrome QA instructions

Prerequisites: local Ride API with `CYRLO_MAPS_*` configured; Flutter web passenger session (e.g. `127.0.0.1:7360`); **do not** activate service zones; **do not** complete Paystack payment.

1. **Pickup / reverse / route regression**  
   Open `#/passenger/map` → My location or tap pickup → confirm reverse label → tap destination or select a place → confirm yellow route preview still works.

2. **Ghana-only destination search**  
   With pickup in Kumasi, search short queries that previously returned foreign hits (e.g. ambiguous names). Confirm results are Ghanaian; Abidjan / Seoul-style hits must not appear.

3. **Landmarks & aliases**  
   Search: `KNUST`, `Kejetia`, `KATH`, `City Mall`, `Ahodwo`, `Adum`, `Santasi`, `Tafo`.  
   Expect curated name + community/region subtitle; selecting one moves the **D** marker and refreshes the route.

4. **Distinguishable communities**  
   For similar names, subtitle should show community/region (e.g. Adum vs other contexts).

5. **Empty state**  
   Search `zzzznonexistentplacexyz` → message about no matching places **in Ghana**.

6. **Manual pin**  
   Switch pin target to destination, tap map → reverse label + route still work without using search.

7. **Service-zone rejection (no payment)**  
   With route ready, Continue → choose Pragya. Expect unavailable-service message (no ACTIVE zone). Confirm pickup + destination fields/markers remain. Confirm no Paystack WebView opens. Do not retry payment.

8. **Viewport**  
   Pan/zoom outside Ghana still allowed; only **search** is Ghana-restricted.
