# Cyrlo Ride — Phase 1C-A Implementation Report  
## Backend Rider Management Read APIs

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Baseline HEAD:** `8f4184027c68f20c0011e777cb5c34abc74a8025`  
**Mode:** Implementation complete locally — **no commit / push / deploy**

---

## 1. Authorization decision (no new permission)

| Question | Decision |
| --- | --- |
| New permission required? | **No** |
| Gate used | Existing `ReviewRiders` (`admin.review_riders`) |
| Roles | `SUPER_ADMIN`, `OPERATIONS_ADMIN` only (unchanged map) |
| Support / Finance | Still **denied** directory/profile (use bookings / ledgers as before) |
| Role-map / catalog edits | **None** |
| MFA | Enforced by existing `requirePermission` staff MFA chain |

Exported as `RIDER_DIRECTORY_PERMISSION = Permission.ReviewRiders` for tests and FE alignment.

This matches discovery recommendation and avoids silently broadening `ViewBookingHistory` to Support for rider PII.

---

## 2. Endpoints

Mounted on existing `createRiderOpsRouter` → `/api/v1/admin/riders` (static paths registered before `/:riderId`).

### `GET /api/v1/admin/riders`

| Item | Contract |
| --- | --- |
| Permission | `ReviewRiders` + MFA staff access |
| Query | `page`, `pageSize` (default 20, max 100); optional `q`, `status` (`ACTIVE`/`SUSPENDED`/`DELETED`), `verificationStatus`, `availability` |
| Search `q` | Phone contains; displayName / fullName insensitive contains; exact UUID id when `q` is UUID-shaped |
| Population | Users **with a `rider_profile`** (includes applicants still `role=PASSENGER`) |
| Sort | `users.createdAt` descending (passenger-directory parity) |
| Response | `{ items, pagination, semantics }` |

**List item fields:**  
`id`, `phoneNumber`, `role`, `status`, `displayName`, `fullName`, `verificationStatus`, `availability`, `submittedAt`, `createdAt`

`semantics.availability = database_snapshot` — not a live feed.

### `GET /api/v1/admin/riders/:riderId`

| Item | Contract |
| --- | --- |
| Permission | `ReviewRiders` + MFA |
| Params | `riderId` UUID |
| 404 | No user or no rider profile |
| Response | Operational profile (below) |

**Profile fields:**

- Identity: `id`, `phoneNumber`, `role`, `status`, `displayName`, `createdAt`, `updatedAt`
- `profile`: `fullName`, `verificationStatus`, `availability`, `submittedAt`, licence fields, `verificationNotes`
- `vehicles[]`: category, registration, make/model/colour/capacity, verification, timestamps
- `gps`: `sharingEnabled`, `recordedAt`, `receivedAt`, `fresh`, `maxAgeMs` (30s), `snapshot: true` — **no lat/lng**
- `tokens.balance`: wallet snapshot (0 if none) + note pointing Finance to ledgers
- `privacy.exactCoordinatesIncluded: false`
- `semantics`: documents separate meanings for account / verification / availability / GPS / tokens

**Not exposed:** passwords, MFA secrets, refresh/access tokens, Ghana Card number, identity ciphertext, exact coordinates.

Privileged coordinates remain on existing `GET /admin/riders/:riderId/location` (`MonitorOperations` / `ViewTripGpsEvidence`).

---

## 3. Database queries

| Operation | Approach |
| --- | --- |
| List | Single `$transaction`: `user.count` + `user.findMany` with `riderProfile` filter/select; no N+1 |
| Profile | `user.findFirst` with nested `riderProfile` → vehicles, location (timestamps only), wallet balance |
| GPS freshness | Computed in service via `evaluateLocationFreshness` (same 30s rule as ops) |

**Migrations:** none.

---

## 4. Files changed

| File | Change |
| --- | --- |
| `backend/src/modules/riders/module.schema.ts` | `listAdminRidersQuerySchema`, `adminRiderIdParamSchema` |
| `backend/src/modules/riders/module.repository.ts` | `listForAdminDirectory`, `findForAdminProfile` |
| `backend/src/modules/riders/module.service.ts` | `listRidersForAdmin`, `getRiderForAdmin`, coordinate exclusion constant |
| `backend/src/modules/riders/module.controller.ts` | `listRiders`, `getRider` |
| `backend/src/modules/riders/module.routes.ts` | `GET /`, `GET /:riderId`, `RIDER_DIRECTORY_PERMISSION` |
| `backend/src/modules/riders/directory.test.ts` | Authz, schema, service unit tests |
| `backend/src/modules/riders/directory.db.test.ts` | Postgres list/filter/profile |

**Untouched:** suspend/reinstate workflows, Flutter, role permission map, frontend.

---

## 5. Tests

| Suite | Result |
| --- | --- |
| `directory.test.ts` | **8 passed** (authz roles/MFA/unauthorized, schema, pagination/search/filter/empty, profile privacy, 404) |
| `directory.db.test.ts` | **1 passed** (Postgres list/filter/profile/coords omitted) |
| Backend `tsc --noEmit` | **Pass** |

---

## 6. Security considerations

1. Directory limited to roles that already review riders — not Support.  
2. Staff MFA required on the same path as other ops rider routes.  
3. Exact GPS withheld on these GETs even though location rows exist.  
4. Token **balance** is an ops snapshot field; full ledger remains `ViewTokenLedgers`.  
5. Applications routes still take precedence over `/:riderId` (static paths first).

---

## 7. Remaining gaps (frontend / later)

| Gap | Notes |
| --- | --- |
| Admin SPA Rider Management UI | Phase 1C-B — not started |
| Support read-only rider card | Product decision; not granted via ReviewRiders |
| Dedicated admin wallet GET | Soft; balance already on profile |
| Live availability board | Out of scope |
| Discovery report commit | `PHASE_1C_DISCOVERY_REPORT.md` still untracked |

---

## 8. Verdict

**Phase 1C-A read APIs implemented** against existing `ReviewRiders` without permission-catalog or migration changes. Stop for review before commit/frontend.
