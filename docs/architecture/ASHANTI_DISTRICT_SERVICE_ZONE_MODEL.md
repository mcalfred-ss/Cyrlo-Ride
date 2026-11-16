# Ashanti District Service-Zone Model

## Summary

Cyrlo Ride service coverage in Ashanti is modeled as **exactly one service zone per district**. Communities and towns remain catalogue / geo-hierarchy records under districts; they are **not** independent bookable zones.

| Rule | Detail |
|---|---|
| Region in scope | Ashanti Region, Ghana only |
| Zone cardinality | 1 `ServiceZone` ↔ 1 `District` |
| Initial ACTIVE zone | **Atwima Kwanwoma** only |
| All other Ashanti districts | `DRAFT` / inactive (not bookable) |
| Accra / other regions | Out of scope |

## Data model

`ServiceZone` gains an optional unique `districtId` FK to `geo_districts`.

- Prefer `districtId` for Ashanti district zones.
- Legacy `communityId` remains for historical community-linked zones (e.g. Kokobin).
- Geographic provenance columns: `geographicSource`, `geographicAttribution`, `geographicDatasetVersion`, `geographicShapeId`.
- `District.catalogueId` stores the Open Admin Ashanti catalogue id (e.g. `gh-dist-atwima-kwanwoma`).

### Activation rules

A zone may be activated only when:

1. Status is not `DRAFT` (submit for review first).
2. `boundaryVerificationStatus === VERIFIED`.
3. Stored geometry re-validates.
4. Hierarchy is ACTIVE:
   - **District-linked:** district → region → country ACTIVE (no community required).
   - **Community-linked (legacy):** community VERIFIED + community/district/region/country ACTIVE.

Only `ACTIVE` + `isActive=true` zones participate in bookable coverage and go-online zone approval checks.

## Initial local configuration

Seed script: `backend/scripts/seed-ashanti-district-zones.ts`

- Creates Ghana → Ashanti Region → 43 districts.
- Creates 43 district zones from `ops/geo/ashanti/ashanti-districts-adm2.geojson`.
- Sets **Atwima Kwanwoma** `ACTIVE` + `VERIFIED`.
- Sets every other district zone `DRAFT` + `VERIFIED` (sourced ADM2; still not bookable until activated via lifecycle).
- Does **not** promote the misplaced Kokobin polygon as the Atwima boundary.

## Production Kokobin retirement

Kokobin is an incorrect ACTIVE community zone historically linked to Ahenema Kokoben with a misplaced polygon and existing booking / rider-approval history.

**Do not silently overwrite or delete it.**

See:

- Cutover script (dry-run by default): `backend/scripts/cutover-kokobin-to-atwima-kwanwoma.ts`
- Implementation report: `docs/architecture/ASHANTI_DISTRICT_IMPLEMENTATION_REPORT.md`

Historical bookings retain their original `service_zone_id`.

## Rider and passenger implications

- Go-online still requires an **APPROVED** rider↔zone pair for an **ACTIVE** zone (unchanged matching/token/payment rules).
- Riders outside Atwima Kwanwoma cannot go online for bookable coverage until their district zone is activated **and** they are approved for that zone.
- Passenger pickup coverage uses ACTIVE district-zone geometry (PIP).
- Location-resolution labels (Open Admin towns / landmarks) remain separate from zone eligibility.
- GPS coordinates are never moved to district centroids.
- Do **not** auto-approve all riders in Atwima Kwanwoma.

## Unchanged

Matching radius, offer batch size, search duration, booking lifecycle, booking fee, token deductions, payment handling.
