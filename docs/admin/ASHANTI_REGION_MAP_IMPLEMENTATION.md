# Admin Ashanti Region Map

## Route

- **URL:** `/zones/ashanti-map`
- **Nav:** “Ashanti map” (roles with `ManageServiceZones` or `ViewGeoCoverage`)
- **Entry:** also linked from Service zones list

## Behaviour

1. Loads service zones via `GET /admin/service-zones` (`pageSize` ≤ 100, paginated until exhausted).
2. Draws Polygon / MultiPolygon boundaries that intersect the Ashanti extent `[-2.45, 5.85]–[-0.2, 7.65]`.
3. Fits the map to Ashanti Region (not Greater Accra / nationwide).
4. Directory (search + status filter) stays synchronized with map selection.
5. Side panel shows backend zone fields: name, id, status, boundary verification, geographic provenance, region label, approved rider count when authorized.
6. Lifecycle actions call real endpoints only (`submit-review`, `verify`, `activate`, `suspend`, `deactivate`) and update from the API response.
7. Verify is Super-Admin only (`VerifyServiceZones`). Write actions require `ManageServiceZones`. Read-only roles get a panel without mutations.
8. States: loading, empty, error, permission-denied.

## Mapping stack

Admin previously had **no** map library. This implementation adds **MapLibre GL** with Carto Positron raster tiles (no Mapbox token). It mirrors the GeoJSON boundary contract already used by Ride Maps / service zones rather than introducing a second geometry model.

Attribution for basemap tiles and district polygons must remain visible.

## Status styling

| Status | Visual role |
|---|---|
| ACTIVE | Green fill (initial: Atwima Kwanwoma) |
| UNDER_REVIEW | Amber |
| DRAFT / LOCKED | Slate (inactive) |
| SUSPENDED | Red |

Visible polygons ≠ bookable coverage. Only `ACTIVE` verified zones are bookable.

## Key files

- `apps/cyrlo_admin/src/pages/AshantiDistrictMapPage.tsx`
- `apps/cyrlo_admin/src/features/zones/ZoneMap.tsx`
- `apps/cyrlo_admin/src/features/zones/ZoneDetailsPanel.tsx`
- `apps/cyrlo_admin/src/features/zones/zoneMapHelpers.ts`
- `apps/cyrlo_admin/src/features/zones/zoneActions.ts`
