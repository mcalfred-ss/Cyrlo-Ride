# Greater Kumasi Geographic Data Audit

**Date:** 2026-11-16  
**Mode:** READ-ONLY discovery (this report only; no code, DB, API, or production data changes)  
**Scope:** Greater Kumasi / Ashanti — **Accra out of scope** for reuse recommendations  
**Branch at discovery:** `feature/admin-phase-0` @ `49f640c`  
**Ghana/maps stash:** intact — `stash@{0}: On main: wip-ghana-maps-preserve-phase0`

---

## 1. Repositories and files inspected

### Cyrlo Ride — `h:\stuff\Cyrlo-Ride`
| Area | Paths |
| --- | --- |
| Ops polygon | `ops/zones/kokobin.geojson` |
| Seed / load | `backend/scripts/seed-ghana-pilot-hierarchy.ts`, `load-kokobin-zone.ts`, `vps-geo-*.sh` |
| Backend | `backend/src/modules/geo/**`, `service-zones/**`, `maps/**`, `matching/**` |
| Flutter extent | `apps/cyrlo_app/lib/core/mapping/greater_kumasi_extent.dart`, `ride_map_projects.dart` |
| Docs | `docs/architecture/KUMASI_MAP_SERVICE_ZONE_INTEGRATION.md`, `NATIONWIDE_GEO_ADMIN_CONTRACT.md`, `OPEN_DECISIONS.md`, `CYRLO_RIDE_MASTER_SPEC.md`, `SERVICE_ZONES_MILESTONE_4.md`, related audits |

### Cyrlo Food / Cirlo — `h:\stuff\dev\cirlo-software`
| Area | Paths |
| --- | --- |
| Ghana location corpus | `assets/location/{meta,regions,districts,towns,communities,landmarks,aliases}.json` |
| Search / geocode | `lib/features/location/**`, `lib/core/services/navigation_service.dart` |
| Dispatch zones | `server/api-dispatch/config/zones.json`, `zoneEngine.ts` |
| Admin places | `server/deploy/admin-user-map/**` |
| Docs | `docs/map/*.md`, `docs/dispatch-engine.md` |

### Cyrlo Maps — `h:\stuff\cyrlo-map-1` (API) and `h:\stuff\cyrlo-map` (package/docs)
| Area | Paths |
| --- | --- |
| API contracts | `services/cyrlo_maps_api/docs/ENDPOINTS.md`, OpenAPI, Mapbox provider |
| Flutter SDK | `packages/cyrlo_maps/**` |

No other Cyrlo-branded geo dataset repos were found under `h:\stuff` beyond Ride, Food/Cirlo, and Maps.

---

## 2. Available geographic datasets and sources

### 2.1 Ride — sourced ops polygon (only GeoJSON in Ride)

| Field | Value |
| --- | --- |
| File | `ops/zones/kokobin.geojson` |
| Type | GeoJSON Feature `Polygon` (~21 vertices) |
| Properties | `name: "Kokobin"`, `pilot: true`, note: *“Sourced 2026-11-09”* |
| Approximate bbox | lat **6.44505–6.44905**, lon **−1.36816–−1.36301** |
| Approximate centroid | **~6.446, −1.366** |
| Source quality | Marked sourced/verified for **ops zone** use; **not** labeled with district/community codes |

### 2.2 Ride — admin geo hierarchy seed (points / metadata, not polygons)

After `seed-ghana-pilot-hierarchy.ts`:

```
Ghana (GH)
 └─ Ashanti Region (ASH)
     └─ Atwima Kwanwoma District (AKW)
         └─ Community: Ahenema Kokoben (slug ahenema-kokoben)
             • verification typically UNVERIFIED in seed
             • centerLatitude / centerLongitude: null
             • boundary: null  (“do not invent”)
             └─ ServiceZone: Kokobin (slug kokobin)
                 • boundary = ops/zones/kokobin.geojson
                 • seed description: “Central Ahenema Kokoben pilot polygon”
                 • intended seed status: LOCKED / inactive until ops activation
```

**Fact:** seed **associates** the Kokobin polygon with the Ahenema Kokoben community record by `communityId` / description text.  
**Fact:** polygon coordinates do **not** fall near Ahenema Kokoben (see §4).

### 2.3 Ride — landmark points (search enrichment)

`backend/src/modules/maps/landmarks/ghana-landmarks.catalog.ts` — **8** Ashanti/Kumasi points (KNUST, Kejetia, KATH, City Mall, Adum, Ahodwo, Santasi, Tafo). Nominatim-verified notes in docs (~2026-11-11). **No Ahenema Kokoben entry.**

Also: Ghana bbox filter for rejecting foreign place hits — **not** a service zone.

### 2.4 Ride — Flutter Greater Kumasi camera extent

`GreaterKumasiExtent`: SW **(6.52, −1.78)** → NE **(6.86, −1.45)**.  
Explicitly a **map exploration** soft-clamp, Accra excluded. **Not** community or service-zone geometry.

### 2.5 Food — Open Admin Data town/district corpus

| Field | Value |
| --- | --- |
| Source | Open Admin Data — `ghana-administrative-divisions` (**CC-BY-4.0**) |
| URL | `https://github.com/open-admin-data/ghana-administrative-divisions` |
| Counts | 16 regions, 260 districts, 2070 towns, 12 communities, 24 landmarks, 31 aliases |
| Geometry | **Point centroids only** (no polygons) |
| Ashanti | 43 districts, ~388 towns in `towns.json` |

### 2.6 Food — dispatch / ops zones

`server/api-dispatch/config/zones.json`: **manual bounding boxes** (docs: “bboxes in v1; polygons later”).  
Ashanti entries observed: `kumasi_central` and `kumasi_east` only. Default region is Greater Accra-heavy. **Not** admin boundaries; **not** Ride bookable zones.

### 2.7 Maps API — no local Ghana geo JSON

Maps stores no Greater Kumasi community polygons. It proxies Mapbox Geocoding/Directions. Ghana country filter is **not** applied server-side (`country` query ignored per Maps docs). Food clients optionally pass `country=gh` themselves.

---

## 3. Verified Kumasi communities and boundaries

### 3.1 What is “verified” vs approximate

| Dataset | Verified as | Boundary type |
| --- | --- | --- |
| Food `towns.json` / districts / regions | Admin **place list + centroids** from Open Admin Data | **Points**, not polygons |
| Food `zones.json` Kumasi boxes | Food **dispatch** coverage approximations | Manual **bboxes** |
| Ride landmarks | Search POI points | Points |
| Ride `kokobin.geojson` | Ops **service-zone** polygon (sourced note) | Manual/ops polygon — **wrong place vs Ahenema** (see §4) |
| Ride community `Ahenema Kokoben` | Name/slug in hierarchy seed | **No** center, **No** boundary |
| Ride `GreaterKumasiExtent` | Product map UX box | Soft camera clamp only |

### 3.2 Example Ashanti / Kumasi localities available as **points** (Food corpus)

Suitable as a **locality catalog** for search/labels (not as Ride service zones): towns under Ashanti districts including Atwima Kwanwoma (e.g. Ahenema kokoben, Bebu, Aburaso, …), plus Kumasi Metropolitan and surrounding districts. Exact full enumeration is in `towns.json` (388 Ashanti towns) — not duplicated here.

### 3.3 Separation rule (product)

| Layer | Purpose |
| --- | --- |
| Community / town / district | Identity & labels (admin geography) |
| Service zone | Operational bookable coverage (ops-verified polygons) |

**Do not** treat Food dispatch bboxes or town centroids as Ride service-zone boundaries.  
**Do not** assume Food delivery coverage ≡ Ride booking coverage.

---

## 4. Does Ahenema Kokoben data exist?

### 4.1 Yes — as a named place (multiple sources, inconsistent points)

| Source | Name | Coordinates (quoted from files) | Geometry |
| --- | --- | --- | --- |
| Food `towns.json` | `Ahenema kokoben` | **6.626, −1.65** (`source_id: GH0218_ahenema-kokoben`) | Point |
| Food hierarchy | Ashanti → Atwima Kwanwoma → town | District centroid **6.59, −1.712** | Point |
| Food QA / nav shortcuts | Ahenema Kokoben | **6.6505, −1.6508** | Hardcoded point (not corpus) |
| Ride Flutter test | “Ahenema area” | **6.6295, −1.6615** | Test point |
| Ride DB community seed | `Ahenema Kokoben` | **null center** | Metadata only |
| Ride landmarks | — | **Absent** | — |
| External place refs (docs/web) | Ahenema Kokoben | ~**6.625, −1.648** | Not in-repo dataset |

### 4.2 Confusable names (do not merge)

| Place | Hierarchy | Coords in Food corpus |
| --- | --- | --- |
| **Ahenema kokoben** | Atwima Kwanwoma, Ashanti | 6.626, −1.65 |
| **Kokoben** (different) | Offinso Municipal, Ashanti | 7.021, −1.464 |
| **Kokobin** (Ride ops zone name) | Linked in seed to Ahenema community | Polygon ~**6.446, −1.366** |

### 4.3 Is the existing Kokobin polygon incorrectly associated with Ahenema Kokoben?

**Yes — association is incorrect relative to geography.**

| Claim | Evidence |
| --- | --- |
| Seed/description ties Kokobin zone to Ahenema | `seed-ghana-pilot-hierarchy.ts`: community `Ahenema Kokoben`; zone description *“Central Ahenema Kokoben pilot polygon”* |
| Polygon location | Bbox ~**6.446, −1.366** |
| Ahenema area | ~**6.63, −1.65** (corpus / live GPS / external refs) |
| Distance | On the order of **~30+ km** apart |
| Greater Kumasi Flutter box | Contains Ahenema area; **excludes** the Kokobin polygon bbox |

**Fact:** the only Ride GeoJSON is named Kokobin and is **not** spatially consistent with Ahenema Kokoben.  
**Assumption (ops):** the GeoJSON may be a different place named similarly, a mis-exported draw, or an early pilot draw — **not verified in this audit beyond coordinates.**

Product docs (`OPEN_DECISIONS.md`) already renamed first activation to **Kokobin** as the map place; that naming decision does not make the current polygon cover Ahenema.

---

## 5. Data quality and reuse assessment

| Asset | Reuse for Ride labels / search? | Reuse as Ride **service zone**? | Notes |
| --- | --- | --- | --- |
| Food Open Admin towns (Ashanti) | **Yes, with care** | **No** | Points only; CC-BY-4.0; good community catalog seed |
| Food Ahenema town row | **Yes** (label/search) | **No** | Prefer corpus coords over Food QA hardcodes |
| Food `communities.json` | Limited | **No** | Accra-heavy; no Ahenema |
| Food dispatch `zones.json` | Reference only | **No** | Manual bboxes; Accra-default; ≠ Ride coverage |
| Food nav GPS shortcuts | **No** (avoid) | **No** | Ride already declined copying these |
| Ride landmarks | **Yes** (search POIs) | **No** | No Ahenema |
| Ride `kokobin.geojson` | N/A | **Only after spatial re-verification** | Currently wrong place for Ahenema ops |
| Ride community record | Name/slug OK | Needs center/boundary from verified source | Do not invent |
| Ride GreaterKumasiExtent | Map UX only | **No** | Not coverage |
| Maps API reverse/search | Label enrichment | **No** | Coarse labels common; no Ghana filter in API |

---

## 6. Missing data and API capabilities

### 6.1 Missing geographic data (facts)

1. **No verified Ahenema Kokoben polygon** in any inspected repo.  
2. **No community center/boundary** on Ride’s Ahenema community row (seed leaves null).  
3. **No Greater Kumasi admin boundary GeoJSON** in Ride/Food/Maps.  
4. Food corpus has **points**, not polygons, for towns/districts.  
5. Live ops Kokobin polygon **does not cover** Ahenema GPS (separate from Flutter work).

### 6.2 Backend / Maps contracts — implemented

| Capability | Status |
| --- | --- |
| Staff geo hierarchy CRUD (`/admin/geo`) | Implemented |
| Staff service-zone CRUD + activate (`/service-zones`, `/admin/service-zones`) | Implemented |
| Point-in-polygon for **ACTIVE** zones in matching/booking | Implemented server-side |
| Auth maps proxy: geocode / reverse / places / routes | Implemented |
| Landmark merge into place search | Implemented (Ashanti set) |
| Passenger coverage signal via `POST /matching/nearby` (`inServiceArea`) | Implemented |
| Rider `GET /riders/eligibility` (zone **approval**, not PIP) | Implemented |

### 6.3 Missing API capabilities (for app/map product)

| Gap | Why it matters |
| --- | --- |
| Public/authenticated **list active zones** (id, name, optional sanitized geometry) | Apps cannot draw or enumerate coverage without staff perms |
| Public/authenticated **point-in-active-zone** (`cover` probe) | Passengers/riders rely on matching nearby side-effects |
| Public **community-from-point** | Cannot resolve Ahenema vs Kumasi/Ashanti from hierarchy |
| Maps reverse structured locality fields / `country=gh` | Coarse “Kumasi, Ashanti” labels persist |
| Verified Ahenema (or Greater Kumasi subarea) **ops polygons** loaded as ACTIVE zones | Booking remains fail-closed outside wrong/small Kokobin ring |

**Assumption:** a future public cover API should return coverage metadata without requiring clients to embed unpublished polygons — exact schema not specified here.

---

## 7. Recommended next steps

*Clear separation: **Facts** vs **Recommendations** (recommendations are not implementations).*

### Facts established by this audit
1. Ahenema Kokoben **exists** in Food’s Open Admin Data town corpus as a **point**.  
2. Ride’s only ops GeoJSON (**Kokobin**) is **spatially inconsistent** with Ahenema Kokoben and is incorrectly described/linked as that community’s pilot polygon.  
3. Community boundaries and service-zone boundaries are **different layers**; almost all “Kumasi community” data available today is **points or bboxes**, not verified admin polygons.  
4. Accra-heavy Food assets must not drive Greater Kumasi Ride coverage design.  
5. Ghana/maps stash remains intact; this pass changed only this report file.

### Recommendations (do not execute in this discovery pass)
1. **Ops:** Re-source a verified service-zone polygon for the intended pilot community (Ahenema Kokoben **or** clearly named Kokobin-at-correct-coordinates). Do **not** invent GeoJSON in app code.  
2. **Data model:** Keep community catalog (Food Open Admin points OK for labels) **separate** from ACTIVE service zones.  
3. **Optional catalog reuse:** Import Ashanti town points from Food corpus for search/aliases (CC-BY-4.0 attribution); never treat centroids as zone boundaries.  
4. **API (if product needs it):** Add authenticated passenger/rider cover/list endpoints; document contract before Flutter consumes geometry.  
5. **Maps:** Consider Ghana filtering / locality-type reverse improvements in Maps API (separate from Ride booking logic).  
6. **Do not** change matching radius, booking, payment, or token logic as part of geo cleanup.  
7. **Do not** equate Food dispatch coverage with Ride bookable coverage.

### Explicit non-actions for this audit
- No files modified except creation of this report.  
- No production DB or zone edits.  
- No guessed polygons.  
- No Accra community/zone recommendations for Ride pilot expansion.

---

## Stop

Discovery complete. Await a separate authorization before any geo data load, API design, or Flutter follow-up implementation.
