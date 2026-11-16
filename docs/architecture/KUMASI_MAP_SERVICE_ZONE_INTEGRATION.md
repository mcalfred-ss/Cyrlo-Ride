# Cyrlo Ride — Greater Kumasi map & service-zone integration

**Date:** 2026-11-16  
**Scope:** Flutter `apps/cyrlo_app` only  
**Accra:** Explicitly out of scope  
**Production data / deploy:** Not modified

---

## Summary

Passenger and rider map UX now treat **Greater Kumasi map exploration** and **backend service-zone coverage** as separate concerns.

- Map cold-start shows a wider Greater Kumasi camera (not Accra).
- Pickup labels come from reverse geocode shaping (Food-inspired), never from GPS→town hardcoding.
- Passenger coverage states use `POST /matching/nearby` `inServiceArea` as source of truth.
- Rider zone approval uses `GET /riders/eligibility` and never claims eligibility from GPS alone.

---

## API contracts used

| Method | Path | Who | Use |
| --- | --- | --- | --- |
| `POST` | `/maps/geocode/reverse` | Authenticated | Pickup label enrichment only |
| `POST` | `/matching/nearby` | Passenger | `inServiceArea`, optional `serviceZoneId`, nearby riders |
| `GET` | `/matching/supply` | Passenger | Existing Book CTA supply probe (unchanged contract) |
| `GET` | `/riders/eligibility` | Rider | Zone approval / GPS freshness reasons |
| `POST` | `/riders/availability` | Rider | Existing go-online (unchanged) |

### Not used (and why)

| Endpoint | Reason |
| --- | --- |
| `GET /service-zones` | Staff-only (`ManageServiceZones` / `ViewGeoCoverage`). No passenger/rider public active-zones list. |
| Admin geo hierarchy | Staff-only; no public community-from-point resolve. |

**Documented missing contract (blocker for richer UX):**  
A public/authenticated passenger+rider read such as `GET /service-zones/active` or `POST /service-zones/cover` returning whether a point is inside an active zone (and zone id/name) **without** requiring staff permissions. Until then Flutter must not invent zone polygons client-side.

---

## Map coverage behavior

| Behavior | Implementation |
| --- | --- |
| Cold-start extent | `GreaterKumasiExtent` + `RideMapProjects.passengerRequest` zoom `11.6` around Kumasi center |
| Accra | Outside extent; soft-clamped away on camera moves from the passenger map |
| Explore / select | Map taps and My location still set GPS coordinates freely inside the soft-clamped camera guide |
| Service ≠ map | Being inside Greater Kumasi does **not** imply service available |

Map camera soft-clamp is a UX guardrail only. It is **not** a service-zone boundary and does not invent GeoJSON.

---

## Location-label improvements

| Layer | Behavior |
| --- | --- |
| GPS / tap | Coordinates only (source of truth) |
| Reverse geocode | Best-effort label via `/maps/geocode/reverse` |
| Shaping | `shapeLocationLabel` keeps most-specific leading segments, drops trailing `Ghana` |
| Coarse provider labels | UI prefixes `Approximate area:` when only city/region (e.g. Kumasi / Ashanti) is returned |
| Food reuse | Ported **string shaping** ideas from Cirlo Food; **did not** copy Food’s hardcoded Ahenema/Kokoben GPS shortcuts |

### Why Ahenema still becomes “Kumasi, Ashanti”

Production reverse geocode currently returns coarse city/region for that fix. Flutter will not invent “Ahenema Kokoben” from coordinates. Remaining blockers:

1. Maps reverse locality quality (country/types / richer locality fields).
2. No public community-from-point API (admin community has no center/boundary for Ahenema today).
3. Live Kokobin service-zone polygon still does not cover real Ahenema Kokoben GPS (ops data issue; not fixed in this Flutter pass).

---

## Service-zone awareness (passenger)

States shown on the passenger map:

1. **Location unavailable** — no usable pickup / GPS denied or unavailable  
2. **Checking** — resolving GPS or waiting on nearby probe  
3. **Service available** — backend `inServiceArea: true`  
4. **Outside service area** — backend `inServiceArea: false`

Book CTA on the map requires coverage `canBook` (backend in-service) in addition to existing supply checks.

---

## Rider experience

| Check | Source | UI |
| --- | --- | --- |
| Approved for an active zone | `GET /riders/eligibility` reason `NO_APPROVED_ACTIVE_ZONE` | Jobs banner: zone approval required |
| GPS freshness / sharing | eligibility reasons | Explains location unavailable; GPS ≠ eligible |
| Go-online rejection | existing availability error details | Clearer zone-approval copy |

**Not claimed:** “current GPS is inside the zone polygon.” Backend has no public rider point-in-zone read; approval for an active zone ≠ geometric coverage of the latest fix.

Availability and matching rules were not changed.

---

## Tests run

```text
flutter test \
  test/mapping/location_label_test.dart \
  test/mapping/greater_kumasi_extent_test.dart \
  test/mapping/trip_pin_controller_test.dart \
  test/mapping/service_coverage_test.dart \
  test/mapping/passenger_trip_plan_test.dart \
  test/rider/rider_eligibility_parse_test.dart
```

**Result:** 26/26 passed.

---

## Remaining blockers

1. **Ops zone geometry** — replace live Kokobin polygon with verified Ahenema Kokoben coverage (do not invent in app).  
2. **Public coverage API** — optional dedicated point-in-active-zone endpoint for passengers/riders.  
3. **Town-level reverse labels** — Maps reverse / landmark catalog / community centers needed before Ahenema can display as town without hardcoding.  
4. **Admin SPA / API branch skew** — separate from this Flutter work; directory APIs still missing on `main` deploy.

---

## Key files touched

- `lib/core/mapping/greater_kumasi_extent.dart`  
- `lib/core/mapping/location_label.dart`  
- `lib/core/mapping/ride_map_projects.dart`  
- `lib/passenger_app/map/application/trip_pin_*.dart`  
- `lib/passenger_app/map/application/service_coverage.dart`  
- `lib/passenger_app/map/presentation/passenger_map_screen.dart`  
- `lib/passenger_app/home/application/nearby_riders_provider.dart`  
- `lib/rider_app/eligibility/*`  
- `lib/rider_app/jobs/presentation/rider_jobs_screen.dart`  
- matching tests under `test/mapping/` and `test/rider/`
