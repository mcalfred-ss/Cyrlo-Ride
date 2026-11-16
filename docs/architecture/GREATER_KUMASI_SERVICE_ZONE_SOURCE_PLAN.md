# Greater Kumasi Service-Zone Source Plan

**Date:** 2026-11-16  
**Mode:** READ-ONLY investigation (this report only)  
**Depends on:** `docs/architecture/GREATER_KUMASI_GEOGRAPHIC_DATA_AUDIT.md`  
**Scope:** Greater Kumasi / Ashanti, starting with Ahenema Kokoben  
**Accra:** Explicitly out of scope  
**Branch:** `feature/admin-phase-0` @ `49f640c`  
**Ghana/maps stash:** intact — `stash@{0}: On main: wip-ghana-maps-preserve-phase0`

**Legend**
- **Fact** — verified in repo, docs, or production read  
- **External finding** — from public geospatial sources / licenses (not yet imported)  
- **Recommendation** — proposed next action (not executed)

---

## 1. Existing Kokobin zone provenance and production impact

### 1.1 Provenance (Fact)

| Item | Evidence |
| --- | --- |
| File | `ops/zones/kokobin.geojson` |
| First commit | `9c43ef8` (2026-11-09) — *“Add staging deploy scripts… Kokobin zone loader…”* |
| Properties | `name: "Kokobin"`, `pilot: true`, note: *“First Cyrlo Ride activation zone. Sourced 2026-11-09.”* |
| Loader | `backend/scripts/load-kokobin-zone.ts` — reads GeoJSON, validates/normalizes boundary; activates only if `LOAD_ZONE_ACTIVATE=1` |
| Hierarchy seed | `backend/scripts/seed-ghana-pilot-hierarchy.ts` — creates community **Ahenema Kokoben**, links zone **Kokobin**, describes it as *“Central Ahenema Kokoben pilot polygon”*, seed intent **LOCKED / inactive** |
| Product decision | `OPEN_DECISIONS.md` — first activation place renamed to **Kokobin**; earlier planning said Ahenema Kokoben |
| Geometry | Tiny polygon bbox ~ lat **6.445–6.449**, lon **−1.368–−1.363** (~centroid **6.446, −1.366**) |

**Fact:** There is **no** in-repo provenance of who surveyed the polygon, which basemap was used, or a cadastral/admin source ID beyond the free-text “Sourced 2026-11-09.”

**Fact:** Spatially, this polygon is **not** near Ahenema Kokoben (~**6.63, −1.65**). Association to that community is by seed/description only (see prior audit).

### 1.2 Production state (Fact — read-only query 2026-11-16)

| Record | Production value |
| --- | --- |
| Service zone | **Kokobin** (`slug: kokobin`, id `55845ca2-…`) |
| Status | **`ACTIVE`**, `isActive: true` |
| Activated at | `2026-11-12T08:20:50.157Z` |
| Boundary verification | `VERIFIED` |
| Description (still) | *“Central Ahenema Kokoben pilot polygon… Locked until Ops activation.”* (stale vs ACTIVE) |
| Bbox | Matches repo GeoJSON (~6.445–6.449 / −1.368–−1.363) |
| Linked community | **Ahenema Kokoben** (`ahenema-kokoben`) |
| Community | `ACTIVE` + `VERIFIED`, **no center**, **no boundary** |

### 1.3 Operational dependency (Fact)

| Dependency | Count / note |
| --- | --- |
| Bookings with `serviceZoneId = Kokobin` | **1** (and `bookingsWithZone` total = 1) |
| Rider zone approvals on Kokobin | **3** |
| Rider zone decisions | **0** |
| Other service zones | **None** in production |

**Impact assessment (Fact + Recommendation framing)**

- Production **does** have a live ACTIVE zone that drives booking/matching PIP.  
- Dependency footprint is **small but real** (1 booking, 3 approvals).  
- Replacing or moving the polygon without a controlled ops process would change which pickups are bookable and which riders are “approved for the active zone.”  
- This investigation **did not** activate, deactivate, rename, or replace the zone.

**Recommendation:** Treat Kokobin as a **mis-sited ACTIVE pilot zone**. Plan a deliberate replace/add workflow (new verified DRAFT → verify → activate; then suspend/lock old) rather than silent overwrite. Preserve historical booking `serviceZoneId` integrity.

---

## 2. Credible boundary sources and evidence

### 2.1 What exists for Ahenema Kokoben today

| Source | Type | Evidence | Suitable as Ride **service zone**? |
| --- | --- | --- | --- |
| Open Admin Data town `GH0218_ahenema-kokoben` | **Point** (6.626, −1.65) | Food `towns.json` / openadmindata.org | **No** (identity/label only) |
| Open Admin Data district Atwima Kwanwoma `GH0218` | **Point** centroid (6.59, −1.712) | Same corpus | **No** as community ops zone; maybe admin context |
| Ride community row | Metadata only | Production: no center/boundary | Incomplete |
| Ride `kokobin.geojson` | Ops polygon | Wrong place vs Ahenema | **Not** for Ahenema coverage |
| Food QA hardcodes (6.6505, −1.6508) | Point shortcuts | Cirlo software | **Do not** promote to canonical |

### 2.2 Authoritative / credible **polygon** sources (External finding)

| Source | Level available for Ghana | License | Town/community polygons? |
| --- | --- | --- | --- |
| **geoBoundaries** (via geoboundaries.org / HDX) | ADM0, ADM1 (region), **ADM2 (district)** | **CC BY 4.0** (attribution required) | **No ADM3/town** polygons in standard Ghana set (~260 ADM2 features) |
| **GADM** | Admin levels by country | Free for academic/non-commercial; **commercial redistribution restricted** without permission | District-scale common; not a free commercial town boundary source |
| **OpenStreetMap / Geofabrik Ghana extract** | Variable | **ODbL** (share-alike / attribution) | May have place nodes; **town admin polygons are not guaranteed** for Ahenema Kokoben |
| **Ghana Statistical Service / Survey / District Assembly maps** | Official admin / planning | Agency-specific | Best authority for district/electoral areas; **not confirmed in-repo**; acquisition requires ops outreach |
| **HOT / populated-places polygon products** (commercial listings exist) | Place polygons | Often ODbL / vendor terms | **External finding only** — not audited file-by-file here; would need license + geometry QA before Ride use |

### 2.3 Critical external finding

**No inspected open dataset provides a verified Ahenema Kokoben town/community polygon.**

- Open Admin Data: **points**.  
- geoBoundaries Ghana: **district (ADM2)** polygons at best — Atwima Kwanwoma as a whole, **not** Ahenema Kokoben alone.  
- Using the full Atwima Kwanwoma district as the first Ride service zone would be an **ops product decision**, not “Ahenema Kokoben geography.”

**Recommendation:** Do **not** invent or buffer centroids. Prefer:

1. Ops-drawn / field-verified **service polygon** for the intended pilot neighborhood, stored as a Ride `ServiceZone`, **or**  
2. Official district ADM2 (geoBoundaries CC BY) only if product explicitly accepts **district-scale** coverage (usually too large for v1).

---

## 3. Recommended Ahenema Kokoben geography source

### 3.1 Layered recommendation (Recommendation)

| Layer | Recommended source | Why |
| --- | --- | --- |
| **Town identity + coordinates** | Open Admin Data / Food corpus `GH0218_ahenema-kokoben` (**6.626, −1.65**), CC BY 4.0 | Stable place id + hierarchy; already used by Food |
| **Administrative boundary** | geoBoundaries **ADM2 Atwima Kwanwoma** (CC BY 4.0) **if** a district boundary is needed for parent context — **not** as the Ahenema service zone by default | Real district polygon; too coarse for “town” ops |
| **Operational Ride service zone** | **New ops-verified GeoJSON** for the actual pilot coverage around Ahenema (field/basemap verified), imported as DRAFT → verified → ACTIVE | Matches Ride model; avoids wrong Kokobin ring and avoids fake buffers |

### 3.2 What not to use for Ahenema ops coverage (Recommendation)

- Current `ops/zones/kokobin.geojson` (wrong location).  
- Circular buffers around town centroids.  
- Food dispatch Kumasi bboxes.  
- Food nav hardcodes.  
- Accra assets.  
- GADM for commercial redistribution without license clearance.

---

## 4. Greater Kumasi data acquisition strategy

### Phase A — Catalog (safe now)
1. Import / sync Ashanti **town points** from Open Admin Data (Food corpus already mirrors this).  
2. Attach `source_id`, attribution, and center coordinates to Ride `Community` rows.  
3. Keep boundaries null until a real polygon exists.

### Phase B — Admin context (optional)
1. Download geoBoundaries GHA **ADM1 Ashanti** + **ADM2** districts (CC BY 4.0 + citation).  
2. Store as **administrative** geometry on Region/District (or separate admin-boundary table) — **not** auto-activated as service zones.  
3. Filter to Greater Kumasi–relevant districts only (Atwima Kwanwoma, Kumasi Metro, and adjacent districts chosen by ops). **No Accra.**

### Phase C — Operational zones (pilot-first)
1. Ops defines first bookable polygon for **Ahenema Kokoben pilot** (or clearly named subarea) on verified basemap.  
2. Import via existing zone lifecycle: DRAFT → UNDER_REVIEW → VERIFIED → ACTIVE.  
3. Link to community `ahenema-kokoben` after community center is set from Open Admin Data.  
4. Only then consider suspending/locking the mis-sited Kokobin ACTIVE zone (separate authorized ops change).

### Phase D — Expansion
Add Greater Kumasi subareas **one ACTIVE zone at a time** (existing product rule), each with its own verified polygon — never district-wide activation by accident.

---

## 5. Proposed data model and import/verification workflow

### 5.1 Keep three concepts separate (Recommendation)

| Concept | Storage | Geometry | Activates booking? |
| --- | --- | --- | --- |
| Town/community **identity** | `Community` (+ optional external `source_id`) | Optional **center point** | No |
| **Administrative** boundary | Region/District (or `AdminBoundary`) | Official ADM polygon | No |
| **Operational** service zone | `ServiceZone` | Ops-verified polygon | **Yes** when `ACTIVE` |

### 5.2 Import / verification workflow (Recommendation)

```
1. Community catalog sync (points + names + attribution)
2. Optional admin ADM1/ADM2 import (geoBoundaries) → parents only
3. Ops supplies service-zone GeoJSON for intended pilot area
4. Admin create zone DRAFT (existing API) under correct communityId
5. Super Admin verify boundary (VerifyServiceZones)
6. Activate only if community verified + parents active + boundary verified
7. Rider approvals against the NEW zone
8. Separately plan decommission of mis-sited Kokobin ACTIVE zone
```

**Rules already in product (Fact):** imports must not invent polygons; zone activation requires verified boundary; booking uses ACTIVE PIP; do not change matching radius/booking/payment/token in this workstream.

---

## 6. Proposed coverage API contract (minimum)

Staff zone list already exists but is **permission-gated**. Flutter currently uses `POST /matching/nearby` `inServiceArea` as a side channel.

### 6.1 Minimum authenticated public contract (Recommendation — not implemented)

Base: `/api/v1` (passenger/rider JWT; **not** staff-only).

#### A. Point cover probe (highest priority)

`POST /coverage/pickup`

Request:
```json
{
  "latitude": 6.6295,
  "longitude": -1.6615
}
```

Response:
```json
{
  "inServiceArea": true,
  "zone": {
    "id": "uuid",
    "name": "Ahenema Kokoben Pilot",
    "slug": "ahenema-kokoben-pilot"
  }
}
```

Rules:
- Source of truth = existing ACTIVE zone PIP (same as booking/matching).  
- If multiple ACTIVE zones contain the point, reuse current overlap rule (smallest bbox, then oldest).  
- Do **not** require returning full GeoJSON to clients for v1.

#### B. Optional active zone directory (no geometry)

`GET /coverage/zones?active=true`

Returns id, name, slug, communityName — **no polygons** unless a later authenticated “map overlay” permission is designed.

#### C. Explicit non-goals for v1
- No public write.  
- No Accra zones.  
- No client-side polygon shipping required for cover decisions.  
- No change to matching radius or fee logic.

---

## 7. Risks, dependencies, and implementation order

### Risks (Fact / Recommendation)

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Mis-sited ACTIVE Kokobin blocks real Ahenema users | High | New verified zone + controlled cutover |
| Treating ADM2 district as “town” coverage | High | Keep admin vs ops layers separate |
| Inventing buffers / guessing polygons | High | Forbidden; ops-verified only |
| Overwriting zone in place breaks booking history | Medium | New zone id; preserve old rows |
| License mistakes (GADM commercial; ODbL share-alike) | Medium | Prefer CC BY geoBoundaries for admin; counsel on OSM/ODbL if used |
| Coarse reverse-geocode labels remain | Medium | Separate Maps locality work; not solved by zone polygon alone |
| Rider approvals tied to wrong zone | Medium | Re-approve riders on new zone before cutover |

### Dependencies
1. Ops decision: pilot polygon for Ahenema (or accept district-scale — unlikely).  
2. Community center update from Open Admin Data point.  
3. Admin SPA/API deploy alignment (separate issue) for zone management UX.  
4. Optional coverage API before Flutter can stop inferring coverage only via nearby.

### Suggested implementation order (Recommendation)
1. **Document + freeze** current Kokobin as known-bad siting (this report).  
2. Set community **center** from Open Admin Data (catalog only).  
3. Acquire/verify **new** Ahenema ops GeoJSON (human ops).  
4. Import as **new** DRAFT zone → verify → activate.  
5. Migrate rider approvals; smoke-test booking PIP at real Ahenema GPS.  
6. Suspend/lock old Kokobin zone (authorized ops change).  
7. Add `POST /coverage/pickup` (+ optional zone list).  
8. Expand Greater Kumasi zone-by-zone using same workflow.  
9. Optionally import geoBoundaries ADM2 for admin map context only.

---

## 8. Summary

| Question | Answer |
| --- | --- |
| Where did Kokobin GeoJSON come from? | Added 2026-11-09 in commit `9c43ef8`; note says “Sourced”; **no deeper survey metadata** in repo |
| Production impact? | **ACTIVE** zone; **1** booking, **3** rider approvals; only zone in DB |
| Wrong association? | **Yes** — linked/described as Ahenema but geometry ~30+ km away |
| Credible Ahenema **boundary** in open data? | **Not found** at town level; district ADM2 exists (geoBoundaries CC BY) |
| Safest path? | Open Admin Data for **identity/point**; ops-verified polygon for **service zone**; keep admin ADM polygons separate; add minimal cover API |

---

## Stop

Investigation complete. No zones activated/deactivated/replaced; no polygons generated; Ghana/maps stash untouched aside from adding this report. Await separate authorization before any data load or API implementation.
