# Cyrlo Ride — Phase 1C-C Integrated Final Review

**Date:** 2026-11-12  
**Mode:** Read-only (no fixes, no stage/commit/push/deploy)  
**Branch:** `feature/admin-phase-0`  
**Baseline HEAD:** `c306fc31c4c932624ac8dbe00755d78d624e5df5` (`c306fc3`)  
**Working tree:** Uncommitted Phase 1C-C work only  
**Ghana/maps stash:** preserved (`stash@{0}: wip-ghana-maps-preserve-phase0`)

---

## Verdict

**APPROVED WITH CONDITIONS**

C1 API clients match live backend contracts; vehicle-review enforcement and `approveApplicationAtomic` behave as specified; permissions/MFA/audit gates unchanged; verification suites pass. One low-severity documentation drift remains in the FE client comment (still describes pre-enforcement auto-approve). Clear that before or at commit; then proceed to C2.

---

## 1. Diff scope

### Modified
- `apps/cyrlo_admin/src/api/admin-riders.ts`
- `apps/cyrlo_admin/src/api/types.ts`
- `backend/src/modules/riders/module.service.ts`
- `backend/src/modules/riders/module.repository.ts`
- `backend/src/modules/riders/memory-riders-repository.ts`
- `backend/src/modules/riders/module.test.ts`

### Added
- `apps/cyrlo_admin/src/api/admin-users.ts`
- `apps/cyrlo_admin/src/api/admin-riders.mutations.test.ts`
- `apps/cyrlo_admin/src/api/admin-users.test.ts`
- `backend/src/modules/riders/application-review.test.ts`
- `backend/src/modules/riders/application-review.db.test.ts`
- `docs/admin/PHASE_1C_C_DISCOVERY_REPORT.md`
- `docs/admin/PHASE_1C_C1_IMPLEMENTATION_REPORT.md`
- `docs/admin/PHASE_1C_C_VEHICLE_ENFORCEMENT_REPORT.md`

### Not in diff (good)
- No Flutter, permission matrix, Prisma migrations/schema, admin SPA pages/UI, staging config.

---

## 2. C1 API clients vs backend

| Client | Backend route | Schema / response | Match |
| --- | --- | --- | --- |
| `fetchPendingApplications` | `GET /admin/riders/applications` | `listPendingForOps` fields | Yes |
| `fetchRiderApplication` | `GET /admin/riders/applications/:riderId` | `getApplicationForOps` (incl. `ghanaCardNumber: null`, history) | Yes |
| `reviewRiderApplication` | `POST .../applications/:riderId/review` | riders `reviewRiderSchema` (`decision`, optional `reason`) | Yes |
| `reviewRiderVehicle` | `POST .../vehicles/:vehicleId/review` | same body; `publicVehicleView` result | Yes |
| `suspendUser` / `reinstateUser` | `POST /admin/users/suspend\|reinstate` | `{ userId, reason }` + documented results | Yes |

Uses shared `apiRequest`. Does **not** use stale admin-module `reviewRiderSchema` (`riderId` + `notes`).

### Finding F1 — Low (condition)

`reviewRiderApplication` JSDoc in `admin-riders.ts` (~L47–53) still claims the backend **auto-approves** pending vehicles. That is **false** after enforcement. Comment (and optionally C1 report historical note) should be updated before/at commit so C2 authors are not misled.

---

## 3. Backend approval guard + `approveApplicationAtomic`

| Requirement | Evidence | Status |
| --- | --- | --- |
| Any `PENDING_REVIEW` vehicle → reject approve | 409 in `approveApplicationAtomic` | Pass |
| ≥1 `APPROVED` vehicle required | 409 if none approved | Pass |
| No vehicle auto-approve / mutation on application approve | No `updateVehicle` in approve path | Pass |
| Rejected vehicles preserved | Vehicle rows untouched on approve; tests assert mixed APPROVED+REJECTED | Pass |
| Application reject unchanged | Cascade pending→REJECTED; profile notes; audit `rejected` | Pass |
| Audit approve only on success | Audit after successful tx; blocked attempts emit none | Pass |

Service: `module.service.ts` ~L645–661 (approve) / ~L664–701 (reject).  
Repo: `module.repository.ts` ~L383–493.

---

## 4. Row-locking and concurrency

Postgres path:

1. `rider_profiles … FOR UPDATE`
2. `rider_vehicles … FOR UPDATE`
3. Guards → profile/role/wallet/decision writes in same `$transaction`

Concurrent double-approve covered in unit + DB tests (one success, one 409, single approve audit). Memory repo uses a per-rider promise lock as a FOR UPDATE stand-in.

**Pass.**

---

## 5. Permissions / MFA / audit

| Surface | Gate | MFA |
| --- | --- | --- |
| Applications / vehicle review | `ReviewRiders` via `requirePermission` | Staff MFA session (token `mfa: true` + enrolled) |
| Suspend / reinstate | `SuspendReinstateRiders` | Same |
| Permission matrix / routes authz | Unchanged in this diff | — |

Audit actions retained: `rider.application.approved|rejected`, vehicle review audits, `admin.user.suspended|reinstated` (suspend regression green).

**Pass.**

---

## 6. Frontend 401 / 403 / 409

Covered via shared client + C1 tests:

- Privileged **401** → `ApiError` + unauthorized handler (`admin-riders.mutations.test.ts`, `admin-users.test.ts`)
- **403** propagated without clearing session / fabricating data
- **409** propagated for review/reinstate conflicts

**Pass.**

---

## 7. Verification evidence

### Frontend (`apps/cyrlo_admin`)

| Command | Result |
| --- | --- |
| `npm test` | **16 files / 69 tests passed** |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

### Backend

| Command | Result |
| --- | --- |
| Application review unit + DB, module, directory, suspend (+ DB) | **7 files / 32 tests passed** |
| `npm run typecheck` | Pass |

---

## 8. Findings summary

| ID | Severity | Topic | Disposition |
| --- | --- | --- | --- |
| F1 | Low | Stale FE JSDoc still describes auto-approve | **Condition** — refresh comment before/at commit |
| F2 | Info | Application **reject** path still non-transactional | Pre-existing; out of 1C-C scope; documented in enforcement report |
| F3 | Info | Approve audit is after DB commit | Acceptable; failure would leave approved state without audit (pre-existing pattern class) |

No High/Medium product defects found.

---

## 9. Conditions to clear for full APPROVED

1. Update `reviewRiderApplication` documentation to state that backend **rejects** approval while any vehicle is `PENDING_REVIEW` (no auto-approve).
2. Optionally add a one-line erratum to `PHASE_1C_C1_IMPLEMENTATION_REPORT.md` that enforcement landed afterward.

C2 may proceed after F1 is cleared (or accepted as a same-commit doc fix).

---

## 10. Stop

Integrated review complete. No files modified by this review. No commit/push/deploy. Ghana/maps stash preserved. **Do not start C2** until the condition is addressed or explicitly waived.
