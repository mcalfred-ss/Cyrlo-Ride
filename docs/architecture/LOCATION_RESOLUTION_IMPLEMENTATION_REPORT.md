# Location Resolution Implementation Report

**Date:** 2026-11-16  
**Scope:** Greater Kumasi / Ashanti — Accra out of scope  
**Mode:** Implementation complete locally (not deployed)  
**Ghana/maps stash:** intact — `stash@{0}: On main: wip-ghana-maps-preserve-phase0`

---

## Summary

Added a central Ride location-resolution path that composes the existing Cyrlo Maps reverse-geocode label with an Ashanti Open Admin town catalogue and verified landmarks. Flutter pickup labeling now consumes the structured result without moving GPS coordinates or inventing towns.

---

## Changed files

### Backend
| Path | Change |
| --- | --- |
| `backend/src/modules/maps/catalogue/data/ashanti-open-admin.json` | Ashanti-only Open Admin subset (points) |
| `backend/src/modules/maps/catalogue/ashanti-open-admin.catalog.ts` | Typed catalogue module (388 towns, 43 districts) |
| `backend/src/modules/maps/location-resolution/*` | Resolver, label parse, catalogue match, nearby landmarks, tests |
| `backend/src/modules/maps/module.schema.ts` | `locationResolveBodySchema` |
| `backend/src/modules/maps/module.service.ts` | `resolveLocation()` |
| `backend/src/modules/maps/module.controller.ts` | Handler |
| `backend/src/modules/maps/module.routes.ts` | `POST /location/resolve` |
| `backend/src/modules/maps/module.service.test.ts` | Resolve tests |
| `backend/src/docs/openapi.ts` | Contract for `/maps/location/resolve` |

### Flutter
| Path | Change |
| --- | --- |
| `apps/cyrlo_app/lib/core/mapping/resolved_location.dart` | Models + display helpers |
| `apps/cyrlo_app/lib/core/mapping/place_lookup_gateway.dart` | `resolve()` |
| `apps/cyrlo_app/lib/core/mapping/ride_maps_gateway.dart` | Calls `/maps/location/resolve` |
| `apps/cyrlo_app/lib/core/constants/api_paths.dart` | Path constant |
| `apps/cyrlo_app/lib/passenger_app/map/application/trip_pin_*.dart` | Structured label + nearby landmarks |
| `apps/cyrlo_app/lib/passenger_app/map/application/passenger_trip_plan.dart` | Prefers resolve |
| `apps/cyrlo_app/lib/passenger_app/map/presentation/passenger_map_screen.dart` | Nearby landmark line |
| `apps/cyrlo_app/test/mapping/*` | Updated / extended tests |

### Docs
| Path | Change |
| --- | --- |
| `docs/architecture/LOCATION_RESOLUTION.md` | Sources, confidence rules, limitations |
| `docs/architecture/LOCATION_RESOLUTION_IMPLEMENTATION_REPORT.md` | This report |

---

## Test results

| Suite | Result |
| --- | --- |
| Backend `resolve-location` + `module.service` + landmarks | **26/26 passed** |
| Backend `tsc --noEmit` | **passed** |
| Flutter `test/mapping` | **32/32 passed** |

---

## API

`POST /api/v1/maps/location/resolve` (same JWT / active-account auth as other `/maps/*` routes)

- Reuses Maps reverse when available; degrades to catalogue-only on provider outage.
- Does **not** replace `POST /maps/geocode/reverse`.
- Does **not** change matching, booking, payments, or tokens.

---

## Remaining limitations

1. Cyrlo Maps still returns a flat label only (no structured Mapbox context).
2. Town matching is centroid proximity with conservative uniqueness — not polygon containment.
3. No Accra catalogue rows.
4. Nearby landmarks are catalogue-based (no provider radius POI API).
5. Current production Kokobin service-zone geometry remains spatially wrong for Ahenema (separate ops track); this work does not activate or replace zones.

---

## Deployment requirements

1. Deploy Ride API with the new maps module code (no DB migration).
2. Ensure `CYRLO_MAPS_BASE_URL` / `CYRLO_MAPS_API_KEY` remain configured (reverse enrichment).
3. Ship Flutter build that calls `/maps/location/resolve`.
4. Retain CC-BY-4.0 attribution for Open Admin Data (documented in catalogue header + `LOCATION_RESOLUTION.md`).
5. Do **not** treat this as service-zone cutover authorization.

---

## Explicit non-actions

- No production DB or zone changes.
- No invented polygons or centroid buffers as service zones.
- No Accra assets.
- Ghana/maps stash preserved.
