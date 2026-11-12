# Cyrlo Ride — Phase 1C-C Discovery Report  
## Rider Application Review and Account Actions

**Date:** 2026-11-12  
**Mode:** READ-ONLY audit (no application code, migrations, permission, deploy, or commit changes)  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `c306fc31c4c932624ac8dbe00755d78d624e5df5` (`c306fc3` — Phase 1C-B)  
**Working tree:** clean  
**Ghana/maps stash:** preserved (`stash@{0}: wip-ghana-maps-preserve-phase0`)

---

## 1. Executive summary

Backend already implements the mutation surface Phase 1C-C needs:

| Capability | Status | Primary gate |
| --- | --- | --- |
| Pending application list | **Exists** | `ReviewRiders` + staff MFA session |
| Application detail (docs metadata, vehicles, history) | **Exists** | `ReviewRiders` + MFA |
| Approve / reject application | **Exists** | `ReviewRiders` + MFA |
| Per-vehicle approve / reject | **Exists** | `ReviewRiders` + MFA |
| Document download URL | **Exists** | `AccessIdentityDocuments` + **recent** MFA |
| Ghana Card plaintext reveal | **Exists** | `AccessIdentityDocuments` + **recent** MFA |
| Suspend / reinstate account | **Exists** | `SuspendReinstateRiders` + MFA |
| Directory / profile reads (1C-A/B) | **Exists** | `ReviewRiders` + MFA |

Admin SPA (`apps/cyrlo_admin`) currently has **read-only** rider directory/profile (`admin-riders.ts`, `RidersPage`, `RiderProfilePage`). There are **no** mutation API clients, confirmation modals, or toast patterns yet. Shared UI primitives (`Button`, `TextInput`, `ErrorBanner`, `Panel`) and 401/403 conventions from Overview/Riders are reusable.

**No backend permission-matrix or schema changes appear required** to start 1C-C UI, if document/identity viewing is treated as a deliberate sub-feature with stricter auth.

---

## 2. Existing API inventory

Mount: `backend/src/app.ts` → `api.use('/admin/riders', modules.riders.opsRouter)` (under `/api/v1`).  
Router factory: `createRiderOpsRouter` in `backend/src/modules/riders/module.routes.ts`.  
Suspend routes live on the admin module router (`backend/src/modules/admin/module.routes.ts`).

### 2.1 Application review (riders ops)

| Method | Path | Handler | Service | Permission middleware |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/admin/riders/applications` | `RidersController.listPending` | `listPendingForOps` | `requirePermission(ReviewRiders)` via `ops` chain |
| `GET` | `/api/v1/admin/riders/applications/:riderId` | `getApplication` | `getApplicationForOps` | same |
| `POST` | `/api/v1/admin/riders/applications/:riderId/review` | `reviewApplication` | `reviewApplication` | same |
| `POST` | `/api/v1/admin/riders/vehicles/:vehicleId/review` | `reviewVehicle` | `reviewVehicle` | same |
| `GET` | `/api/v1/admin/riders/documents/:documentId/content` | `openDocument` | `openDocumentForOps` | `AccessIdentityDocuments` + `requireRecentMfa()` |
| `GET` | `/api/v1/admin/riders/applications/:riderId/ghana-card` | `revealGhanaCard` | `revealGhanaCardForOps` | same identity chain |

Related reads (already in SPA):

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/admin/riders` | Paginated directory (`listRidersForAdmin`) — can filter `verificationStatus=PENDING_REVIEW` |
| `GET` | `/api/v1/admin/riders/:riderId` | Ops profile snapshot (`getRiderForAdmin`) — **not** the application review DTO |

### 2.2 Account management (admin users)

| Method | Path | Handler | Service | Permission |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/admin/users/suspend` | `AdminController.suspendUser` | `AdminService.suspendUser` | `SuspendReinstateRiders` |
| `POST` | `/api/v1/admin/users/reinstate` | `reinstateUser` | `reinstateUser` | same |

### 2.3 Stale / unused schema note

`backend/src/modules/admin/module.schema.ts` still exports a **legacy** `reviewRiderSchema` (`riderId` + `decision` + optional `notes`) marked *“Kept for future rider-review milestone wiring; not registered in M2 routes.”*  
**Live contract** is `reviewRiderSchema` in `backend/src/modules/riders/module.schema.ts` (`decision` + optional `reason`). Frontend must follow the riders module schema, not the admin leftover.

---

## 3. Application approval / rejection workflow

### 3.1 Listing pending applications

- **Repo:** `RidersRepository.listPendingApplications` — `riderProfile` where `verificationStatus = PENDING_REVIEW`, ordered by `submittedAt` ascending (`module.repository.ts` ~L190–199).
- **Service mapping:** `listPendingForOps` (`module.service.ts` ~L423–433) returns:
  - `riderId`, `fullName`, `phoneNumber`, `status` (account), `verificationStatus`, `submittedAt`, `vehicleCount`
- **Pagination:** **none** (full pending queue). Directory GET remains the paginated alternative.

### 3.2 Application detail

- **Service:** `getApplicationForOps` (`module.service.ts` ~L546–587).
- Fields: identity summary, licence fields, `hasEncryptedGhanaCard`, **`ghanaCardNumber: null`** (never inline), document metadata list, vehicles, `reviewHistory` (decision, reason, vehicleId, actorId, createdAt).
- Richer for review UX than `getRiderForAdmin` (which omits documents/history and exposes tokens/GPS snapshot instead).

### 3.3 Request validation (approve/reject)

**Schema** `reviewRiderSchema` / `reviewVehicleSchema` (`module.schema.ts` ~L121–137):

```text
{ decision: 'APPROVED' | 'REJECTED', reason?: string (trim, 5–500) }
```

- Reject **requires** `reason` length ≥ 5 (Zod `superRefine` + service double-check).
- Approve may omit `reason`.

### 3.4 Status / role transitions (`reviewApplication`, ~L631–718)

| Decision | Profile verification | Vehicles `PENDING_REVIEW` | `users.role` | Wallet | Account `users.status` |
| --- | --- | --- | --- | --- | --- |
| `APPROVED` | → `APPROVED`; notes cleared | → `APPROVED` (auto) + per-vehicle review decisions | → **`RIDER`** via `setUserRole` | `ensureWallet` | unchanged |
| `REJECTED` | → `REJECTED`; notes = reason | → `REJECTED` + rejectionReason | **unchanged** (typically stays `PASSENGER`) | untouched | unchanged |

Preconditions:

- Profile must be `PENDING_REVIEW` else **409** `Application is not pending review`.
- Approve requires at least one vehicle in `APPROVED` or `PENDING_REVIEW` else **400**.

Also records `rider_review_decisions` row and audit:

- `rider.application.approved` / `rider.application.rejected`  
  metadata: `{ reason }`

### 3.5 Standalone vehicle review

`reviewVehicle` (~L721–763): vehicle must be `PENDING_REVIEW`; updates vehicle + review decision + audit `rider.vehicle.approved|rejected`. Does **not** by itself promote user role or approve the application profile.

### 3.6 Resubmission after rejection

**Yes — supported.**

- `requireEditableProfile` allows edit when status is `DRAFT` or `REJECTED` (blocks `PENDING_REVIEW` and `APPROVED`) (~L915–938).
- Updating a rejected vehicle resets verification to `DRAFT` and clears rejection reason (~L247–251).
- `submitApplication` moves profile (+ non-approved vehicles) back to `PENDING_REVIEW` and audits `rider.application.resubmitted` when prior status was `REJECTED` (~L408–411). Proven in `module.test.ts` (~L232–243).

Suspended accounts cannot submit (`submitApplication` / onboarding guards).

---

## 4. Suspension / reinstatement workflow

### 4.1 Request body

`suspendUserSchema` / `reinstateUserSchema` (`admin/module.schema.ts` ~L79–87):

```text
{ userId: uuid, reason: string trim min 2 max 200 }
```

Reason is **mandatory** for both actions.

### 4.2 Suspend (`AdminService.suspendUser`, ~L693–780)

Documented intent (interface comment ~L109–112): **does not cancel ACCEPTED/IN_PROGRESS trips**, **does not modify token balances**, **does not rewrite historical bookings**.

Verified behavior:

1. Permission assert `SuspendReinstateRiders`; cannot suspend self; cannot suspend `ADMIN` (use grant revoke); 404 if missing/DELETED.
2. Sets `users.status = SUSPENDED` (idempotent if already suspended).
3. If target `role === RIDER`: forces availability **OFFLINE** (`setRiderAvailabilityOffline`) — “intent offline only”.
4. Counts active trips for response (`activeTripsPreserved`); **does not clear** trip rows (`suspend.test.ts`, `suspend.db.test.ts` token balance unchanged).
5. Revokes all refresh sessions (`sessionsRevoked`).
6. Audit `admin.user.suspended` with metadata: `reason`, `previousStatus`, `role`, `activeTripsPreserved`, `sessionsRevoked`.
7. Optional in-app/push notification enqueue (`account.suspended`) when Prisma present — **not SMS/payment**.

Downstream effects (not by deleting trips):

- Matching eligibility fails with `ACCOUNT_NOT_ACTIVE` (`suspend.test.ts` ~L113–138).
- Going online blocked (`module.service.ts` availability — “Suspended riders cannot go online”).
- Trip state transitions blocked for suspended riders (`bookings/module.service.ts` ~L795–800).

### 4.3 Reinstate (`reinstateUser`, ~L783–849)

1. Target must be `SUSPENDED` (else 409).
2. Sets status `ACTIVE`.
3. **Does not** automatically set availability back to `AVAILABLE` (remains offline until rider goes online).
4. Audit `admin.user.reinstated` with `reason`, `role`.
5. Notification `account.reinstated` when Prisma present.

Applies to **PASSENGER or RIDER** non-admin users (same endpoints) — useful for applicants still `PASSENGER`.

---

## 5. Role–permission matrix (relevant actions)

Source of truth: `backend/src/common/authz/permissions.ts` (`rolePermissionMap`). FE mirror: `apps/cyrlo_admin/src/config/permissions.ts` (nav only).

| Permission | SUPER | OPS | FINANCE | SUPPORT | Used by 1C-C actions |
| --- | --- | --- | --- | --- | --- |
| `ReviewRiders` | ✓ | ✓ | ✗ | ✗ | applications list/get/review; vehicle review; directory/profile |
| `SuspendReinstateRiders` | ✓ | ✓ | ✗ | ✗ | suspend / reinstate |
| `AccessIdentityDocuments` | ✓ | ✓ | ✗ | ✗ | document content; Ghana Card reveal |
| `ManageRiderDocuments` | ✓ | ✓ | ✗ | ✗ | **Catalog only — no route currently binds this permission** |

**Do not change the matrix for 1C-C** (constraint). Unused `ManageRiderDocuments` is a gap/question, not a blocker if document routes keep using `AccessIdentityDocuments`.

---

## 6. Audit logging and security findings

### 6.1 MFA / authorization enforcement

| Action class | Authn | MFA session (`mfa: true` access token + enrolled MFA) | Recent MFA window |
| --- | --- | --- | --- |
| Review / pending / directory | `authenticate` + `requireActiveAccount` + `requirePermission` | **Required** inside `createRequirePermission` (`authorize.ts` ~L74–83, L107–116) | No |
| Suspend / reinstate | same pattern on admin routes | **Required** | No |
| Document / Ghana Card | `AccessIdentityDocuments` | Required + **`requireRecentMfa()`** (`ADMIN_RECENT_MFA_SECONDS`) | **Yes** |

Staff role is taken from **live DB grant**, not client JWT role claims (`authorize.ts` commentary ~L54–56).

### 6.2 Audit actions (rider review / account)

| Action string | When |
| --- | --- |
| `rider.application.approved` / `.rejected` | Application review |
| `rider.vehicle.approved` / `.rejected` | Vehicle review (standalone or as part of approve loop) |
| `rider.document.viewed` | Signed URL issued |
| `rider.identity.accessed` | Ghana Card decrypted (number **not** stored in audit — tests assert) |
| `admin.user.suspended` / `.reinstated` | Account actions |
| `rider.application.resubmitted` | Rider resubmits after rejection |

### 6.3 Security / product findings

| ID | Severity | Finding |
| --- | --- | --- |
| S1 | Info | Ghana Card never returned on application GET; reveal is separate, audited, recent-MFA. |
| S2 | Info | Suspend preserves active trips; UI must not claim trip cancellation. |
| S3 | Low | `ManageRiderDocuments` unused by routes — clarify whether document UX should stay on `AccessIdentityDocuments` only. |
| S4 | Low | Pending applications list is unpaginated — risk for large queues. |
| S5 | Low | Orphan admin `reviewRiderSchema` could confuse FE authors if discovered first. |
| S6 | Medium (product/UX) | Approve auto-approves all `PENDING_REVIEW` vehicles; ops may want explicit per-vehicle review first via `POST .../vehicles/:id/review`. |
| S7 | Info | Identity endpoints need FE support for “recent MFA” failures (distinct from session expiry). |

No authorization bypass found in the inspected review/suspend paths for Support/Finance.

---

## 7. Frontend reuse opportunities (`apps/cyrlo_admin`)

### Already present

| Asset | Reuse for 1C-C |
| --- | --- |
| `api/client.ts` + `ApiError` + 401 session expiry | All mutations |
| `api/admin-riders.ts` + rider types | Extend with applications/review/suspend clients |
| `RidersPage` / `RiderProfilePage` + badges | Entry points; action buttons; filter `PENDING_REVIEW` |
| `config/nav.ts` `ReviewRiders` + nested path access | Keep review under `/riders` |
| `staffRoleHasPermission(SuspendReinstateRiders)` | Gate suspend UI (Ops/Super only) |
| `ErrorBanner`, `Button` (`danger`), `Label`, `TextInput`, `Panel` | Forms / errors |
| Overview/Riders loading/error/retry patterns | Consistency |

### Missing (must build in 1C-C)

- Mutation functions: review application/vehicle, suspend, reinstate, optional document/Ghana Card.
- Types for application DTOs and suspend responses.
- Confirmation / reason-capture UI (no modal/dialog/toast library in SPA today — auth pages use inline forms only).
- Pending applications queue view (or directory preset) and review detail layout (documents list, history).
- Handling **403 recent MFA** for identity reads (if in scope).
- Post-mutation refresh of directory/profile state.

### Endpoints integrable directly (no backend work)

All of §2.1–2.2.

### Backend capabilities that are “missing” only relative to ideal UX

- Paginated/filtered applications queue (workaround: directory `verificationStatus=PENDING_REVIEW` **or** consume unpaginated `/applications`).
- Dedicated “pending count” endpoint (Overview snapshot already exposes `pendingApplications` on analytics).
- Binding or retiring unused `ManageRiderDocuments`.
- Removing/aligning stale admin `reviewRiderSchema`.

---

## 8. Backend gaps (for 1C-C implementation planning)

| Gap | Blocking? | Notes |
| --- | --- | --- |
| No SPA clients/UI | Yes for product | Expected 1C-C work |
| Applications list unpaginated | Soft | Prefer directory filter or add pagination later |
| `ManageRiderDocuments` unused | Soft | Decision only |
| Duplicate admin review schema | Soft | Documentation hazard |
| Recent-MFA UX for docs | Soft if docs deferred | Required if document viewer ships |
| Reinstate leaves availability OFFLINE | By design | Document in UI copy |

**No migration or permission-map change required** to implement core approve/reject/suspend/reinstate UI.

---

## 9. Recommended implementation sequence

1. **API layer** — typed clients for applications list/get/review, vehicle review, suspend/reinstate; extend types; keep using shared `apiRequest`.
2. **Confirm + reason patterns** — small reusable confirm panel/modal + reason field (reject/suspend/reinstate); no backend change.
3. **Pending queue UX** — either dedicated `/riders/applications` route or directory deep-link `?verificationStatus=PENDING_REVIEW`; link into review detail.
4. **Review detail** — load `GET .../applications/:id`; show docs metadata + history; approve/reject; optional vehicle-level review first.
5. **Profile account actions** — suspend/reinstate with mandatory reason; show `activeTripsPreserved` on suspend result; copy that trips are **not** cancelled.
6. **Permission gating** — Review actions: `ReviewRiders`; suspend: `SuspendReinstateRiders`; Support/Finance: no UI.
7. **Optional identity pack** — document open + Ghana Card with recent-MFA error handling (can be 1C-C-b / later).
8. **Tests** — mutation success/409 conflict/403/401; applicant vs approved after approve; suspend does not invent trip cancellation; role gates.

Stop for product decisions (§10) before coding if document identity scope is unclear.

---

## 10. Risks and questions requiring a decision

1. **Queue source of truth:** dedicated `GET /applications` (FIFO by `submittedAt`) vs directory filter `PENDING_REVIEW` (paginated, different sort `createdAt`)?
2. **Document / Ghana Card in 1C-C scope?** Requires recent MFA UX and careful audit messaging.
3. **Vehicle review UX:** always rely on application approve auto-approving pending vehicles, or require explicit per-vehicle reviews first?
4. **Suspend applicants (`PASSENGER` + rider profile):** allow from same profile actions as riders?
5. **What to do with unused `ManageRiderDocuments`?** Leave unused vs future document-management routes (no matrix change in this phase).
6. **Notifications:** suspend/reinstate already enqueue in-app/push when Prisma is wired — confirm staging/prod notification side effects are acceptable during QA (no SMS in these paths).
7. **Stale admin `reviewRiderSchema`:** ignore vs cleanup in a later hygiene PR (out of 1C-C scope if read-only continues).

---

## 11. Key source references

| Area | Files / symbols |
| --- | --- |
| Ops routes | `riders/module.routes.ts` — `createRiderOpsRouter` |
| Review logic | `riders/module.service.ts` — `listPendingForOps`, `getApplicationForOps`, `reviewApplication`, `reviewVehicle`, `submitApplication` |
| Review schemas | `riders/module.schema.ts` — `reviewRiderSchema` |
| Controllers | `riders/module.controller.ts` |
| Suspend routes | `admin/module.routes.ts` — `/users/suspend`, `/users/reinstate` |
| Suspend logic | `admin/module.service.ts` — `suspendUser`, `reinstateUser` |
| Suspend tests | `admin/suspend.test.ts`, `admin/suspend.db.test.ts` |
| Permissions | `common/authz/permissions.ts` |
| MFA middleware | `common/middleware/authorize.ts` — `createRequirePermission`, `requireRecentMfa` |
| FE reads | `apps/cyrlo_admin/src/api/admin-riders.ts`, `pages/RidersPage.tsx`, `pages/RiderProfilePage.tsx` |

---

## 12. Stop

Discovery complete. **No implementation started.** No code/schema/permission/deploy/commit/push activity beyond this report file. Ghana/maps stash untouched.
