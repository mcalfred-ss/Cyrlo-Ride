# Cyrlo Ride — Admin Dashboard Requirements

**Date:** 2026-11-12  
**Mode:** READ-ONLY audit and planning (no dashboard build, no code/permission/migration/deploy changes)  
**Companion docs:** `ADMIN_API_INVENTORY.md`, `ADMIN_ROLE_PERMISSION_MATRIX.md`, `ADMIN_IMPLEMENTATION_ROADMAP.md`

---

## 1. Repository and deployment baseline

| Item | Verified value |
| --- | --- |
| Local branch | `main` |
| Local HEAD (before `git fetch` this audit) | `b1fcbef` — *Merge feature/live-rider-discovery into main* |
| `origin/main` (after fetch) | `d5aae37` — *Clarify matching nearby and supply routes in the API contract* |
| Staging VPS checkout | `d5aae37` (matches `origin/main`; **ahead of local** until `git pull`) |
| Staging health | `GET /api/v1/health` → 200 |
| Local unrelated WIP | Ghana maps / food-geo files **present and preserved** (not discarded, not included in this audit’s deliverables as product scope) |
| Frontend apps | Only `apps/cyrlo_app` (passenger + rider). No admin SPA. |
| Admin UI placeholder | `admin/README.md` — “no separate admin SPA… yet” |

**Evidence sources:** `backend/src/app.ts`, `backend/src/composition.ts`, `backend/src/common/authz/permissions.ts`, `backend/src/modules/admin/*`, module route files under payments/wallet/disputes/service-zones/geo/riders/locations, `prisma/schema.prisma`, `admin/README.md`.

**Conclusion:** Admin capability today is **API-only**. Dashboard implementation must call `/api/v1` with staff JWTs after MFA. Do not ship Mapbox / Cyrlo Maps secrets into any admin frontend.

---

## 2. Existing admin architecture (summary)

| Concern | Current state |
| --- | --- |
| Authentication | Phone OTP → MFA enrollment or TOTP/recovery verify → staff access JWT (`role: ADMIN`, `mfa: true`, `mfaAt`) |
| Session | Short-lived access token (`JWT_ACCESS_TTL_SECONDS`, default 900s) + hashed refresh. **Caveat:** `/auth/refresh` does not preserve admin MFA claims — staff should re-login via admin MFA path for privileged work |
| Roles | Prisma/`StaffRole`: `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `SUPPORT_ADMIN` |
| Authorization | `requirePermission` / `requireAnyPermission` against DB `AdminRoleGrant` + enabled MFA credential |
| Recent MFA (“unlock”) | `requireRecentMfa` — `mfaAt` within `ADMIN_RECENT_MFA_SECONDS` (default 900s) for identity docs, refunds, reconcile, dispute recommend, trip GPS |
| Audit | `AuditService.record` writes `AuditLog`; **no HTTP list/query API** (`/audit` router empty) |
| Admin account mgmt | Bootstrap (once), invite/accept, revoke grant, suspend/reinstate passenger/rider users |
| Validation | Zod schemas on admin bodies/params; global API rate limit + OTP limiter |
| Pagination | Present on some list endpoints (disputes, token purchases, zones); **not** a unified admin list pattern |

There is **no** `AdminProfile` model — staff identity is `User` + grants + MFA tables.

Full permission catalog and role maps: see `ADMIN_ROLE_PERMISSION_MATRIX.md`.  
Full endpoint inventory: see `ADMIN_API_INVENTORY.md`.

---

## 3. Module readiness vs dashboard needs

### A. Dashboard and analytics

| Metric | Computable from DB? | Admin API today? |
| --- | --- | --- |
| Total passengers | Yes — `User` where `role=PASSENGER` | **Yes** — `/admin/analytics` **snapshot** (current-state; ignores date window) |
| Registered riders | Yes — `RiderProfile` / `User` RIDER | **Yes** — analytics snapshot |
| Available riders | Approx AVAILABLE + fresh GPS (not full matching) | **Yes** — analytics snapshot `availableApprox` |
| Pending rider applications | Yes — verification pending | **Yes** — applications list + analytics snapshot |
| Bookings by status (SEARCHING, ACCEPTED, …) | Yes — `Booking.status` + indexes | **Yes** — analytics **period** (`createdAt` window) |
| GH₵1 connection-fee revenue | Yes — `Payment` BOOKING_FEE SUCCESS (pesewas) | **Yes** — analytics/financial-reports **period** |
| Pending / failed payments | Yes — `Payment.status` | **Yes** — period connectionFees pending/failed |
| Refunds | Yes — refund models + admin refund list | **Yes** — refund APIs + analytics period by status/amount |
| Token sales / usage | Yes — `TokenPurchase`, `TokenLedgerEntry` | **Yes** — period tokens + `GET /admin/token-ledgers` |

**Rule:** Connection-fee revenue ≠ transport fare. Cyrlo does not collect destination fare — never chart “ride revenue” from booking distance.

**Analytics windows:** Inclusive UTC `from`/`to` on `createdAt` for every **period** series. Snapshot KPIs stay live current-state.

### B. Passenger management

| Capability | Backend |
| --- | --- |
| List / search passengers | **Yes** — `GET /admin/passengers` requires **`ViewBookingHistory` only** |
| Profile / registration detail | **Yes** — `GET /admin/passengers/:id` (`ViewBookingHistory`); no home lat/lng |
| Booking history (admin) | **Yes** — passenger + global booking routes (`ViewBookingHistory`); no exact coords |
| Suspend / reinstate | **Yes** — `POST /admin/users/suspend` \| `reinstate` (`SuspendReinstateRiders`) — **not** directory access |
| Support restrictions / notes | **No** dedicated model beyond disputes/cancel requests |

### C. Rider management

| Capability | Backend |
| --- | --- |
| Pending applications list/detail | **Yes** |
| Approve/reject application & vehicle | **Yes** |
| Identity docs / Ghana Card | **Yes** + recent MFA |
| Zone approvals assign/list/history | **Yes** |
| Availability / location freshness | Location ingest + staff `GET …/location`; no fleet board |
| Token balance | Wallet self-APIs; admin ledger view **missing** |
| Suspend / reinstate | Shared user suspend APIs |
| Performance scores | **Not implemented** |

Onboarding flow (actual): rider submits onboarding → `PENDING_REVIEW` → ops review application/vehicle/docs → approved riders go online with GPS + tokens + zone approval.

### D. Live operations

| Capability | Backend |
| --- | --- |
| Searching bookings / offers | Matching + booking models; **no admin live board API** |
| Accept / fee pending / expiry | Exists in booking/matching/payments services | **No** ops console endpoints |
| Staff GPS for a rider | **Yes** — `MonitorOperations` or `ViewTripGpsEvidence` |
| Trip GPS for dispute | **Yes** — recent MFA |
| Realtime | Socket.IO user/booking rooms; admin is not a first-class subscriber |

**Privacy:** Exact coordinates only for roles/endpoints that already gate GPS (`ViewTripGpsEvidence` / `MonitorOperations` location routes, MFA-gated trip-gps). **Ordinary** `GET /admin/bookings` and booking detail (and passenger booking history) **omit** exact lat/lng for all staff roles, including Ops and Support. Do not expose live fleet lat/lng to Finance/Support by default. Product must approve any future exact coords on ordinary booking-history APIs.

### E. Geography and service zones

| Capability | Backend |
| --- | --- |
| Country → region → district → community CRUD/tree | **Yes** — `/admin/geo` |
| Import preview/confirm | **Yes** — `ManageGeoHierarchy` |
| Zone CRUD, submit-review, verify, lock, suspend, activate, deactivate | **Yes** — `/admin/service-zones` |
| Boundary validation | `validateAndNormalizeBoundary` (no full self-intersection) |
| Activation rules | VERIFIED boundary + ACTIVE/VERIFIED community hierarchy — enforced in service |
| Overlap at activate | Deterministic pick at booking time; **no** activate-time overlap rejection |
| Landmark catalog | Ride Maps landmarks module (not geo admin CRUD) |

**Verify** (`VerifyServiceZones`) is Super Admin–oriented in practice (only Super has that permission). Ops can manage zones but cannot mark boundary verified without Super.

### F. Finance and payments

| Capability | Backend |
| --- | --- |
| Refund list / execute / reconcile | **Yes** (+ recent MFA for execute/reconcile) |
| Reconciliation cases | **Yes** |
| Token packages CRUD | **Yes** (+ recent MFA on write) |
| Token purchases list | **Yes** |
| Financial report aggregates | Permission exists; **no API** |
| Token ledger browse | Permission exists; **no API** |

Finance can inspect payments/refunds/packages without rider review or zone activate rights.

### G. Support and disputes

| Capability | Backend |
| --- | --- |
| List/get disputes | **Yes** |
| Recommend refund/no-refund/escalate | **Yes** (+ recent MFA) |
| Cancellation requests list/recommend | **Yes** |
| Trip GPS evidence | **Yes** (+ recent MFA) |
| Free-form support notes CRM | **No** beyond dispute events / recommendations |

### H. Security and system administration

| Capability | Backend |
| --- | --- |
| Invite / revoke admins | **Yes** (Super) |
| MFA enroll/verify | **Yes** |
| Audit log browser | **Missing** (writes only) |
| Platform config UI API | Permission `ManagePlatformConfig` unused |
| Login history | OTP/audit fragments only; **no** dedicated admin login history API |

---

## 4. Proposed navigation (justified)

Only pages that map to real ops or explicit backend gaps:

| Nav item | Justification |
| --- | --- |
| Overview | Need KPIs; requires **new** aggregate APIs (Phase 2) |
| Live Operations | Matching/booking state exists; needs **new** ops list APIs |
| Riders | Applications + review APIs exist; extend list/search |
| Passengers | Suspend exists; **needs** list/get APIs |
| Bookings | Models/indexes exist; **needs** admin list/get (`ViewBookingHistory`) |
| Geography & Zones | Strongest existing surface — build first against live APIs |
| Finance | Refunds/reconcile/packages exist |
| Rider Tokens | Packages/purchases exist; ledger API gap |
| Support & Disputes | Disputes + cancel requests exist |
| Notifications | User inbox only — **defer** staff broadcast |
| Admin Users & Roles | Invite/revoke/me exist |
| Audit Logs | Requires **new** read API |
| Settings | Mostly env/ops — defer `ManagePlatformConfig` |

Page-level UI detail: filters, empty/loading/error, actions — see roadmap phases. Do not invent pages for “performance leaderboards” until data exists.

---

## 5. Analytics — minimum reliable KPIs (initial)

| KPI | Definition | Source |
| --- | --- | --- |
| Connection fees collected (GHS) | Sum `amountPesewas`/100 where `purpose=BOOKING_FEE` and `status=SUCCESS` | `Payment` |
| Connection fees pending | Count/sum BOOKING_FEE PENDING | `Payment` |
| Successful connections | Bookings reaching ACCEPTED (fee may still be pending) vs COMPLETED | `Booking` |
| Open SEARCHING requests | `status=SEARCHING` and search not expired | `Booking` |
| Pending rider applications | Rider verification pending review | `RiderProfile` |
| Available riders (eligible) | AVAILABLE + fresh GPS + approved — use same eligibility as matching | profiles + locations |
| Refunds outstanding | Authorized/pending refund rows | refund tables |
| Token purchases (GHS) | SUCCESS `TOKEN_PURCHASE` payments | `Payment` / `TokenPurchase` |

**Avoid:** average trip fare, destination completion rate as revenue, “GMV” from passenger–rider cash agreements.

---

## 6. Security requirements for any future UI

1. Staff JWT after MFA only; never Maps API keys in browser env for privileged calls.
2. Backend remains source of truth — hide nav by permission, still enforce on API.
3. Recent-MFA step-up UX for refunds, identity, GPS, dispute recommend, package writes.
4. Confirm destructive actions: suspend, activate zone, execute refund, revoke admin.
5. Coordinate displays: approximate or role-gated; audit GPS views (already audited for trip GPS).
6. Do not log secrets or full Ghana Card numbers in UI telemetry.

---

## 7. Gaps blocking a useful dashboard (priority)

1. No analytics/aggregate endpoints.  
2. No passenger list/search; no admin booking list despite permission.  
3. No audit log read API.  
4. No live operations board API.  
5. Permissions without routes: `ViewBookingHistory`, `ViewTokenLedgers`, `ViewFinancialReports`, `ManagePlatformConfig`, `ManageRiderDocuments`.  
6. Admin refresh-token MFA claim drop via `/auth/refresh`.  
7. No admin frontend application.

Roadmap: `ADMIN_IMPLEMENTATION_ROADMAP.md`.
