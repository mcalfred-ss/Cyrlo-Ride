# Cyrlo Ride — Phase 1C-B Final Review  
## Rider Directory + Rider Profile UI (read-only)

**Date:** 2026-11-12  
**Reviewer mode:** Read-only (no product fixes, no stage/commit/push/deploy)  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `8fbaef42070e7ad91ff98981c19fa29bb769bdfb`  
**Ghana/maps stash:** preserved (`stash@{0}: wip-ghana-maps-preserve-phase0`)

---

## Verdict

**APPROVED WITH CONDITIONS**

Functional implementation meets Phase 1C-B requirements (applicant labeling, ReviewRiders gating, GPS coordinate omission, 401/403/404, URL filter carry-over, request-id stale ignore). Conditions are test-coverage gaps only — not product blockers for the uncommitted feature itself.

---

## 1. Git baseline and diff scope

| Check | Result |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | `8fbaef42070e7ad91ff98981c19fa29bb769bdfb` |
| Working tree | Uncommitted Phase 1C-B only (admin SPA + docs) |
| Backend / Flutter / Prisma / `permissions.ts` | **Unchanged** |
| Stash | Ghana/maps stash still present |

### Diff inventory

**Modified:**  
`apps/cyrlo_admin/src/api/types.ts`, `app/router.tsx`, `auth/RequireMfaSession.test.tsx`, `config/nav.ts`, `config/nav.test.ts`

**Added:**  
`api/admin-riders.ts`, `features/riders/statusBadges.tsx`, `features/riders/statusBadges.test.ts`, `pages/RidersPage.tsx`, `pages/RidersPage.test.tsx`, `pages/RiderProfilePage.tsx`, `pages/RiderProfilePage.test.tsx`, `docs/admin/PHASE_1C_B_IMPLEMENTATION_REPORT.md`  
(+ this review doc)

---

## 2–3. Applicant labeling (no false “approved rider”)

### Implementation

| Status | Kind label | Role badge | Notes |
| --- | --- | --- | --- |
| `APPROVED` + `role=RIDER` | `Approved rider` | `RIDER` | Only path that yields “Approved rider” |
| `PENDING_REVIEW` | `Pending applicant` | role-specific | |
| `DRAFT` | `Draft applicant` | role-specific | |
| `REJECTED` | `Rejected applicant` | role-specific | |
| `APPROVED` + `role=PASSENGER` | `Rider profile` (fallback) | `Applicant (PASSENGER)` | **Not** labeled approved rider |

References:

- `directoryKindLabel` — `apps/cyrlo_admin/src/features/riders/statusBadges.tsx` **L64–81** (requires `APPROVED` **and** `RIDER`)
- `RoleBadge` — same file **L36–44** (`PASSENGER` → `Applicant (PASSENGER)`)
- Directory columns — `RidersPage.tsx` **L330–347** (account, role, verification, kind separate)
- Profile applicant callout — `RiderProfilePage.tsx` **L164–172**
- Directory copy — `RidersPage.tsx` **L140–143** (“including applicants still marked PASSENGER”)

Account status is shown independently via `AccountStatusBadge` (`statusBadges.tsx` **L31–34**; table `RidersPage.tsx` **L330–332**).

### Review evidence

- Unit matrix in `statusBadges.test.ts` covers DRAFT / PENDING_REVIEW / REJECTED (PASSENGER) and APPROVED+RIDER.
- Ephemeral review check: `APPROVED`+`PASSENGER` → `"Rider profile"` (not `"Approved rider"`). Temp test removed; not left in tree.

### Finding F1 — Low

**Kind fallback for `APPROVED` + `PASSENGER` is generic (`Rider profile`).**  
Still safe (does not claim approved rider); Role + Verification badges remain authoritative. Optional clearer label later (e.g. “Approved profile / PASSENGER role”).

---

## 4–5. Request-ID guard / stale responses

### Implementation

- `RidersPage.tsx` **L73, L81–91**: increment `requestId`, ignore success/error when `id !== requestId.current`
- `RiderProfilePage.tsx` **L41, L50–57**: same pattern
- Filter/search/pagination controls set `disabled={busy}` while `status === 'loading'` (`RidersPage.tsx` **L133, L152–226, L286, L368–377**), which largely prevents *UI-driven* overlapping fetches

### Review evidence (out-of-order)

Ephemeral URL-navigation race (created, run, **deleted** — not committed):

1. Load `/riders` (empty, resolves)
2. Navigate to `?verificationStatus=APPROVED` (hanging response)
3. Navigate to `?verificationStatus=DRAFT` (fast response → “Fast Filter Hit”)
4. Resolve slow APPROVED response afterward

**Result:** UI kept “Fast Filter Hit”; “Slow Result” never appeared. **2/2 ephemeral checks passed.**

Committed suite does **not** include this race case.

### Finding F2 — Low (condition)

**No committed automated test for out-of-order directory responses.**  
Guard is present and was verified manually during this review; should be added to `RidersPage.test.tsx` before treating coverage as complete.

---

## 6. URL query survival (directory → profile → back)

### Implementation

- Directory → profile appends current `searchParams` — `RidersPage.tsx` **L321–322**
- Profile builds `directoryHref` from `useSearchParams()` — `RiderProfilePage.tsx` **L39–43, L87–88, L106**
- Filters/pagination owned by URL — `queryFromParams` / `patchParams` — `RidersPage.tsx` **L44–55, L118–126**

### Tests

- `RiderProfilePage.test.tsx` **L177–186** navigates back from `/riders/:id?q=Kofi` and asserts directory screen, **but does not assert** the restored `?q=Kofi` (or other filters) on the destination URL.

### Finding F3 — Low (condition)

**Back-navigation test should assert query-string preservation** (e.g. location search or re-fetched list URL containing `q=Kofi`). Implementation is correct by inspection.

---

## 7. GPS coordinates never rendered

### Implementation

Typed `gps` omits lat/lng (`types.ts` AdminRiderProfile). Render path only uses `sharingEnabled`, `fresh`, `maxAgeMs`, `recordedAt`, `receivedAt`, `snapshot` — `RiderProfilePage.tsx` **L240–269**. Privacy note + `exactCoordinatesIncluded` flag.

### Tests

`RiderProfilePage.test.tsx` **L130–151**: hostile payload with `latitude`/`longitude`/`lat`/`lng` — asserts values and labels absent from DOM.

**Pass.**

---

## 8. 401 / 403 / 404

| Case | Directory | Profile |
| --- | --- | --- |
| 401 | Navigate `/session-expired` — `RidersPage.tsx` **L93–95**; test **L203–210** | Same — `RiderProfilePage.tsx` **L59–61**; test **L160–167** |
| 403 | Error, no table — **L97–102, L238–258**; test **L212–217** | Error, no profile/tokens — **L63–68, L119–142**; test **L169–175** |
| 404 | N/A (list) | Dedicated message, no fabricated profile — **L123–129**; test **L153–158** |

**Pass.** Client privileged-401 still clears session via existing `apiRequest` handler.

---

## 9. Nested `ReviewRiders` protection

| Layer | Evidence |
| --- | --- |
| Nav item | `nav.ts` **L33–38** — `Permission.ReviewRiders` only |
| Nested paths | `canAccessPath` parent-prefix — `nav.ts` **L100–112** |
| Gate | `RequireMfaSession.tsx` **L25–27** |
| Tests | `nav.test.ts` **L28–36**; `RequireMfaSession.test.tsx` **L77–116** (Ops allow, Support deny) |
| Routes | `router.tsx` **L35–36** |

Support/Finance not broadened; `permissions.ts` untouched.

**Pass.**

---

## 10. Backend / Flutter / permissions / schema

No diffs under `backend/`, Flutter/mobile trees, Prisma, or `apps/cyrlo_admin/src/config/permissions.ts`.

**Pass.**

---

## Findings summary

| ID | Severity | Topic | Disposition |
| --- | --- | --- | --- |
| F1 | Low | Soft kind label for `APPROVED`+`PASSENGER` | Optional UX polish |
| F2 | Low | No committed out-of-order request-id test | **Condition** — add before calling test plan complete |
| F3 | Low | Back nav test omits query assertion | **Condition** — strengthen assertion |

No High/Medium product defects found in this review.

---

## Command evidence

From `apps/cyrlo_admin` (committed suite + tooling):

| Command | Result |
| --- | --- |
| `npm test` | **14 files / 57 tests passed** |
| `npm run typecheck` | Pass |
| `npm run build` | Pass (`vite` production build OK) |

Ephemeral review-only race file: executed then **deleted**; working tree does not retain it.

---

## Conditions to clear for full APPROVED

1. Add a committed directory test that proves a slower prior response cannot overwrite newer filter/search/pagination results (request-id).
2. Extend the profile “back to directory” test to assert URL query params survive the round-trip.

Optional (non-blocking): tighten `directoryKindLabel` for `APPROVED`+`PASSENGER`.

---

## Stop

Review complete. No fixes applied. No staging, commit, push, or deploy. Ghana/maps stash preserved.
