# Cyrlo Ride — Phase 2 Implementation Report  
## Passenger Management

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Base HEAD (pre-Phase 2 work):** `8aebdf6560a635f11829f9db4ee133110736c14a`  
**Discovery:** `docs/admin/PHASE_2_DISCOVERY_REPORT.md`  
**Mode:** Frontend integration only — **not staged / not committed**  
**Ghana/maps stash:** intact (`stash@{0}: wip-ghana-maps-preserve-phase0`)

---

## 1. Executive summary

Phase 2A–2F complete. Passenger Management is wired to existing Phase 0 console APIs. **No new backend endpoints, migrations, permission-map changes, production infrastructure changes, or Flutter changes.**

| Slice | Status |
| --- | --- |
| 2A Passenger API foundation | Done |
| 2B Passenger directory | Done |
| 2C Passenger profile | Done |
| 2D Booking + cancellation history | Done |
| 2E Suspend / reinstate | Done |
| 2F Security tests + verification | Done |

---

## 2. API contracts used

Existing routes under `/api/v1/admin` (permission `ViewBookingHistory` unless noted):

| Client | Method / path | Notes |
| --- | --- | --- |
| `fetchAdminPassengers` | `GET /admin/passengers` | `page`, `pageSize`, `q`, `status` |
| `fetchAdminPassenger` | `GET /admin/passengers/:passengerId` | No home lat/lng |
| `fetchPassengerBookings` | `GET /admin/passengers/:passengerId/bookings` | Pagination; `privacy.exactCoordinatesIncluded: false` |
| `fetchPassengerCancellations` | `GET /admin/passengers/:passengerId/cancellations` | Cancellation-request statuses preserved |
| `suspendUser` / `reinstateUser` | `POST /admin/users/suspend` \| `reinstate` | Existing `admin-users` clients; `SuspendReinstateRiders` |

Types added in `apps/cyrlo_admin/src/api/types.ts` match service DTOs from `console.service.ts`. No invented fields.

---

## 3. Pages and routes

| Route | Component | Replaces |
| --- | --- | --- |
| `/passengers` | `PassengersPage` | Placeholder |
| `/passengers/:passengerId` | `PassengerProfilePage` | (new) |

Directory features: search, account-status filter, pagination, URL sync, stale-request guard, loading/empty/error/retry, 401→session-expired, 403 handling, profile links that preserve query string.

Profile features: identity/contact/status/timestamps/PII labels (`dateOfBirth`, `gender`, free-text `homeLocation`), privacy note (no exact coords), independent booking and cancellation sections with their own pagination/loading/error states, account actions when permitted.

Booking detail deep-link: **not** added — `/bookings` remains a placeholder.

---

## 4. Permission behavior

| Capability | Permission | UI |
| --- | --- | --- |
| Directory + profile | `ViewBookingHistory` | Nav + `canAccessPath` (Support/Ops/Super; **not** Finance) |
| Booking + cancellation histories | `ViewBookingHistory` | Same gate as directory (backend identical permission) |
| Suspend / reinstate | `SuspendReinstateRiders` | Controls only when staff has permission (Support/Finance hidden) |

Nav already gated passengers on `ViewBookingHistory`. Nested `/passengers/:id` inherits parent via `canAccessPath`. Navigation hiding is not treated as authorization — API 403 still surfaces.

### Permission alignment decision (2026-11-12)

A proposed FE change to gate directory/profile as `ViewBookingHistory OR SuspendReinstateRiders` was **rejected** after inspection of the live backend:

- `GET /admin/passengers` and `GET /admin/passengers/:passengerId` use `requirePermission(ViewBookingHistory)` only.
- `PASSENGER_DIRECTORY_PERMISSION` and `console.permissions.test.ts` assert Suspend is **not** an alternate directory gate.
- Histories and suspend/reinstate permissions were already correctly separated in FE/BE.

**Option 1 selected:** keep the existing `ViewBookingHistory`-only directory/profile contract. **No code changes** for that proposal. No backend middleware, catalog, or role-map edits.

---

## 5. Booking and cancellation history

- Two separate panels on the profile (not confused with each other).
- Booking rows show API fields only (id, status, category, pickup label, riderId, connection fee, timestamps). Backend status strings shown as-is.
- Cancellation rows show request id, bookingId, reason, **cancellation-request** status, recommendation, timestamps.
- Empty / error / retry / stale guards are independent per list.
- Privacy note from bookings envelope rendered; exact coordinates never displayed even if a hostile payload injects them in tests.

---

## 6. Suspension / reinstatement

- Reuses `ConfirmReasonPanel` (reason min 2 / max 200) and `admin-users` clients.
- Passenger-accurate copy: sessions revoked; **does not** claim trip cancel, token wipe, or rider offline/availability semantics.
- Duplicate submit blocked while busy; profile refresh after success; reinstate only when `SUSPENDED`.

---

## 7. Files added and modified

### Added
- `apps/cyrlo_admin/src/api/admin-passengers.ts`
- `apps/cyrlo_admin/src/api/admin-passengers.test.ts`
- `apps/cyrlo_admin/src/pages/PassengersPage.tsx`
- `apps/cyrlo_admin/src/pages/PassengersPage.test.tsx`
- `apps/cyrlo_admin/src/pages/PassengerProfilePage.tsx`
- `apps/cyrlo_admin/src/pages/PassengerProfilePage.test.tsx`
- `docs/admin/PHASE_2_DISCOVERY_REPORT.md` (from discovery; still untracked until commit)
- `docs/admin/PHASE_2_IMPLEMENTATION_REPORT.md` (this file)

### Modified
- `apps/cyrlo_admin/src/api/types.ts` — passenger DTOs
- `apps/cyrlo_admin/src/app/router.tsx` — real passenger routes
- `apps/cyrlo_admin/src/config/nav.test.ts` — nested passenger path inheritance
- `apps/cyrlo_admin/src/features/riders/statusBadges.tsx` — `PassengerKindBadge`

### Unchanged (confirmed)
- Backend passenger console routes/services/schemas/permissions
- Permission matrix
- Flutter `apps/cyrlo_admin` peer app / `apps/cyrlo_app`
- Production hosting / deploy scripts
- Ghana maps stash

---

## 8. Tests and exact results

### Admin frontend
| Check | Result |
| --- | --- |
| `npm run test` | **22 files, 104 tests passed** |
| `npm run typecheck` | **pass** |
| `npm run build` | **pass** (`index-cl2zl8N0.js`) |

### Backend regression
| Check | Result |
| --- | --- |
| `npm run typecheck` | **pass** |
| `vitest run` `console.test.ts` + `console.permissions.test.ts` + `suspend.test.ts` | **3 files, 24 tests passed** |

Coverage added: passenger API clients (paths/query/401/403); directory (load/search/filter/pagination/empty/401/403/stale/URL); profile (load/404/401/403/sensitive exclusion); bookings/cancellations (empty/retry independence); suspend/reinstate (confirm/reason/busy/permission hide/refresh); nav nested path; existing rider/auth/overview/application suites remain green.

---

## 9. Known limitations

- Nested booking/cancellation pagination uses local state (not URL) so directory query context stays clean.
- No client sort on passenger list (backend fixed `createdAt desc`).
- No status/date filters on nested passenger bookings API.
- No booking-detail navigation (bookings UI still placeholder).
- Suspend may enqueue in-app/push notifications server-side — avoid casual production QA suspends.
- Finance cannot access passengers (by design).

---

## 10. Deferred work

- Global bookings browser UI (`/bookings`).
- Deep-link from passenger booking row to booking detail.
- Audit-log browser for passenger account actions.
- Trip GPS evidence / cancellation recommend (recent-MFA Support flows) — out of Phase 2 ordinary screens.
- Roadmap “Phase 3” naming alignment vs this project’s Phase 2 label.

---

## 11. Confirmations

- **No** new backend endpoints.  
- **No** schema / migration changes.  
- **No** permission-map changes.  
- **No** payment/token/matching/trip-lifecycle changes.  
- **No** Flutter changes.  
- **No** Ghana Card / identity-document / exact GPS exposure in UI.  
- **No** production infrastructure, deploy, SMS, or Paystack actions.  
- **No** git stage/commit/push.  
- Ghana maps stash **preserved**.

---

## 12. Stop for integrated review

Phase 2 implementation complete and verified locally. Awaiting integrated review before any commit.
