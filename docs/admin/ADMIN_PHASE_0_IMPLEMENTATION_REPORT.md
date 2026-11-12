# Cyrlo Ride — Admin Phase 0 Implementation Report

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0` (from `origin/main` @ `44e024a`)  
**Scope:** Backend foundation only — no admin UI, no deploy, no push to main.

---

## 1. Repository synchronization

| Step | Result |
| --- | --- |
| Working tree before Phase 0 | Unrelated Ghana/maps WIP present |
| Preserve unrelated work | Stashed as `stash@{0}: wip-ghana-maps-preserve-phase0` (still present; not popped) |
| Fetch / sync | Fast-forwarded feature branch to `origin/main` `44e024a` |
| Safety | No `reset --hard`, no force-push, Ghana WIP not merged into this branch |

Local DB had pending migrations through destination-free fee work; `prisma migrate deploy` was applied **locally** so integration tests could run (includes Phase 0 index migration).

---

## 2. Files changed

### New
- `backend/src/modules/admin/console.schema.ts`
- `backend/src/modules/admin/console.repository.ts`
- `backend/src/modules/admin/console.service.ts`
- `backend/src/modules/admin/console.controller.ts`
- `backend/src/modules/admin/console.test.ts`
- `backend/src/modules/admin/console.permissions.test.ts`
- `backend/src/modules/admin/console.db.test.ts`
- `backend/prisma/migrations/20261112120000_admin_phase0_console_indexes/migration.sql`
- `docs/admin/ADMIN_PHASE_0_IMPLEMENTATION_REPORT.md` (this file)

### Modified
- `backend/src/modules/admin/module.routes.ts` — console routes + permission guards
- `backend/src/modules/admin/index.ts` — wire `AdminConsoleService` / controller
- `backend/src/modules/wallet/module.schema.ts` — admin ledger query schema
- `backend/src/modules/wallet/module.repository.ts` — `listLedgersForFinance`
- `backend/src/modules/wallet/module.service.ts` — ledger listing
- `backend/src/modules/wallet/module.controller.ts` — `adminListLedgers`
- `backend/src/modules/wallet/module.routes.ts` — `GET /admin/token-ledgers`
- `backend/src/modules/audit/module.routes.ts` — document that reads live under `/admin/audit-logs`
- `backend/prisma/schema.prisma` — indexes for users/payments/audit_logs

Audit inventory docs under `docs/admin/` remain from the prior read-only audit (unchanged by this phase except this report).

---

## 3. APIs implemented

Base: `/api/v1`. All routes require staff MFA access token + active grant.

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/admin/analytics` | any of `MonitorOperations`, `ViewFinancialReports`, `InvestigateDisputes`, `ViewPayments` | `snapshot` (current) vs `period` (inclusive UTC `from`/`to` on createdAt) |
| GET | `/admin/financial-reports` | `ViewFinancialReports` | Finance period slice (fees, refunds, tokens, completed connections) |
| GET | `/admin/passengers` | **`ViewBookingHistory` only** | Paginated; `q`, `status` (suspend is not a directory gate) |
| GET | `/admin/passengers/:passengerId` | **`ViewBookingHistory` only** | Profile without home coordinates |
| GET | `/admin/passengers/:passengerId/bookings` | `ViewBookingHistory` | Paginated booking history |
| GET | `/admin/passengers/:passengerId/cancellations` | `ViewBookingHistory` | Paginated cancel requests |
| GET | `/admin/bookings` | `ViewBookingHistory` | Filters: status, passengerId, riderId, serviceZoneId, from, to; **no exact lat/lng** |
| GET | `/admin/bookings/:bookingId` | `ViewBookingHistory` | Detail + fee payments + status history; **no exact lat/lng** |
| GET | `/admin/audit-logs` | `ManageAdmins` | Filters: actorId, action, entityType, entityId, from, to |
| GET | `/admin/token-ledgers` | `ViewTokenLedgers` | Filters: riderId, type, from, to |

### Analytics fields (explicit)

- Total / active / suspended passengers  
- Registered riders; approximate available riders (APPROVED + AVAILABLE + fresh GPS); pending applications  
- Bookings by status; completed connections  
- GH₵1 connection-fee SUCCESS / PENDING / FAILED (count + amountPesewas)  
- Refunds by status  
- Token purchase SUCCESS totals + deduction usage  

**Excluded:** transportation-fare revenue (`exclusions.transportationFareRevenue: false` with note).

Suspension/reactivation continues to use existing `POST /admin/users/suspend` and `/reinstate` (`SuspendReinstateRiders`).

Audit logs remain **immutable** via ordinary admin APIs (read-only listing; `/audit` mount stays empty).

---

## 4. Permissions enforced

| Permission | Route coverage after Phase 0 |
| --- | --- |
| `ViewBookingHistory` | `/admin/bookings*`, passenger booking/cancel history |
| `ViewTokenLedgers` | `/admin/token-ledgers` |
| `ViewFinancialReports` | `/admin/financial-reports` (+ analytics anyOf) |
| `ManageAdmins` | `/admin/audit-logs` (Super) |
| `SuspendReinstateRiders` | passengers list/get (with ViewBookingHistory) |
| `MonitorOperations` / `ViewPayments` / `InvestigateDisputes` | analytics anyOf |

**Not invented:** no new permission strings.  
**Still without dedicated routes (documented earlier):** `ManagePlatformConfig`, `ManageRiderDocuments` (docs still gated by `AccessIdentityDocuments`).

---

## 5. Database changes

Migration `20261112120000_admin_phase0_console_indexes`:

- `users(role, status)` — passenger/rider counts and filtered lists  
- `payments(purpose, status, created_at)` — fee/token aggregates  
- `audit_logs(created_at)` — date-ordered audit browsing  

No new tables. No production config changes.

---

## 6. Tests and results

| Suite | Focus | Result |
| --- | --- | --- |
| `console.test.ts` | Analytics correctness, pagination, filters, passenger coordinate omission, audit list shape, permission matrix | **Passed** |
| `console.permissions.test.ts` | Express `requirePermission` probes for booking history / ledgers / reports / audit | **Passed** |
| `console.db.test.ts` | PostgreSQL aggregates, passenger search, booking detail, audit filter, sensitive-field absence | **Passed** |

**Command:**  
`npx vitest run src/modules/admin/console.test.ts src/modules/admin/console.permissions.test.ts src/modules/admin/console.db.test.ts`  

**Outcome:** 3 files, **17 tests passed**.

`npx tsc -p tsconfig.json --noEmit` — clean.

---

## 7. Remaining backend gaps (post–Phase 0)

- Live operations board API (SEARCHING / offers / fee-pending timers) for `MonitorOperations`  
- Admin session refresh preserving `mfa` / `mfaAt` (or documented forced re-MFA)  
- Paginated rider directory (all verification statuses) beyond applications queue  
- `GET /admin/payments` unified payment browser (fee + token)  
- `ManagePlatformConfig` / dedicated `ManageRiderDocuments` routes (or deprecate)  
- Staff notification broadcast  
- OpenAPI/Swagger path annotations for new admin console routes  

---

## 8. Recommended frontend integration sequence

1. **Auth shell** — existing `/admin/auth/*`, MFA, `GET /admin/me` (role-based nav).  
2. **Overview** — `GET /admin/analytics` (+ Finance may prefer `/admin/financial-reports`).  
3. **Passengers** — list/get + wire existing suspend/reinstate.  
4. **Bookings** — list/get; trip GPS remains separate gated route.  
5. **Finance** — existing refunds/packages/purchases + new `token-ledgers` / `financial-reports`.  
6. **Audit** — Super-only `audit-logs` browser.  
7. **Live ops / geo / zones** — use existing APIs; live board waits on remaining backend gap.

Do **not** start the admin SPA until product confirms Phase 0 review of this report.

---

## 9. Restrictions respected

- No admin frontend built  
- No deploy / no push to main  
- No production configuration changes  
- No service-zone activation  
- No payment/refund initiation  
- Ghana/maps WIP left in stash, untouched on this branch  
