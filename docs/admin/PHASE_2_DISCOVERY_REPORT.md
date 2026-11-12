# Cyrlo Ride — Phase 2 Discovery Report  
## Passenger Management (READ-ONLY)

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `8aebdf6560a635f11829f9db4ee133110736c14a`  
**Mode:** READ-ONLY discovery (this report only; no source/API/migration/deploy/stash changes)  
**Working tree:** clean after Phase 1 commits A/B/C  
**Ghana/maps stash:** intact (`stash@{0}: wip-ghana-maps-preserve-phase0`)  

**Naming note:** `ADMIN_IMPLEMENTATION_ROADMAP.md` labeled passenger UI under **Phase 3**. This project phase is **Phase 2 — Passenger Management** per current plan. Rider application/suspend UI already shipped in Phase 1C.

---

## 1. Executive summary

**Backend passenger management is largely already implemented** (Phase 0 console):

| Capability | Backend | Admin SPA |
| --- | --- | --- |
| Passenger directory (search, status filter, pagination) | **Exists** | Placeholder only |
| Passenger profile | **Exists** (no home lat/lng) | Missing |
| Passenger booking history | **Exists** (no exact coords) | Missing |
| Passenger cancellation history | **Exists** | Missing |
| Global booking list/detail | **Exists** | Placeholder `/bookings` |
| Suspend / reinstate | **Exists** (shared user APIs) | Wired for **riders** only; reusable for passengers |

**No new backend endpoints are required** for a first Passenger Management UI that mirrors the rider directory/profile pattern, if Phase 2 stays within existing contracts.

**Frontend gap:** no `admin-passengers` client/types; `/passengers` is still `PlaceholderPage`.

---

## 2. Existing API inventory

Mount: admin router under `/api/v1/admin` (`createAdminRouter` in `backend/src/modules/admin/module.routes.ts`).

All passenger **read** routes:

- `authenticate` + `requireActiveAccount`
- `requirePermission(ViewBookingHistory)`
- Staff access JWT with `role: ADMIN`, `mfa: true` (via `requirePermission` chain)
- **No** `requireRecentMfa` on these reads

### 2.1 Directory — `GET /api/v1/admin/passengers`

| Item | Detail |
| --- | --- |
| Handler | `AdminConsoleController.listPassengers` → `AdminConsoleService.listPassengers` |
| Query schema | `listPassengersQuerySchema` (`console.schema.ts`) |
| Permission | `ViewBookingHistory` only (`PASSENGER_DIRECTORY_PERMISSION`) |

**Query**

| Param | Type | Notes |
| --- | --- | --- |
| `page` | int ≥ 1 | Default **20**-page size stack: default page `1` |
| `pageSize` | int 1–**100** | Default **20** (`DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE`) |
| `q` | string 1–120 | Optional; trim |
| `status` | `ACTIVE` \| `SUSPENDED` \| `DELETED` | Optional |

**Search:** `OR` on `phoneNumber` contains, `displayName` contains (case-insensitive), `passengerProfile.fullName` contains (case-insensitive). Role fixed to `PASSENGER`.

**Sort:** fixed `createdAt desc` — **no client sort parameter**.

**Response `data`**

```ts
{
  items: Array<{
    id: string;              // user UUID
    phoneNumber: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED' | …;
    displayName: string | null;
    fullName: string | null; // from passengerProfile
    createdAt: string;       // ISO
  }>;
  pagination: { page; pageSize; total; hasNextPage };
}
```

### 2.2 Profile — `GET /api/v1/admin/passengers/:passengerId`

| Item | Detail |
| --- | --- |
| Params | `passengerId` UUID; must be `role: PASSENGER` or 404 |
| Permission | `ViewBookingHistory` |

**Response `data`**

```ts
{
  id: string;
  phoneNumber: string;
  status: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  profile: null | {
    fullName: string | null;
    dateOfBirth: string | null;  // YYYY-MM-DD
    gender: string | null;
    homeLocation: string | null; // free-text label only
  };
}
```

**Not returned:** `homeLatitude` / `homeLongitude` (columns exist on `PassengerProfile` in Prisma but are **not selected** in `findPassenger`). Password hashes, tokens, MFA secrets, Ghana Card — **N/A** for passengers (no Ghana Card model on passenger profile).

### 2.3 Booking history — `GET /api/v1/admin/passengers/:passengerId/bookings`

| Item | Detail |
| --- | --- |
| Query | `paginationQuerySchema` only (`page`, `pageSize`) — **no** status/date filters on this nested route |
| Sort | `createdAt desc` |
| Permission | `ViewBookingHistory` |

**Item fields:** `id`, `status`, `vehicleCategory`, `bookingFeePesewas`, `pickupLabel`, `riderId`, `createdAt`, `acceptedAt`, `cancelledAt`, `completedAt`, `cancellationReason`, `exactCoordinatesIncluded: false`.

**Envelope also includes** `privacy: { exactCoordinatesIncluded: false, note: … }`.

**Related (broader):** `GET /admin/bookings` (filters: status, passengerId, riderId, serviceZoneId, from, to) and `GET /admin/bookings/:bookingId` (detail + payments + statusHistory; still **no** exact coords). Useful for deep-link from passenger booking row; Phase 2 may embed summary only or link to future bookings UI.

### 2.4 Cancellation history — `GET /api/v1/admin/passengers/:passengerId/cancellations`

| Item | Detail |
| --- | --- |
| Source | `bookingCancellationRequest` where `passengerId` |
| Sort | `createdAt desc` |
| Pagination | same as bookings |
| Permission | `ViewBookingHistory` |

**Item fields:** `id`, `bookingId`, `reason`, `status`, `recommendation`, `createdAt`, `resolvedAt`.

**Note:** Support also has `GET /admin/cancellation-requests` (global queue) with recommend mutation + **recent MFA** — out of core passenger profile scope unless Phase 2 explicitly includes support actions.

### 2.5 Account actions — suspend / reinstate

| Method | Path | Permission | Body |
| --- | --- | --- | --- |
| `POST` | `/api/v1/admin/users/suspend` | `SuspendReinstateRiders` | `{ userId: uuid, reason: string min 2 max 200 }` |
| `POST` | `/api/v1/admin/users/reinstate` | `SuspendReinstateRiders` | same |

**Shared with riders** (`AdminService.suspendUser` / `reinstateUser`). Applies to `PASSENGER` or `RIDER`; rejects `ADMIN` and self-suspend.

**Suspend behavior (passengers):**

1. Permission assert; 404 if missing/DELETED.  
2. Set `users.status = SUSPENDED` (idempotent if already suspended).  
3. `activeTripsPreserved`: **0** for passengers (active-trip count only when `role === 'RIDER'`).  
4. **No** rider offline call for passengers.  
5. Revoke all refresh sessions (`sessionsRevoked`).  
6. Audit `admin.user.suspended` with reason, previousStatus, role, activeTripsPreserved, sessionsRevoked.  
7. Optional in-app/push notification enqueue when Prisma present — **not** SMS; UI/QA should treat live suspend as user-visible.  
8. Does **not** cancel ACCEPTED/IN_PROGRESS trips; does **not** modify token balances (rider-wallet concern; passengers typically have no rider wallet path here).

**Reinstate:** requires `SUSPENDED` → `ACTIVE`; audit `admin.user.reinstated`; does not auto-change availability (N/A for passengers).

**Frontend client already exists:** `apps/cyrlo_admin/src/api/admin-users.ts` (`suspendUser` / `reinstateUser`) — reuse with passenger `userId`.

---

## 3. Permission matrix (passenger Phase 2)

| Capability | Permission | SUPER | OPS | FINANCE | SUPPORT | MFA |
| --- | --- | --- | --- | --- | --- | --- |
| List/get passengers | `ViewBookingHistory` | Y | Y | **N** | Y | Staff MFA session (`mfa: true`) |
| Passenger bookings / cancellations | `ViewBookingHistory` | Y | Y | **N** | Y | Staff MFA session |
| Global bookings list/detail | `ViewBookingHistory` | Y | Y | **N** | Y | Staff MFA session |
| Suspend / reinstate passenger | `SuspendReinstateRiders` | Y | Y | **N** | **N** | Staff MFA session (**not** recent-MFA) |
| Trip GPS evidence | `ViewTripGpsEvidence` | Y | N* | N | Y | **Recent MFA** — out of ordinary passenger screens |
| Cancellation recommend | `RecordSupportDecisions` | Y | N | N | Y | **Recent MFA** — support queue, not directory |

\*Ops lacks `ViewTripGpsEvidence` in FE permission mirror / backend map — Support/Super have it.

**UI gating recommendation:** mirror riders — show directory/profile to `ViewBookingHistory`; show suspend controls only when `SuspendReinstateRiders`. Finance must not see Passengers nav (already true in `nav.ts`).

---

## 4. Frontend foundations

### Present
| Asset | Role for Phase 2 |
| --- | --- |
| Nav `/passengers` | Already gated `ViewBookingHistory` (`nav.ts`) |
| Router `/passengers` | **Placeholder** — replace with real page |
| `RidersPage` / `RiderProfilePage` | Pattern to copy: URL query filters, stale `requestId`, ErrorBanner, pagination, badges, account ConfirmReasonPanel |
| `admin-users.ts` | Suspend/reinstate clients ready |
| `AccountStatusBadge`, `ui` primitives | Reuse |
| `ConfirmReasonPanel` | Reuse for suspend/reinstate |
| Auth shell / MFA / 401→session-expired | Already global |

### Missing
| Asset | Need |
| --- | --- |
| `api/admin-passengers.ts` | Typed clients for list/get/bookings/cancellations |
| Types in `api/types.ts` | Passenger list/profile/booking/cancellation DTOs |
| `PassengersPage` | Directory UI |
| `PassengerProfilePage` | Profile + bookings + cancellations + account actions |
| Router nested `/passengers/:passengerId` | + `canAccessPath` inherits `/passengers` |
| Placeholder copy | Still says “not in Phase 1A” — outdated |

### No FE passenger API clients today
Grep of `apps/cyrlo_admin/src/api` finds **no** `/admin/passengers` usage.

---

## 5. Security findings

| ID | Severity | Finding |
| --- | --- | --- |
| S1 | **Pass** | Ordinary passenger/booking payloads omit exact lat/lng; `homeLatitude`/`homeLongitude` not selected |
| S2 | **Pass** | No passwords, refresh/access tokens, or MFA secrets in passenger console DTOs |
| S3 | **Pass** | No Ghana Card / identity-document APIs on passenger profiles |
| S4 | **Info** | `homeLocation` is a free-text string (may still be sensitive address text) — acceptable to show to Support/Ops with `ViewBookingHistory`; do not invent map pins from it |
| S5 | **Info** | `dateOfBirth` / `gender` exposed on profile — treat as PII in UI; no extra recent-MFA today |
| S6 | **Pass** | Finance cannot list passengers (no `ViewBookingHistory`) |
| S7 | **Pass** | Support can view but cannot suspend (no `SuspendReinstateRiders`) |
| S8 | **Info** | Suspend may enqueue push/in-app notification — avoid casual production QA suspends |
| S9 | **Info** | Trip-GPS / cancel-recommend remain separate MFA-gated surfaces — **do not** add to Phase 2 ordinary screens without explicit scope |

---

## 6. Missing functionality (product / API gaps)

| Gap | Impact | Phase 2 stance |
| --- | --- | --- |
| FE passengers UI + clients | Blocks Phase 2 delivery | **Build** |
| Client-controlled sort on passenger list | Only `createdAt desc` | Document; do not invent sort API unless required |
| Filters on nested passenger bookings (status/date) | Must use global `/admin/bookings?passengerId=` or client-side filter of page | Prefer link/filter via global bookings API if needed |
| Dedicated “passenger suspend” permission name | Same `SuspendReinstateRiders` as riders | Keep; UI copy “account” not “rider-only” |
| Passenger-specific active-trip count | Always 0 in suspend response for PASSENGER | Copy must not claim rider-offline semantics |
| Bookings browser UI | Placeholder | Optional Phase 2 deep-link vs defer to later bookings phase |
| Audit log UI | Super-only API exists | Out of Phase 2 unless requested |

**Backend endpoint additions:** **Not required** for the recommended Phase 2 scope.

---

## 7. Recommended implementation sequence

1. **API layer** — `admin-passengers.ts` + types matching console contracts; tests for paths/query/401/403.  
2. **Passengers directory page** — clone `RidersPage` patterns: `q`, `status`, pagination in URL; stale-request guard; empty/error/retry.  
3. **Passenger profile page** — identity panel; bookings table; cancellations table; privacy notes (no exact GPS).  
4. **Account actions** — reuse `suspendUser`/`reinstateUser` + `ConfirmReasonPanel`; gate with `SuspendReinstateRiders`; passenger-accurate copy (sessions revoked; do not claim rider offline/token wipe).  
5. **Router/nav** — replace placeholder; add `/passengers/:passengerId`; preserve query on back navigation.  
6. **Optional:** deep-link booking id to `/bookings/:id` only if bookings detail page is in scope; otherwise show inline summary from passenger bookings API.  
7. **Tests** — page tests mirroring riders/profile; permission visibility for Support vs Finance vs Ops.

---

## 8. Exact files likely to change

### Add
- `apps/cyrlo_admin/src/api/admin-passengers.ts`
- `apps/cyrlo_admin/src/api/admin-passengers.test.ts`
- `apps/cyrlo_admin/src/pages/PassengersPage.tsx` (+ test)
- `apps/cyrlo_admin/src/pages/PassengerProfilePage.tsx` (+ test)
- Possibly `apps/cyrlo_admin/src/features/passengers/*` if badges/helpers need isolation

### Modify
- `apps/cyrlo_admin/src/api/types.ts` — passenger DTOs
- `apps/cyrlo_admin/src/app/router.tsx` — real passenger routes
- `apps/cyrlo_admin/src/config/nav.test.ts` — if route assertions expand
- Docs: Phase 2 implementation report (later)

### Likely untouched (reuse as-is)
- Backend passenger console routes/services/schemas  
- `admin-users.ts` suspend/reinstate  
- Permission matrix / backend authz  
- Flutter app  

---

## 9. Tests required

### Frontend
- Passenger list: load, empty, error/retry, 401, 403, stale guard, pagination/query persistence  
- Profile: render without lat/lng; bookings + cancellations sections  
- Suspend/reinstate visibility (Ops yes / Support no / Finance no nav)  
- Suspend confirm + reason validation; success refresh  
- Regression: riders, applications, overview, auth still green  

### Backend (regression — already present; re-run)
- `console.permissions.test.ts` (ViewBookingHistory directory gate)  
- `console.test.ts` / `console.db.test.ts` (list/get/bookings/cancellations; no exact coords)  
- `suspend.test.ts` / `suspend.db.test.ts` (passenger-capable user suspend if covered)  

### Not required for Phase 2 start
- New backend endpoints or migrations  
- Recent-MFA step-up UI  

---

## 10. Contract quick reference

| Endpoint | Authz | Recent MFA | Pagination | Sort |
| --- | --- | --- | --- | --- |
| `GET /admin/passengers` | ViewBookingHistory | No | Yes | createdAt desc |
| `GET /admin/passengers/:id` | ViewBookingHistory | No | — | — |
| `GET /admin/passengers/:id/bookings` | ViewBookingHistory | No | Yes | createdAt desc |
| `GET /admin/passengers/:id/cancellations` | ViewBookingHistory | No | Yes | createdAt desc |
| `GET /admin/bookings` | ViewBookingHistory | No | Yes + filters | (repo order) |
| `GET /admin/bookings/:id` | ViewBookingHistory | No | — | — |
| `POST /admin/users/suspend` | SuspendReinstateRiders | No | — | — |
| `POST /admin/users/reinstate` | SuspendReinstateRiders | No | — | — |

---

## 11. Discovery stop

Phase 2 Passenger Management discovery complete.  

**Backend readiness: high.** **Frontend readiness: patterns ready; pages/clients missing.**  

Do not implement until this report is reviewed. No source changes, commits, pushes, deploys, migrations, or stash operations were performed beyond creating this file.
