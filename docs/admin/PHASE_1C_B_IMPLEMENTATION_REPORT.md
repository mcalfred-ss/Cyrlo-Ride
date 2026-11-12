# Cyrlo Ride — Phase 1C-B Implementation Report  
## Admin Rider Directory + Rider Profile UI

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Baseline HEAD:** `8fbaef42070e7ad91ff98981c19fa29bb769bdfb`  
**Mode:** Implementation complete locally — **no commit / push / deploy**

---

## 1. Scope

Built the Rider Directory and Rider Profile screens against Phase 1C-A backend APIs:

| Endpoint | UI |
| --- | --- |
| `GET /api/v1/admin/riders` | Rider Directory (`/riders`) |
| `GET /api/v1/admin/riders/:riderId` | Rider Profile (`/riders/:riderId`) |

**Out of scope (preserved):** backend APIs, permissions, schema, Flutter, Phase 1C-C review actions, Ghana/maps stash, staging/production.

---

## 2. Files changed

### Added

| File | Purpose |
| --- | --- |
| `apps/cyrlo_admin/src/api/admin-riders.ts` | Typed `fetchAdminRiders` / `fetchAdminRider` |
| `apps/cyrlo_admin/src/features/riders/statusBadges.tsx` | Account / role / verification / availability badges + directory kind labels |
| `apps/cyrlo_admin/src/features/riders/statusBadges.test.ts` | Applicant vs approved labeling |
| `apps/cyrlo_admin/src/pages/RidersPage.tsx` | Directory UI |
| `apps/cyrlo_admin/src/pages/RidersPage.test.tsx` | Directory tests |
| `apps/cyrlo_admin/src/pages/RiderProfilePage.tsx` | Profile UI |
| `apps/cyrlo_admin/src/pages/RiderProfilePage.test.tsx` | Profile tests |
| `docs/admin/PHASE_1C_B_IMPLEMENTATION_REPORT.md` | This report |

### Modified

| File | Change |
| --- | --- |
| `apps/cyrlo_admin/src/api/types.ts` | Rider list/profile/query types matching 1C-A contracts |
| `apps/cyrlo_admin/src/app/router.tsx` | Replace riders placeholder; add `/riders/:riderId` |
| `apps/cyrlo_admin/src/config/nav.ts` | Nested path access inherits parent nav permission (`/riders/:id`) |
| `apps/cyrlo_admin/src/config/nav.test.ts` | Nested ReviewRiders coverage |
| `apps/cyrlo_admin/src/auth/RequireMfaSession.test.tsx` | Ops allow / Support deny for profile routes |

**Backend / Flutter / migrations:** none.

---

## 3. API contracts (client)

Shared `apiRequest` client; paths relative to `VITE_API_BASE_URL` (`…/api/v1`).

### List query

| Param | Notes |
| --- | --- |
| `page`, `pageSize` | Defaults 1 / 20; UI offers 10/20/50/100 |
| `q` | Optional search (name / phone / UUID) |
| `status` | `ACTIVE` \| `SUSPENDED` \| `DELETED` |
| `verificationStatus` | `DRAFT` \| `PENDING_REVIEW` \| `APPROVED` \| `REJECTED` |
| `availability` | `OFFLINE` \| `AVAILABLE` \| `BUSY` |

### List response (typed)

`{ items[], pagination{ page, pageSize, total, hasNextPage }, semantics }`

### Profile response (typed)

Identity, `profile` (verification + licence + notes), `vehicles[]`, `gps` snapshot (no lat/lng), `tokens.balance` + note, `privacy`, `semantics`.

No mock directory/profile data in production UI paths.

---

## 4. UI functionality

### Directory

- Search, account / verification / availability filters, page + pageSize.
- Filters and pagination synced to URL search params (survives profile round-trip).
- Result count from `pagination.total`.
- Loading / empty / error + Retry.
- Stale responses ignored via request-id guard.
- Columns: name, phone, account status, role, verification, availability, registration date, **kind** (Approved rider vs applicant states).
- Applicants with `role=PASSENGER` labeled **Applicant (PASSENGER)** / pending|draft|rejected applicant — never presented as approved solely by appearing in the list.

### Profile

- Breadcrumb + **Back to directory** (preserves directory query string).
- Sections: Identity, Verification (incl. notes from API), Vehicles, **Availability** (separate), **GPS snapshot** (separate), Tokens.
- GPS labeled as database snapshot / not live tracking; freshness + recorded/received timestamps; sharing enabled; `snapshot=true`.
- Exact coordinates never rendered (even if a hostile payload included lat/lng keys).
- Token balance shown as snapshot with API note; no invented ledger or eligibility rules.
- PASSENGER role callout when applicable.

---

## 5. Permissions / role behavior

| Role | Nav “Riders” | `/riders` | `/riders/:id` |
| --- | --- | --- | --- |
| `SUPER_ADMIN` | Yes | Yes | Yes |
| `OPERATIONS_ADMIN` | Yes | Yes | Yes |
| `SUPPORT_ADMIN` | No | Forbidden | Forbidden |
| `FINANCE_ADMIN` | No | Forbidden | Forbidden |

Gate: existing `ReviewRiders` via `NAV_ITEMS` + `canAccessPath` parent-prefix inheritance. Backend remains authoritative (403 UI shows denial, no fabricated rows/profile).

---

## 6. Error handling

| Status | Behavior |
| --- | --- |
| 401 (privileged) | Existing client clears session; page navigates to `/session-expired` |
| 403 | Error banner; no table/profile content |
| 404 (profile) | “Rider not found” messaging; no retry inventing data |
| Network / other | Error banner + Retry |

---

## 7. Test results

Commands (local, `apps/cyrlo_admin`):

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `npm test` (full) | **14 files / 57 tests passed** |

Coverage includes:

- Directory load, search/filters, pagination, empty state
- Applicant vs approved presentation
- Profile load, missing rider (404), 401, 403
- GPS snapshot labels; coordinates never rendered
- Role-based nested route protection (Ops allow, Support deny)
- `canAccessPath` nested `/riders/:id`

---

## 8. Remaining gaps (not Phase 1C-B)

- Phase **1C-C** review / approve / reject actions
- Live GPS map / privileged coordinate viewer
- Token ledger deep-link UI (Finance)
- Document image preview
- Backend changes of any kind

---

## 9. Safety checklist

| Check | Status |
| --- | --- |
| Branch `feature/admin-phase-0` | Yes |
| Baseline HEAD `8fbaef4…` | Yes at start of work |
| Ghana/maps stash preserved | `stash@{0}: wip-ghana-maps-preserve-phase0` |
| No Flutter changes | Yes |
| No backend / schema / permission map edits | Yes |
| No commit / push / deploy / staging | Yes |
| Phase 1C-C not started | Yes |
