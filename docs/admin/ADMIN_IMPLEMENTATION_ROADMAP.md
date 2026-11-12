# Cyrlo Ride — Admin Dashboard Implementation Roadmap

**Date:** 2026-11-12  
**Depends on:** `ADMIN_DASHBOARD_REQUIREMENTS.md`, `ADMIN_API_INVENTORY.md`, `ADMIN_ROLE_PERMISSION_MATRIX.md`  
**Constraint:** Backend-first where APIs are missing; UI must not invent privileges.

### Baseline (this audit)

- Local `main` may lag `origin/main` (`d5aae37` on remote/staging at audit time; local often at `b1fcbef` until pull).
- Staging verified at `d5aae37` with health 200.
- Unrelated Ghana geographic WIP may exist locally — keep out of admin branches unless explicitly scoped.
- No admin SPA exists (`admin/README.md` placeholder only).

---

## Phase 0 — Backend and security gaps

**Scope:** Close blockers that make a dashboard unsafe or hollow.

| Work | Detail |
| --- | --- |
| Admin session refresh | Ensure staff refresh preserves `mfa` / `mfaAt` **or** document forced re-MFA and disable passenger refresh for admin UI |
| Permission/route alignment | Implement or deprecate unused permissions: `ViewBookingHistory`, `ViewTokenLedgers`, `ViewFinancialReports`, `ManagePlatformConfig`, `ManageRiderDocuments` |
| Audit log read API | Paginated `GET /admin/audit-logs` with filters (actor, action, entity, time) — Super initially |
| Analytics read API | Read-only aggregates for Overview KPIs (connection-fee SUCCESS sums, booking status counts, pending applications) |
| Passenger list/get | `GET /admin/passengers` (+ by id) — Ops/Super; no PII beyond existing profile fields |
| Admin bookings list/get | Honor `ViewBookingHistory` |
| Live ops list | SEARCHING/ACCEPTED/fee-pending summaries for `MonitorOperations` without leaking coords to Finance |

**Security:** All new routes behind existing permission middleware; recent MFA where data is sensitive.  
**Acceptance:** OpenAPI/contract notes updated; unit tests for authz denials per role.  
**Testing:** Permission matrix tests; no live Paystack; no zone activation in CI.

---

## Phase 1 — Admin foundation and authentication

**Scope:** New admin web app shell (suggested location: `admin/` or `apps/cyrlo_admin`).

**Frontend:**
- Login: OTP → MFA enroll/verify → store staff tokens securely
- Recent-MFA step-up modal for gated actions
- `GET /admin/me` → role-based nav (matrix)
- Error/empty/loading layouts; environment banner (staging)

**Backend dependencies:** Phase 0 session fix strongly preferred.  
**Security:** No Maps privileged keys; CSRF/XSS hygiene; short idle timeout aligned with JWT TTL.  
**Acceptance:** Super Admin can sign in on staging with review MFA flow; Ops/Finance/Support see different nav.  
**Testing:** Playwright/Cypress smoke on auth only; no SMS to non-allowlisted numbers.

---

## Phase 2 — Overview and analytics

**Scope:** KPI home page using Phase 0 aggregates.

**UI:** Cards for connection-fee collected (GHS), pending fees, SEARCHING count, pending rider apps, refunds outstanding, token purchase volume — with definitions from Requirements §5.  
**Roles:** Super + Ops (ops metrics); Finance (fee/token/refund KPIs); Support (open disputes count if exposed).  
**Acceptance:** Numbers match SQL spot-checks on staging replicas; no “transport fare” charts.  
**Testing:** Contract tests on aggregate endpoint; fixture-based UI tests.

---

## Phase 3 — Passenger and rider management

**Scope:**
- Riders: wire existing applications review, vehicle review, docs/Ghana Card (step-up), zone approvals, suspend
- Passengers: list/detail (new APIs) + suspend/reinstate

**Backend dependencies:** Passenger list/get; optional rider directory.  
**Security:** Identity viewers audited; mask Ghana Card by default.  
**Acceptance:** Ops can approve a pending application and suspend a test user on staging.  
**Testing:** Role denial for Finance on review routes; MFA required for doc open.

---

## Phase 4 — Live operations and bookings

**Scope:**
- Live board: SEARCHING, open offers, ACCEPTED awaiting fee, expiry timers
- Bookings browser: filter by status/zone/date; detail without fabricating fare
- Optional: staff subscribe to booking rooms or poll

**Backend dependencies:** Live ops + booking list APIs.  
**Privacy:** Hide exact passenger/rider coordinates from Finance; Ops may see pickup labels; full GPS only via existing gated endpoints.  
**Acceptance:** Ops sees a SEARCHING booking created by QA passenger without payment smoke.  
**Testing:** Polling/reconnect; empty board state.

---

## Phase 5 — Geography and service-zone management

**Scope:** Highest API readiness — build early or in parallel after Phase 1.

**UI:**
- Geo tree browser + community editor
- Import preview/confirm (Super)
- Zone map preview (GeoJSON), submit-review, verify (Super), lock/suspend/activate with confirmations
- Rider–zone approvals

**Backend dependencies:** Existing `/admin/geo` and `/admin/service-zones` (prefer admin prefix).  
**Security:** Activate checklist (VERIFIED boundary, community chain); never silent activate.  
**Acceptance:** Ops creates DRAFT zone; Super verifies; Ops activates only when rules pass — **no accidental activate on staging without Ops approval**.  
**Testing:** Lifecycle unit tests already exist; UI confirms error messages for unverified activate.

---

## Phase 6 — Finance and rider tokens

**Scope:**
- Refunds queue, execute, reconcile, cases
- Token packages CRUD
- Purchases list
- Ledgers + financial report views once APIs exist

**Backend dependencies:** Ledger + report endpoints (Phase 0).  
**Security:** Recent MFA on execute/reconcile/package write; Paystack **test** keys for staging.  
**Acceptance:** Finance lists refunds; Support cannot execute.  
**Testing:** Memory/test Paystack only; no real charges in automated suites.

---

## Phase 7 — Support and disputes

**Scope:** Disputes list/detail, recommendations, cancellation requests, trip GPS viewer (step-up).

**Backend dependencies:** Existing dispute admin APIs.  
**Acceptance:** Support recommends NO_REFUND/REFUND_FEE; Finance executes if needed.  
**Testing:** MFA gate; GPS audit action recorded.

---

## Phase 8 — Security, audit logs, system settings

**Scope:**
- Admin users: invite, revoke, list grants (may need list API)
- Audit log browser (Phase 0 API)
- Settings: only if `ManagePlatformConfig` is defined and implemented — otherwise document env-only ops

**Acceptance:** Super invites SUPPORT_ADMIN; revoke works; audit shows zone activate events.  
**Testing:** Super-only access; export limits; PII redaction in audit metadata display.

---

## Suggested sequencing (dependency-aware)

```
Phase 0 (API gaps + session)
    ↓
Phase 1 (Admin app shell + auth)
    ├→ Phase 5 (Geo/Zones)        ← can start as soon as shell exists
    ├→ Phase 3 (Riders first, passengers after list API)
    ├→ Phase 6 (Finance)
    ├→ Phase 7 (Support)
    ├→ Phase 2 (Overview)         ← needs aggregates
    ├→ Phase 4 (Live ops/bookings)← needs list APIs
    └→ Phase 8 (Audit/settings)
```

Adjust if product prioritizes zone ops over finance.

---

## Cross-cutting acceptance criteria (all phases)

1. Role matrix respected in UI and enforced in API.  
2. No destination-fare or transport-GMV metrics.  
3. GH₵1 connection fee labeled as Cyrlo fee, not rider payment for distance.  
4. Unrelated Ghana WIP not mixed into admin PRs unless scoped.  
5. No production secrets in frontend bundles.  
6. Staging QA uses allowlisted OTP/admin MFA — no blast SMS.  
7. Zone activation remains an explicit Ops/Super action — never automated by dashboard deploy.

---

## Out of scope for v1 dashboard

- Replacing Flutter passenger/rider apps  
- Staff push broadcast center  
- Full BI warehouse / Metabase (unless chosen later)  
- Automatic zone activation  
- Collecting or displaying negotiated transport fares as platform revenue
