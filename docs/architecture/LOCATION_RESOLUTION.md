# Geographic Location Resolution

**Date:** 2026-11-16  
**Scope:** Greater Kumasi / Ashanti Region (Accra out of scope)  
**Endpoint:** `POST /api/v1/maps/location/resolve` (JWT + active account)

---

## Purpose

Translate GPS coordinates into a structured, human-readable location without inventing towns, moving pickup pins, or treating Ride service zones as community boundaries.

---

## Data sources

| Layer | Source | Geometry | Role |
| --- | --- | --- | --- |
| Provider reverse | Existing Cyrlo Maps `POST /v1/geocode/reverse` (Mapbox) | Label + coords only | Primary structured-label input (flat `place_name`) |
| Town / district catalogue | Open Admin Data Ashanti subset (CC-BY-4.0) | **Point centroids** | Conservative locality/district fill when provider is coarse |
| Verified landmarks | `ghana-landmarks.catalog.ts` | Points | Nearby hospitals, markets, malls, junctions, etc. |
| Open Admin landmarks | Ashanti rows from Food corpus | Points | Extra Ashanti POIs (deduped against verified set) |
| Admin polygons | Not used | — | No reliable town polygons in-repo |
| Ride service zones | Not used | — | Operational coverage only — never community identity |

**Attribution (catalogue):** Open Admin Data — [ghana-administrative-divisions](https://github.com/open-admin-data/ghana-administrative-divisions) (CC-BY-4.0). Ashanti-only import; Accra excluded.

---

## Resolution priority

1. Parse the provider reverse label into locality / city / district / region / country when present.
2. If locality is missing or coarse (`Kumasi` / `Ashanti` / `Ghana` only), apply **conservative** Ashanti town centroid matching.
3. Fill district / region from a successful catalogue match when the provider omitted them.
4. Attach nearby landmarks (ranked, capped) — never invent POIs.

Missing components stay `null`. Coordinates in the response always echo the request.

---

## Confidence rules (catalogue)

Town catalogue rows are **centroids**, not boundaries.

| Confidence | Rule (simplified) | `approximate` |
| --- | --- | --- |
| `high` | Nearest town ≤ 400 m and uniquely nearer than the second | `false` |
| `medium` | Nearest ≤ 800 m with separation vs second nearest | usually `true` if > 400 m |
| `approximate` | Nearest ≤ 1.8 km with stronger separation | `true` |
| no match | Ambiguous / too far | locality not asserted from catalogue |

A **specific** provider locality is never silently replaced by the nearest town centroid.

---

## Nearby landmarks

- Radius default: 8 km; limit default: 5 (request `landmarkLimit` 0–10).
- Rank: category relevance (hospital → school → market → mall → junction → landmark → community) then proximity.
- Deduped by normalized name / near coordinates.
- Each hit: `name`, `category`, `latitude`, `longitude`, `distanceMeters`, `source`.

---

## API contract (summary)

**Request**

```json
{ "latitude": 6.626, "longitude": -1.65, "landmarkLimit": 5 }
```

**Response `data`**

```json
{
  "location": {
    "formattedAddress": "Ahenema Kokoben, Atwima Kwanwoma, Ashanti Region, Ghana",
    "locality": "Ahenema Kokoben",
    "neighbourhood": null,
    "city": null,
    "district": "Atwima Kwanwoma",
    "region": "Ashanti Region",
    "country": "Ghana",
    "latitude": 6.626,
    "longitude": -1.65,
    "source": "provider+catalogue",
    "confidence": "high",
    "approximate": false,
    "providerLabel": "Kumasi, Ashanti Region, Ghana",
    "catalogueTownId": "gh-town-ahenema-kokoben-atwima-kwanwoma",
    "catalogueTownDistanceMeters": 12
  },
  "nearbyLandmarks": []
}
```

Existing `POST /maps/geocode/reverse` remains unchanged for clients that only need the flat provider label.

---

## Limitations

- Maps API still returns a single flat label (no Mapbox `context` passthrough).
- Catalogue cannot prove a point is “inside” a town — only proximity to a centroid.
- No Accra / Greater Accra catalogue rows in this import.
- Provider POI “nearby search” is not available; landmarks come from verified + Open Admin catalogues.
- Service-zone PIP / matching / booking / payments are untouched.

---

## Flutter

`RideMapsPlaceLookupGateway.resolve` calls `/maps/location/resolve`. Trip pin / trip plan use the structured `formattedAddress` and optional nearby landmark summary. Pickup `GeoPoint` is never replaced by catalogue coordinates.
