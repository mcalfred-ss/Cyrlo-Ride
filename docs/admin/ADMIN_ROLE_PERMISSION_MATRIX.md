# Cyrlo Ride — Admin Role Permission Matrix

**Date:** 2026-11-12  
**Source of truth:** `backend/src/common/authz/permissions.ts`, `backend/src/common/types/staff-roles.ts`  
**Rule:** Frontend nav visibility must mirror this matrix but **never** replace backend checks.

Staff roles in code (not snake_case):

| Product name | Code enum |
| --- | --- |
| super_admin | `SUPER_ADMIN` |
| operations_admin | `OPERATIONS_ADMIN` |
| finance_admin | `FINANCE_ADMIN` |
| support_admin | `SUPPORT_ADMIN` |

---

## 1. Permission catalog (implemented in code)

| Permission constant | String value | Routed today? |
| --- | --- | --- |
| ViewAdminProfile | `admin.view_own_profile` | Yes — `GET /admin/me` |
| ManageAdmins | `admin.manage_admins` | Yes — invite/revoke + `GET /admin/audit-logs` |
| ManagePlatformConfig | `admin.manage_platform_config` | **No route** |
| ReviewRiders | `admin.review_riders` | Yes |
| ManageRiderDocuments | `admin.manage_rider_documents` | **No dedicated route** (docs use AccessIdentityDocuments) |
| SuspendReinstateRiders | `admin.suspend_reinstate_riders` | Yes — users suspend/reinstate only (not passenger directory) |
| ManageServiceZones | `admin.manage_service_zones` | Yes |
| ManageGeoHierarchy | `admin.manage_geo_hierarchy` | Yes — Super-oriented |
| VerifyServiceZones | `admin.verify_service_zones` | Yes — verify only |
| ViewGeoCoverage | `admin.view_geo_coverage` | Yes — read zones/geo |
| MonitorOperations | `admin.monitor_operations` | Partial — staff location + analytics anyOf |
| ViewPayments | `admin.view_payments` | Yes — refunds/cases/purchases + analytics anyOf |
| ReconcilePaystack | `admin.reconcile_paystack` | Yes |
| ManageTokenPackages | `admin.manage_token_packages` | Yes |
| ViewTokenLedgers | `admin.view_token_ledgers` | Yes — `GET /admin/token-ledgers` |
| ExecuteRefunds | `admin.execute_refunds` | Yes |
| ViewFinancialReports | `admin.view_financial_reports` | Yes — `/admin/financial-reports` + analytics anyOf |
| InvestigateDisputes | `admin.investigate_disputes` | Yes + analytics anyOf |
| ViewBookingHistory | `admin.view_booking_history` | Yes — passengers list/get, bookings list/get, passenger booking/cancel history |
| ViewTripGpsEvidence | `admin.view_trip_gps_evidence` | Yes — trip GPS (+ location any); **not** ordinary booking lat/lng |
| RecommendRefunds | `admin.recommend_refunds` | Yes |
| RecordSupportDecisions | `admin.record_support_decisions` | Yes — cancel requests |
| AccessIdentityDocuments | `admin.access_identity_documents` | Yes |

---

## 2. Role → granted permissions (as coded)

### SUPER_ADMIN
All permissions in the catalog.

### OPERATIONS_ADMIN
ViewAdminProfile, ReviewRiders, ManageRiderDocuments, SuspendReinstateRiders, ManageServiceZones, ViewGeoCoverage, MonitorOperations, AccessIdentityDocuments, ViewBookingHistory.

**Does not have:** ManageAdmins, ManageGeoHierarchy, VerifyServiceZones, finance execute/reconcile, dispute investigate (unless also granted separately — grants are single staffRole per active grant model; see invitations).

### FINANCE_ADMIN
ViewAdminProfile, ViewPayments, ReconcilePaystack, ManageTokenPackages, ViewTokenLedgers, ExecuteRefunds, ViewFinancialReports, ViewGeoCoverage.

**Does not have:** rider review, zone activate, identity docs, disputes investigate, MonitorOperations.

### SUPPORT_ADMIN
ViewAdminProfile, InvestigateDisputes, ViewBookingHistory, ViewTripGpsEvidence, RecommendRefunds, RecordSupportDecisions, ViewPayments, ViewGeoCoverage.

**Does not have:** ExecuteRefunds, ManageServiceZones, ReviewRiders, ManageAdmins.

---

## 3. Module access matrix (dashboard planning)

Legend: **V** view · **C** create · **U** update · **A** approve/verify · **S** suspend/lock · **G** activate/go-live · **R** refund execute · **P** manage permissions  
**—** none · **Y** yes via existing permission · **P*** permission exists but **API missing** · **N** not in role map · **NEW** would need new permission (**NOT IMPLEMENTED**)

| Module | Super | Ops | Finance | Support |
| --- | --- | --- | --- | --- |
| Overview KPIs | Y `/admin/analytics` | Y (MonitorOps) | Y (finance reports / ViewPayments) | Y (Investigate/ViewPayments) |
| Live operations board | NEW API | MonitorOps partial | N | N (except GPS evidence) |
| Riders applications | Y | Y | N | N |
| Rider identity docs | Y | Y (+ MFA) | N | N |
| Rider/passenger suspend | Y | Y | N | N |
| Passengers list | Y (`ViewBookingHistory`) | Y | N | Y (`ViewBookingHistory`; no suspend) |
| Bookings browser | Y (no exact coords) | Y (no exact coords) | N | Y (no exact coords; trip-gps separate) |
| Geo hierarchy write | Y | N (read via coverage) | V coverage | V coverage |
| Zone manage / activate | Y | Y | V only | V only |
| Zone boundary verify | Y | N | N | N |
| Payments / refunds view | Y | N | Y | Y (view) |
| Refund execute | Y | N | Y (+ MFA) | N |
| Token packages | Y | N | Y | N |
| Token ledgers | Y | N | Y | N |
| Financial reports | Y | N (ops via analytics anyOf only) | Y | N (support via analytics anyOf only) |
| Disputes | Y | N | N | Y |
| Recommend refund | Y | N | N | Y (+ MFA) |
| Execute after recommend | Y / Finance | N | Y | N |
| Trip GPS | Y | via Monitor/ViewTrip | N | Y (+ MFA) |
| Admin users / roles | Y (P) | N | N | N |
| Audit log browser | NEW API | NEW? | NEW? | NEW? |
| Platform settings | P* unused | N | N | N |

---

## 4. Actions requiring confirmation / recent MFA / elevation

| Action | Confirm UI | Recent MFA (backend) | Elevated role |
| --- | --- | --- | --- |
| Bootstrap / invite Super | Ops process | — | Secret / Super |
| Revoke admin grant | Yes | — | Super |
| Suspend / reinstate user | Yes | — | Ops / Super |
| Open Ghana Card / docs | Yes | **Required** | Ops / Super |
| Staff rider location | Yes (privacy) | Not always | Ops / Support GPS |
| Trip GPS | Yes | **Required** | Support / Super |
| Zone activate | Yes + checklist | — | Ops / Super |
| Zone verify boundary | Yes | — | **Super** (`VerifyServiceZones`) |
| Execute refund | Yes | **Required** | Finance / Super |
| Reconcile Paystack | Yes | **Required** | Finance / Super |
| Token package write | Yes | **Required** | Finance / Super |
| Dispute / cancel recommend | Yes | **Required** | Support / Super |

---

## 5. Proposed new permissions (NOT IMPLEMENTED)

Do **not** treat these as available:

| Proposed | Reason |
| --- | --- |
| `admin.view_analytics` | No aggregate API yet; could reuse ViewFinancialReports + MonitorOperations temporarily |
| `admin.list_passengers` | No passenger directory |
| `admin.manage_notifications` | No staff broadcast |
| `admin.view_audit_logs` | Audit read API missing |
| `admin.live_operations` | Could start as MonitorOperations once board API exists |

Any new permission requires backend catalog + role map + route middleware changes (out of scope for this planning audit).

---

## 6. Frontend implications

1. After login, call `GET /admin/me` and derive nav from **server-returned role/permissions**, not a hardcoded client map alone.  
2. Hide Finance refund buttons from Support; hide Zone Activate from Finance.  
3. For `P*` cells, show “Coming soon” or omit until APIs land — do not fake data.  
4. Super Admin is the only role that should see Admin Users + Zone Verify + Geo hierarchy writes.
