# Cyrlo Ride — Phase 1B Implementation Report  
## Admin Overview Dashboard

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Baseline HEAD:** `93bfe7763c749b2de4342b330bad920578dc3f3c` (`feat(admin): complete phase 1a authentication shell`)  
**Mode:** Implementation complete locally — **no commit / push / deploy**

---

## 1. Authorization gate (pre-UI)

| Check | Result |
| --- | --- |
| `ADMIN_ROLE_PERMISSION_MATRIX.md` | Support has payment/dispute visibility aligned with `ViewPayments` |
| Backend `rolePermissionMap` / `permissions.ts` | `SUPPORT_ADMIN` includes `admin.view_payments` |
| `GET /admin/analytics` gate | `anyOf`: MonitorOperations, ViewFinancialReports, InvestigateDisputes, ViewPayments |
| Support receives financial fields? | **Yes** — via `ViewPayments` (and also `InvestigateDisputes`) |
| STOP for unauthorized finance exposure? | **No** — Support is intentionally permitted; full payload is Phase 0 design |

**Decision:** Proceed with Overview UI. Do not hide finance panels client-side for Support; backend remains authority. Ops may also receive fee aggregates via `MonitorOperations` (known Phase 0 behavior; not treated as a silent FE bug).

No backend permission or response-contract changes were made.

---

## 2. Files changed

### Modified
- `apps/cyrlo_admin/src/api/types.ts` — `AdminAnalytics`, fee/refund buckets, `AnalyticsQuery`
- `apps/cyrlo_admin/src/app/router.tsx` — `/overview` → `OverviewPage`
- `apps/cyrlo_admin/src/components/ui.tsx` — `Panel`, `Stat`

### Added
- `apps/cyrlo_admin/src/api/admin-analytics.ts`
- `apps/cyrlo_admin/src/lib/money.ts` + `money.test.ts`
- `apps/cyrlo_admin/src/pages/OverviewPage.tsx` + `OverviewPage.test.tsx`
- `apps/cyrlo_admin/src/features/overview/`
  - `OverviewFilters.tsx`
  - `MetricCards.tsx`
  - `BookingStatusPanel.tsx`
  - `ConnectionFeePanel.tsx`
  - `RefundPanel.tsx`
  - `TokenPanel.tsx`
  - `bookingStatuses.ts` + test
  - `dateRange.ts` + test
- `docs/admin/PHASE_1B_DISCOVERY_REPORT.md` (prior discovery; still untracked)
- `docs/admin/PHASE_1B_IMPLEMENTATION_REPORT.md` (this file)

---

## 3. Components implemented

| Component | Responsibility |
| --- | --- |
| `OverviewPage` | Fetch lifecycle, date query state, loading/empty/error/401/403 |
| `OverviewFilters` | Today / 7d / 30d / All time presets + custom local datetime Apply |
| `MetricCards` | Snapshot passengers/riders + approx availability + period completed connections |
| `BookingStatusPanel` | Zero-filled CSS bar breakdown by booking status |
| `ConnectionFeePanel` | Gross SUCCESS / Pending / Failed GH₵1 fee buckets |
| `RefundPanel` | Refunds by status (separate from gross fees) |
| `TokenPanel` | Token purchases (GHS) vs deductions (token units) |

---

## 4. API contract used

- **Endpoint:** `GET /api/v1/admin/analytics`
- **Query:** optional inclusive UTC `from`, `to` (ISO-8601)
- **Client:** `fetchAdminAnalytics` → shared `apiRequest` (privileged Bearer, MFA session)
- **Types:** mirror backend `getAnalytics` field names (`amountPesewas`, `availableApprox`, `completedConnections`, `exclusions`, etc.)
- **Semantics:**
  - Snapshot (passengers/riders/availableApprox) ignores date filter
  - Period metrics filter on inclusive UTC `createdAt`
  - Gross connection-fee `collected` is not netted against refunds in the UI
  - Transport fares excluded; exclusions note shown
  - No polling / live feed

---

## 5. Role visibility decisions

| Role | Overview nav | Finance panels in Overview |
| --- | --- | --- |
| SUPER_ADMIN | Yes | Shown (full analytics) |
| OPERATIONS_ADMIN | Yes (`MonitorOperations`) | Shown — backend returns full payload |
| FINANCE_ADMIN | Yes (`ViewPayments` / `ViewFinancialReports`) | Shown |
| SUPPORT_ADMIN | Yes (`ViewPayments` / `InvestigateDisputes`) | Shown — intentional; not FE-stripped |

Route remains behind Phase 1A MFA shell + nav `anyOf` matching analytics permissions. 403 from API surfaces as permission denial (no fabricated KPIs). 401 → session-expired.

---

## 6. Test results

Commands (`apps/cyrlo_admin`):

| Command | Result |
| --- | --- |
| `npm test` | **41 passed** (11 files) |
| `npm run typecheck` | **Pass** |
| `npm run build` | **Pass** (Vite production build) |

Coverage added for:
- Successful analytics load + financial label separation
- Date filter query (`from`/`to` present; all-time omits params)
- Empty period messaging with snapshot retained
- Network/API error + Retry
- Privileged 401 → session-expired
- 403 → permission denial without KPI fabrication
- Support-capable payload still shows fee/refund/token panels
- Pesewas → GH₵ formatting; booking status zero-fill; date helpers

---

## 7. Remaining gaps

| Gap | Notes |
| --- | --- |
| Day/trend charts | No backend time-series — out of Phase 1B |
| Live activity feed | No endpoint — intentionally omitted |
| Net connection fees field | Not first-class; UI keeps gross + refunds separate |
| Ops finance payload breadth | Backend still returns fee aggregates to Ops via `MonitorOperations`; product may later split APIs |
| ABANDONED fee bucket | Footnoted via exclusions only |
| Manual MFA smoke vs local API | Not re-run in this pass (unit/build verification only) |
| Commit | Not created (per restrictions) |

---

## 8. Baseline / stash

| Check | Result |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD unchanged | `93bfe77…` (working tree dirty with 1B files only) |
| Ghana/maps stash | Intact: `stash@{0}: wip-ghana-maps-preserve-phase0` |
| Flutter / migrations / deploy | Untouched |

---

**Stop for review.** Phase 1B Overview only — awaiting approval before commit.
