# Cyrlo Ride — Admin API Inventory

**Date:** 2026-11-12  
**Base path:** `/api/v1`  
**Evidence:** `backend/src/app.ts`, module `*.routes.ts` / controllers / schemas, `permissions.ts`  
**Status legend:** IMPLEMENTED = route exists; TESTED = covered by module unit/db tests in-repo (not a claim of staging E2E); SAFE FOR UI = suitable for dashboard integration with noted caveats

All privileged staff routes require: `authenticate` + active account + `ADMIN` + access purpose + `mfa: true` + DB grant + enabled MFA — unless marked public.

---

## 1. Admin authentication and MFA

| Method | Route | Purpose | Auth / permission | Request | Response (shape) | Pagination | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/admin/bootstrap` | One-shot Super Admin create | Public + bootstrap secret | phone, displayName?, secret | user + enrollmentToken | — | IMPLEMENTED; SAFE (ops-only; disable when complete) |
| POST | `/admin/invitations/accept` | Accept invite → enrollment | Public + invite token | token, displayName? | enrollmentToken | — | IMPLEMENTED; SAFE |
| POST | `/admin/auth/otp` | Request admin OTP | Public + OTP rate limit | phone | ok / challenge | — | IMPLEMENTED; SAFE |
| POST | `/admin/auth/otp/verify` | Verify OTP → MFA pending/enroll | Public + OTP rate limit | phone, code | mfaToken / enrollment | — | IMPLEMENTED; SAFE |
| POST | `/admin/auth/mfa/verify` | TOTP or recovery → session | Public + mfaToken | mfaToken, code | access + refresh | — | IMPLEMENTED; SAFE |
| POST | `/admin/mfa/enroll/start` | Begin TOTP enroll | Enrollment Bearer | — | secret/otpauth (handle carefully) | — | IMPLEMENTED; SAFE with secret hygiene |
| POST | `/admin/mfa/enroll/confirm` | Confirm TOTP | Enrollment Bearer | code | recovery codes once | — | IMPLEMENTED; SAFE |

**Caveat:** Do not use passenger `/auth/refresh` alone for long admin sessions — MFA claims are not preserved on that path.

---

## 2. Admin users and roles

| Method | Route | Purpose | Permission | Request | Notes | Status |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/admin/invitations` | Invite staff | `ManageAdmins` (+ Super only in service) | phone, staffRole | Cannot self-grant SUPER_ADMIN | IMPLEMENTED; SAFE |
| POST | `/admin/grants/revoke` | Revoke staff grant | `ManageAdmins` (+ Super) | userId / grant | | IMPLEMENTED; SAFE |
| GET | `/admin/me` | Current staff profile + role | `ViewAdminProfile` | — | | IMPLEMENTED; SAFE |
| POST | `/admin/users/suspend` | Suspend passenger or rider | `SuspendReinstateRiders` | userId, reason? | Not for ADMIN users | IMPLEMENTED; SAFE |
| POST | `/admin/users/reinstate` | Reinstate suspended user | `SuspendReinstateRiders` | userId | Must be SUSPENDED | IMPLEMENTED; SAFE |

**Missing (needed for UI):** `GET /admin/users` (list/filter by role/status), `GET /admin/users/:id`, admin booking history for a user.

---

## 3. Riders (applications, identity, zones, location)

Mounted under `/admin/riders` (ops + zone + locations routers).

| Method | Route | Purpose | Permission | Notes | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/admin/riders/applications` | Pending applications | `ReviewRiders` | | IMPLEMENTED; SAFE |
| GET | `/admin/riders/applications/:riderId` | Application detail | `ReviewRiders` | | IMPLEMENTED; SAFE |
| POST | `/admin/riders/applications/:riderId/review` | Approve/reject rider | `ReviewRiders` | body review schema | IMPLEMENTED; SAFE |
| POST | `/admin/riders/vehicles/:vehicleId/review` | Approve/reject vehicle | `ReviewRiders` | | IMPLEMENTED; SAFE |
| GET | `/admin/riders/documents/:documentId/content` | Open identity document | `AccessIdentityDocuments` + **recent MFA** | Sensitive | IMPLEMENTED; SAFE with step-up UX |
| GET | `/admin/riders/applications/:riderId/ghana-card` | Reveal Ghana Card | `AccessIdentityDocuments` + **recent MFA** | Highly sensitive | IMPLEMENTED; SAFE with step-up + audit |
| GET | `/admin/riders/:riderId/zone-approvals` | Current zone approvals | `ManageServiceZones` | | IMPLEMENTED; SAFE |
| GET | `/admin/riders/:riderId/zone-approvals/history` | Approval history | `ManageServiceZones` | | IMPLEMENTED; SAFE |
| GET | `/admin/riders/:riderId/location` | Staff GPS read | `MonitorOperations` **or** `ViewTripGpsEvidence` | Exact coords; privacy-sensitive | IMPLEMENTED; SAFE for Ops/Support GPS roles only |

**Missing:** paginated rider directory (all statuses), token balance admin view, performance metrics.

---

## 4. Service zones

Router mounted at **`/admin/service-zones` and `/service-zones`** (duplicate). Prefer `/admin/service-zones` in the dashboard.

| Method | Route | Purpose | Permission | Status |
| --- | --- | --- | --- | --- |
| POST | `/admin/service-zones` | Create zone (always DRAFT) | `ManageServiceZones` | IMPLEMENTED; SAFE |
| GET | `/admin/service-zones` | List/filter zones | Manage **or** `ViewGeoCoverage` | IMPLEMENTED; SAFE; pagination/query schema |
| GET | `/admin/service-zones/:zoneId` | Get zone | Manage **or** ViewGeoCoverage | IMPLEMENTED; SAFE |
| PATCH | `/admin/service-zones/:zoneId` | Update (boundary only in DRAFT) | `ManageServiceZones` | IMPLEMENTED; SAFE |
| POST | `…/submit-review` | DRAFT → UNDER_REVIEW | `ManageServiceZones` | IMPLEMENTED; SAFE |
| POST | `…/verify` | Mark boundary VERIFIED | `VerifyServiceZones` | IMPLEMENTED; SAFE (Super) |
| POST | `…/lock` | Lock inactive | `ManageServiceZones` | IMPLEMENTED; SAFE |
| POST | `…/suspend` | Suspend ACTIVE | `ManageServiceZones` | IMPLEMENTED; SAFE |
| POST | `…/activate` | Go-live (strict checks) | `ManageServiceZones` | IMPLEMENTED; SAFE — UI must confirm |
| POST | `…/deactivate` | Compatibility alias | `ManageServiceZones` | IMPLEMENTED; SAFE |
| POST | `…/rider-approvals` | Assign rider to zone | `ManageServiceZones` | IMPLEMENTED; SAFE |
| GET | `…/rider-approvals` | List zone riders | `ManageServiceZones` | IMPLEMENTED; SAFE |
| POST | `/admin/service-zones/rider-approvals/:approvalId/approve` | Approve pending | `ManageServiceZones` | IMPLEMENTED; SAFE |
| POST | `…/reject` | Reject | `ManageServiceZones` | IMPLEMENTED; SAFE |
| POST | `…/revoke` | Revoke | `ManageServiceZones` | IMPLEMENTED; SAFE |

---

## 5. Geography hierarchy

Prefix: `/admin/geo`

| Method | Route | Purpose | Permission bundle | Status |
| --- | --- | --- | --- | --- |
| GET | `/admin/geo/tree` | Hierarchy tree | Geo read | IMPLEMENTED; SAFE |
| POST | `/admin/geo/imports/preview` | Import preview | `ManageGeoHierarchy` | IMPLEMENTED; SAFE |
| POST | `/admin/geo/imports/confirm` | Import confirm | `ManageGeoHierarchy` | IMPLEMENTED; SAFE |
| GET/POST | `/admin/geo` | List/create countries | read / `ManageGeoHierarchy` | IMPLEMENTED; SAFE |
| GET/PATCH | `/admin/geo/:id` | Get/update country | read / ManageGeoHierarchy | IMPLEMENTED; SAFE |
| GET/POST | `/admin/geo/regions` | List/create | read / ManageGeoHierarchy | IMPLEMENTED; SAFE |
| GET/PATCH | `/admin/geo/regions/:id` | Get/update | read / ManageGeoHierarchy | IMPLEMENTED; SAFE |
| GET/POST | `/admin/geo/districts` | List/create | read / ManageGeoHierarchy | IMPLEMENTED; SAFE |
| GET/PATCH | `/admin/geo/districts/:id` | Get/update | read / ManageGeoHierarchy | IMPLEMENTED; SAFE |
| GET/POST | `/admin/geo/communities` | List/create | read / community write (ManageServiceZones **or** ManageGeoHierarchy) | IMPLEMENTED; SAFE |
| GET/PATCH | `/admin/geo/communities/:id` | Get/update | same | IMPLEMENTED; SAFE |

Landmarks are **not** administered here (Maps module catalog).

---

## 6. Payments, refunds, reconciliation

Prefix: `/admin/payments`

| Method | Route | Purpose | Permission | Recent MFA? | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/admin/payments/refunds` | List refunds | `ViewPayments` | No | IMPLEMENTED; SAFE |
| GET | `/admin/payments/refunds/:refundId/reconciliation-attempts` | Attempt history | `ViewPayments` | No | IMPLEMENTED; SAFE |
| POST | `/admin/payments/refunds/:refundId/execute` | Execute refund | `ExecuteRefunds` | **Yes** | IMPLEMENTED; SAFE with confirm UI |
| POST | `/admin/payments/refunds/:refundId/reconcile` | Reconcile | `ReconcilePaystack` | **Yes** | IMPLEMENTED; SAFE |
| GET | `/admin/payments/reconciliation/cases` | List cases | `ViewPayments` | No | IMPLEMENTED; SAFE |
| POST | `/admin/payments/reconciliation/cases/:caseId/resolve` | Resolve case | `ReconcilePaystack` | **Yes** | IMPLEMENTED; SAFE |

**Missing:** `GET /admin/payments` (booking-fee + token payments filter), revenue summary endpoints.

---

## 7. Rider tokens (wallet admin)

Mounted under `/admin`

| Method | Route | Purpose | Permission | Recent MFA? | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/admin/token-packages` | List packages | `ManageTokenPackages` | No | IMPLEMENTED; SAFE |
| POST | `/admin/token-packages` | Create package | `ManageTokenPackages` | **Yes** | IMPLEMENTED; SAFE |
| PATCH | `/admin/token-packages/:packageId` | Update package | `ManageTokenPackages` | **Yes** | IMPLEMENTED; SAFE |
| GET | `/admin/token-purchases` | List purchases | `ViewPayments` | No | IMPLEMENTED; SAFE; page + status filter |

**Missing:** `GET /admin/token-ledgers` despite `ViewTokenLedgers`.

---

## 8. Disputes and support

Mounted under `/admin`

| Method | Route | Purpose | Permission | Recent MFA? | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/admin/disputes` | List disputes | `InvestigateDisputes` | No | IMPLEMENTED; SAFE; query schema |
| GET | `/admin/disputes/:disputeId` | Detail + evidence summary | `InvestigateDisputes` | No | IMPLEMENTED; SAFE |
| POST | `/admin/disputes/:disputeId/recommend` | Support recommendation | `RecommendRefunds` | **Yes** | IMPLEMENTED; SAFE |
| GET | `/admin/bookings/:bookingId/trip-gps` | Full trip GPS points | `ViewTripGpsEvidence` | **Yes** | IMPLEMENTED; SAFE — Ops/Support only |
| GET | `/admin/cancellation-requests` | List cancel reviews | Investigate **or** RecordSupportDecisions | No | IMPLEMENTED; SAFE |
| POST | `/admin/cancellation-requests/:requestId/recommend` | Recommend / optionally cancel | `RecordSupportDecisions` | **Yes** | IMPLEMENTED; SAFE |

**Missing:** admin booking list/get for general history (`ViewBookingHistory`).

---

## 9. Audit and notifications

| Method | Route | Purpose | Status |
| --- | --- | --- | --- |
| — | `/audit` | Mounted empty router | **NOT IMPLEMENTED** (writes via `AuditService` only) |
| — | Staff notification broadcast | — | **NOT IMPLEMENTED** (user `/notifications/*` only) |

---

## 10. Analytics / live operations / passengers / Phase 0 console

| Method | Route | Permission | Notes | Status |
| --- | --- | --- | --- | --- |
| GET | `/admin/analytics` | any of MonitorOperations, ViewFinancialReports, InvestigateDisputes, ViewPayments | Response splits **`snapshot`** (current-state; ignores `from`/`to`) vs **`period`** (bookings, fees, refunds, tokens; inclusive UTC `createdAt` bounds). No transport-fare revenue. | IMPLEMENTED |
| GET | `/admin/financial-reports` | ViewFinancialReports | Finance slice of period connection fees / refunds / tokens | IMPLEMENTED |
| GET | `/admin/passengers` | **ViewBookingHistory only** | Paginated list/search (`q`, `status`). Suspend is **not** an alternate gate. | IMPLEMENTED |
| GET | `/admin/passengers/:passengerId` | **ViewBookingHistory only** | Profile without home coordinates | IMPLEMENTED |
| GET | `/admin/passengers/:id/bookings` | ViewBookingHistory | No exact lat/lng | IMPLEMENTED |
| GET | `/admin/passengers/:id/cancellations` | ViewBookingHistory | Cancel-request history | IMPLEMENTED |
| GET | `/admin/bookings` | ViewBookingHistory | Filters status/date/ids; **no exact coordinates** for any role | IMPLEMENTED |
| GET | `/admin/bookings/:bookingId` | ViewBookingHistory | Detail + payments + status history; **no exact coordinates** | IMPLEMENTED |
| GET | `/admin/audit-logs` | ManageAdmins | Super; read-only | IMPLEMENTED |
| GET | `/admin/token-ledgers` | ViewTokenLedgers | Finance ledger browse | IMPLEMENTED |

| Still missing | Exists? |
| --- | --- |
| Live SEARCHING / offers board | **No** |

**Booking coordinate privacy (Phase 0 review fix S2):** Ordinary booking-history endpoints never return latitude/longitude. Labels and operational fields remain. Precise trails stay on MFA-gated `GET /admin/bookings/:bookingId/trip-gps` (`ViewTripGpsEvidence`). Enabling exact coords on ordinary booking list/detail requires a separate product/security decision.

**Analytics date filters (A1):** `from`/`to` are inclusive UTC ISO instants on `createdAt` for **all period metrics**. Snapshot passenger/rider counts ignore the window and must not be charted as historical.

---

## 11. Grouping for frontend modules

| Dashboard module | Primary endpoints |
| --- | --- |
| Auth shell | `/admin/auth/*`, `/admin/mfa/*`, `/admin/me` |
| Admin users | invitations, grants/revoke |
| Riders | `/admin/riders/*` |
| Passengers | `/admin/passengers*` + suspend/reinstate |
| Bookings / overview | `/admin/bookings*`, `/admin/analytics` |
| Zones | `/admin/service-zones/*` |
| Geography | `/admin/geo/*` |
| Finance | `/admin/payments/*`, token packages/purchases/ledgers, `/admin/financial-reports` |
| Support | `/admin/disputes/*`, cancellation-requests, trip-gps, passengers/bookings (no exact coords) |
| Live ops / Audit | Live board still missing; audit-logs Super-only |

---

## 12. Testing notes

- Admin MFA, RBAC, zone lifecycle, geo, refunds, and disputes have substantial **unit** coverage under respective `module.test.ts` / db tests.
- Inventory does **not** claim staging browser E2E for admin (no admin UI).
- Do not mark an endpoint “production-ready for refunds” without Paystack **test-mode** confirmation (separate payment audits).
