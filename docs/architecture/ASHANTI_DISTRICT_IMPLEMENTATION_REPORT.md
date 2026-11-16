# Ashanti District Zones — Implementation Report

**Scope:** local implementation only. No production DB mutations, no deploy, no commit/push in this task.

## Completion checklist

| Criterion | Status |
|---|---|
| 43 Ashanti districts ↔ 43 service-zone records (seed) | Implemented via seed script |
| Verified ADM2 polygons on each zone | Reconciled FeatureCollection + seed |
| Atwima Kwanwoma only initially ACTIVE | Enforced in seed + tests |
| Other districts inactive / DRAFT | Seed policy |
| Admin interactive Ashanti map | `/zones/ashanti-map` |
| Selection shows backend zone info | Side panel + real APIs |
| Permissions / lifecycle preserved | Reused existing endpoints |
| Kokobin cutover documented, not executed | Dry-run script + docs |

## Changed / added files (high level)

### Geographic data

- `ops/geo/ashanti/SOURCE.json`
- `ops/geo/ashanti/build-ashanti-adm2.mjs`
- `ops/geo/ashanti/ashanti-districts-adm2.geojson`
- `ops/geo/ashanti/ashanti-districts-reconciliation.json`
- National downloads (local cache): `geoBoundaries-GHA-ADM2*.geojson`

### Backend

- `backend/prisma/schema.prisma` — `districtId`, geographic provenance, `District.catalogueId`
- `backend/prisma/migrations/20261116150000_ashanti_district_service_zones/`
- `backend/src/modules/service-zones/module.schema.ts`
- `backend/src/modules/service-zones/module.repository.ts`
- `backend/src/modules/service-zones/module.service.ts`
- `backend/src/modules/service-zones/memory-service-zones-repository.ts`
- `backend/src/modules/service-zones/ashanti-district-zones.test.ts`
- `backend/scripts/seed-ashanti-district-zones.ts`
- `backend/scripts/cutover-kokobin-to-atwima-kwanwoma.ts`

### Admin SPA

- MapLibre-based Ashanti map page + features under `apps/cyrlo_admin/src/features/zones/`
- Route `/zones/ashanti-map`, nav item, ZonesPage link
- Extended `AdminServiceZone` + `fetchServiceZones` filters

### Docs

- `docs/architecture/ASHANTI_DISTRICT_SERVICE_ZONE_MODEL.md`
- `docs/architecture/ASHANTI_DISTRICT_GEO_DATA.md`
- `docs/admin/ASHANTI_REGION_MAP_IMPLEMENTATION.md`
- This report

## API contract deltas

### `ServiceZone` view (list/get)

New fields:

```json
{
  "districtId": "uuid|null",
  "geographicSource": "string|null",
  "geographicAttribution": "string|null",
  "geographicDatasetVersion": "string|null",
  "geographicShapeId": "string|null"
}
```

### Create / update

- Optional `districtId` (mutually exclusive with `communityId` on create).
- Optional geographic provenance fields.
- List query adds `districtId`, `regionId`.

### Unchanged

Lifecycle paths, rider approvals, matching, payments, tokens, booking fee.

## Tests

- Backend: Ashanti FC validity (43 districts, no Accra, attribution), district-zone activation / uniqueness / unverified block, Atwima PIP interior vs Accra / misplaced Kokobin point.
- Admin: map helpers + page tests (mocked MapLibre); full Admin suite previously reported green by map implementation.

## Limitations

1. Two districts store official **simplified** ADM2 rings due to the 5000-vertex backend cap (Atwima Mponua, Sekyere Afram Plains North).
2. Admin map uses MapLibre + Carto tiles (first Admin map dependency); production tile TOS / self-hosting may be needed later.
3. Seed marks non-Atwima boundaries `VERIFIED` for sourced ADM2 locally; production should still run Super-Admin verify as policy requires.
4. Point-in-polygon booking assert remains Milestone-gated (`assertPickupSupported` notImplemented) — coverage eligibility elsewhere continues to use ACTIVE zone geometry when matching is wired.
5. Production Kokobin cutover is **not** executed.

## Production cutover requirements (authorization required)

1. Apply migration `20261116150000_ashanti_district_service_zones`.
2. Deploy API + Admin build containing district fields and map.
3. Run `seed-ashanti-district-zones.ts` against the target DB **or** equivalent controlled upsert (review first).
4. Dry-run `cutover-kokobin-to-atwima-kwanwoma.ts --dry-run`.
5. Explicit written authorization, then execute with `--execute --i-understand-production-risk` (and `--migrate-approvals` only if Ops chooses automatic approval migration).
6. Verify: only Atwima Kwanwoma ACTIVE; Kokobin locked; booking FKs intact; riders re-approved as decided; Admin map shows 43 districts.
7. Do **not** auto-approve all Atwima riders.
