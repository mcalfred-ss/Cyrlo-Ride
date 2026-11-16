# Ashanti District Geographic Data

## Sources

### Identity (catalogue)

- **Open Admin Data Ashanti** catalogue already vendored at  
  `backend/src/modules/maps/catalogue/data/ashanti-open-admin.json`
- 43 districts with stable ids (`gh-dist-…`), names, aliases, and centroids.
- Towns/communities remain points under districts; they are **not** zone polygons.

### Geometry (ADM2)

| Field | Value |
|---|---|
| Dataset | geoBoundaries `gbOpen` Ghana ADM2 |
| Boundary ID | `GHA-ADM2-2480657` |
| Year represented | 2019 |
| Build date | Dec 12, 2023 |
| Release commit | `9469f09` |
| License | Creative Commons Attribution 4.0 International (**CC BY 4.0**) |
| Source | USAID Ghana HPNO, Ghana Statistical Service |
| Full GeoJSON | `ops/geo/ashanti/geoBoundaries-GHA-ADM2.geojson` |
| Simplified GeoJSON | `ops/geo/ashanti/geoBoundaries-GHA-ADM2_simplified.geojson` |
| API metadata | `ops/geo/ashanti/SOURCE.json` |
| Reconciled Ashanti FC | `ops/geo/ashanti/ashanti-districts-adm2.geojson` |
| Reconciliation report | `ops/geo/ashanti/ashanti-districts-reconciliation.json` |

Rebuild filter:

```bash
node ops/geo/ashanti/build-ashanti-adm2.mjs
```

## Reconciliation method

1. Load all 43 Open Admin Ashanti districts.
2. Match each to a geoBoundaries ADM2 feature by normalized name / aliases, then catalogue centroid PIP.
3. Require 43/43 unique `shapeID` matches (no duplicates).
4. Reject Accra and non-Ashanti ADM2 features (they remain only in the national download, not in the Ashanti FC).
5. Validate CRS as WGS84 / CRS84 GeoJSON; run `validateAndNormalizeBoundary` on every feature.

## Vertex budget

Backend `MAX_BOUNDARY_VERTICES = 5000`.

| District | Full vertices | Stored variant |
|---|---:|---|
| Atwima Mponua | 11113 | **simplified** (651) |
| Sekyere Afram Plains North | 8314 | **simplified** (856) |
| All other Ashanti districts | ≤5000 | **full** ADM2 |

Simplified geometries come from the official geoBoundaries simplified release for the same `shapeID` — not hand-drawn.

## Attribution requirement

Any public or Admin display of these polygons must retain CC BY 4.0 attribution to geoBoundaries / USAID Ghana HPNO / Ghana Statistical Service. Zone rows store source + attribution + dataset version + `shapeID`.

## Explicit non-sources

Do **not** use as district polygons:

- Town centroids
- Food dispatch bounding boxes
- Greater Kumasi camera extent
- Invented / hand-approximated boundaries
- Accra or other regional assets
