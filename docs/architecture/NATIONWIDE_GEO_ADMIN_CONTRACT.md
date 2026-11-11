# Nationwide geo & service-zone admin API contract

Backend-first contract for a future admin dashboard. No Maps API key or Mapbox token is exposed to browsers — use Ride `/api/v1/maps/*` with staff JWTs for geocoding/preview helpers.

Base: `https://cyrloride.eqostack.com/api/v1`

## Permissions

| Permission | Roles | Use |
| --- | --- | --- |
| `admin.manage_geo_hierarchy` | Super Admin | Countries, regions, districts, imports |
| `admin.manage_service_zones` | Super + Operations | Communities (write), zones, lifecycle (except verify) |
| `admin.verify_service_zones` | Super Admin | Mark zone boundaries verified |
| `admin.view_geo_coverage` | Super, Ops, Finance, Support | Read hierarchy + zones |

## Geography

| Method | Path | Auth |
| --- | --- | --- |
| GET/POST | `/admin/geo/countries` | read / ManageGeoHierarchy |
| GET/PATCH | `/admin/geo/countries/:id` | read / ManageGeoHierarchy |
| GET/POST | `/admin/geo/regions` | read / ManageGeoHierarchy |
| GET/PATCH | `/admin/geo/regions/:id` | read / ManageGeoHierarchy |
| GET/POST | `/admin/geo/districts` | read / ManageGeoHierarchy |
| GET/PATCH | `/admin/geo/districts/:id` | read / ManageGeoHierarchy |
| GET/POST | `/admin/geo/communities` | read / ManageServiceZones or ManageGeoHierarchy |
| GET/PATCH | `/admin/geo/communities/:id` | same (PATCH may set `verificationStatus`) |
| GET | `/admin/geo/tree` | read (`includeCommunities=true` optional) |
| POST | `/admin/geo/imports/preview` | ManageGeoHierarchy |
| POST | `/admin/geo/imports/confirm` | ManageGeoHierarchy |

Import never creates or activates service zones.

## Service zones

Mounted at `/service-zones` and `/admin/service-zones`.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Always DRAFT + UNVERIFIED; `activate:true` rejected |
| GET | `/` | Filters: `status`, `communityId`, `isActive`, `q` |
| GET/PATCH | `/:zoneId` | Boundary edits only in DRAFT |
| POST | `/:zoneId/submit-review` | DRAFT → UNDER_REVIEW |
| POST | `/:zoneId/verify` | Super only; sets boundary VERIFIED; UNDER_REVIEW → LOCKED |
| POST | `/:zoneId/activate` | Requires verified boundary + verified community + active parents |
| POST | `/:zoneId/lock` | Non-bookable locked |
| POST | `/:zoneId/suspend` | ACTIVE → SUSPENDED |
| POST | `/:zoneId/deactivate` | Compat: suspend or lock |

Booking eligibility still requires an **ACTIVE** service zone covering pickup (not merely an active district/region).

## Overlap rule

If multiple ACTIVE zones contain a pickup point, Ride selects the **smallest bounding-box area**, then the **oldest** `createdAt`.

## Pilot seed

`npx tsx scripts/seed-ghana-pilot-hierarchy.ts` creates Ghana → Ashanti → Atwima Kwanwoma → Ahenema Kokoben and links sourced Kokobin polygon as **LOCKED** (not ACTIVE). Surrounding communities are not invented.
