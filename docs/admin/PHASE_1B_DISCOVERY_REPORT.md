# Cyrlo Ride — Phase 1B Discovery Report  
## Admin Overview Dashboard (READ-ONLY)

**Date:** 2026-11-12  
**Mode:** Discovery / planning only — no application source changes, no migrations, no deploy  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `93bfe7763c749b2de4342b330bad920578dc3f3c` — `feat(admin): complete phase 1a authentication shell`  
**Phase 0 parent:** `545f455` (ancestor of Phase 1A — verified)

---

## 1. Repository baseline verification

| Check | Result |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | `93bfe77` (matches expected Phase 1A commit) |
| Phase 0 relationship | `545f455` is an ancestor of `93bfe77` |
| Working tree | Clean |
| Staged | None |
| Ghana/maps stash | Intact: `stash@{0}: wip-ghana-maps-preserve-phase0` |

### Existing admin frontend (Phase 1A)

| Area | Location / notes |
| --- | --- |
| App | `apps/cyrlo_admin` — Vite + React 19 + TS + Tailwind 4 + React Router 7 |
| Auth | `AuthProvider`, in-memory session, MFA-gated `RequireMfaSession` |
| API client | `src/api/client.ts` + typed helpers; envelope `{ success, data }` / `{ error }` |
| Overview route today | `/overview` → `PlaceholderPage` (“Analytics KPIs land in a later phase.”) |
| Nav gate | `nav.ts` Overview `anyOf`: MonitorOperations, ViewFinancialReports, InvestigateDisputes, ViewPayments |
| UI primitives | `components/ui.tsx` (Button, Field, ErrorBanner, PageCard) |
| Data fetching libs | **None** (no TanStack Query) — intentional for 1A; 1B can stay on `fetch` + local state |
| Chart libs | **None** |

**Baseline matches expectations.** Proceed with discovery.

---

## 2. Analytics API audit

### 2.1 Route registration

| Item | Value |
| --- | --- |
| Method / path | `GET /api/v1/admin/analytics` |
| Mount | `createAdminRouter` → `api.use('/admin', modules.admin.router)` |
| Handler | `AdminConsoleController.analytics` → `AdminConsoleService.getAnalytics` |
| Related | `GET /api/v1/admin/financial-reports` — finance slice of the same aggregates (`ViewFinancialReports` only) |

### 2.2 Auth / MFA / permissions

Middleware chain (order):

1. `authenticate` — Bearer access JWT  
2. `requireActiveAccount`  
3. `requireAnyPermission(`  
   - `MonitorOperations`  
   - `ViewFinancialReports`  
   - `InvestigateDisputes`  
   - `ViewPayments`  
   `)`  

`requireAnyPermission` / `requirePermission` enforce **staff MFA**:

- `role === 'ADMIN'`, `purpose === 'access'`, `mfa === true`  
- Active grant + MFA enrolled  
- Else **403** `Administrator MFA session is required` (not 401)

Frontend must map privileged **401** → session expired (already done) and **403** MFA-required → treat as access denial / re-auth, not as “empty dashboard.”

### 2.3 Query parameters

`analyticsQuerySchema` (strict):

| Param | Type | Semantics |
| --- | --- | --- |
| `from` | optional ISO-8601 datetime | Inclusive UTC start on **period** metrics’ `createdAt` |
| `to` | optional ISO-8601 datetime | Inclusive UTC end on **period** metrics’ `createdAt` |

Service also rejects:

- Invalid datetime → `400 VALIDATION_ERROR`  
- `from` > `to` → `400 VALIDATION_ERROR`  

**Snapshot metrics ignore `from`/`to`.** Documented in `ANALYTICS_DATE_RANGE_SEMANTICS` and response `dateRange`.

### 2.4 Response envelope

Success: `{ success: true, data: <analytics> }` via `sendSuccess`.

### 2.5 Exact `data` shape (from `getAnalytics`)

```ts
{
  generatedAt: string; // ISO now
  dateRange: {
    from: string | null;
    to: string | null;
    timezone: 'UTC';
    boundInclusivity: 'inclusive';
    field: 'createdAt';
    interpretation: string;
  };
  snapshot: {
    passengers: { total: number; active: number; suspended: number };
    riders: {
      registered: number;
      availableApprox: number; // APPROVED + AVAILABLE + fresh GPS; not full matching
      pendingApplications: number;
    };
  };
  period: {
    bookings: {
      byStatus: Record<string, number>; // BookingStatus keys present in DB only
      completedConnections: number;     // === byStatus.COMPLETED ?? 0
    };
    connectionFees: {
      unitPesewas: 100;                 // BOOKING_FEE_PESEWAS
      currency: 'GHS';
      collected: { count: number; amountPesewas: number }; // purpose BOOKING_FEE + SUCCESS
      pending:   { count: number; amountPesewas: number };
      failed:    { count: number; amountPesewas: number };
    };
    refunds: {
      byStatus: Record<string, { count: number; amountPesewas: number }>;
    };
    tokens: {
      purchases: { count: number; amountPesewas: number; currency: 'GHS' }; // TOKEN_PURCHASE SUCCESS
      usage: { deductionCount: number; tokensDeducted: number };
    };
  };
  exclusions: {
    transportationFareRevenue: false;
    note: string; // Cyrlo does not collect transportation fares
    abandonedBookingFeePayments: string; // ABANDONED not in fee buckets
  };
}
```

### 2.6 Aggregation sources (repository)

| Metric | Query basis |
| --- | --- |
| Passengers | `user` role PASSENGER (± status) — **snapshot** |
| Riders registered | `user` role RIDER — **snapshot** |
| Available approx | RiderProfile APPROVED + AVAILABLE + ACTIVE user + location sharing + `receivedAt` within `RIDER_LOCATION_MAX_AGE_MS` (30s) — **snapshot** |
| Pending applications | RiderProfile `PENDING_REVIEW` — **snapshot** |
| Bookings by status | `booking.groupBy(status)` with optional `createdAt` window — **period** |
| Connection fees | `payment` `purpose: BOOKING_FEE` + status SUCCESS/PENDING/FAILED; sum `amountPesewas` — **period** |
| Refunds | `paymentRefund.groupBy(status)` with count + sum amount — **period** |
| Token purchases | `payment` `TOKEN_PURCHASE` + SUCCESS — **period** |
| Token deductions | `tokenLedgerEntry` type DEDUCTION; abs sum of `tokenDelta` — **period** |

### 2.7 Empty / error / null behavior

| Case | Behavior |
| --- | --- |
| No rows in a status | Key **omitted** from `byStatus` maps (not zero-filled for all enums) |
| No fee payments | `{ count: 0, amountPesewas: 0 }` |
| No date filter | Period = all-time |
| Unauthorized / no MFA | 401 / 403 as above |
| Forbidden role (no anyOf permission) | 403 |

### 2.8 Metric checklist vs product ask

| Asked metric | Provided? | Where |
| --- | --- | --- |
| Total passengers | **Yes** | `snapshot.passengers.total` (+ active/suspended) |
| Total riders | **Yes** | `snapshot.riders.registered` |
| Available riders | **Yes (approx)** | `snapshot.riders.availableApprox` |
| Bookings by status | **Yes** | `period.bookings.byStatus` |
| Completed connections | **Yes** | `period.bookings.completedConnections` |
| GH₵1 connection-fee payments | **Yes** | `period.connectionFees.*` (unit 100 pesewas) |
| Pending / failed payments | **Yes** | fee `pending` / `failed` |
| Refunds | **Yes** | `period.refunds.byStatus` (count + amountPesewas) |
| Rider token purchases | **Yes** | `period.tokens.purchases` |
| Token deductions | **Yes** | `period.tokens.usage` |
| Transport fare revenue | **Explicitly excluded** | `exclusions` |
| Live activity feed | **No** | No suitable feed endpoint for Overview |
| Time-series / charts by day | **No** | Aggregates for window only |

---

## 3. Business metric definitions (must appear in UI copy)

| Concept | Definition for Overview |
| --- | --- |
| Connection fee | Fixed **GH₵1** (`100` pesewas) charged when a rider accepts; Cyrlo revenue surface |
| `collected` | **Gross** SUCCESS `BOOKING_FEE` sum in window — **not** net of refunds |
| Pending / failed | Connection-fee payment attempts not completed |
| Refunds | Separate series by refund status (amounts in pesewas) — do **not** merge into a single “Revenue” hero |
| Token purchases | Rider wallet top-ups (SUCCESS `TOKEN_PURCHASE`) — not connection-fee revenue |
| Token deductions | Rider token spend count/volume — operational, not GHS fare |
| Transport fare | Negotiated off-platform; **never** shown as Cyrlo revenue |

**UI rule:** Never show one combined “Revenue” number that mixes fees, tokens, and fares. Prefer labeled cards: “Connection fees collected (gross)”, “Refunds”, “Token purchases”.

Optional derived display (frontend-only, clearly labeled):

> Approx. net connection fees ≈ `collected.amountPesewas − Σ(refunds.byStatus[*].amountPesewas for completed refund statuses)`  

Only if product accepts that approximation; otherwise show gross + refunds side-by-side without a “net” headline.

---

## 4. Recommended Overview experience

Route: replace placeholder at `/overview` (keep nav permission `anyOf` aligned with analytics).

### A. Key metric cards (API-backed)

| Card | Source | Notes |
| --- | --- | --- |
| Passengers (total / active) | snapshot | Label as current snapshot |
| Riders registered | snapshot | |
| Available riders (approx) | `availableApprox` | Footnote: approximate; GPS freshness ≤ 30s; not full matching eligibility |
| Pending rider applications | snapshot | |
| Completed connections | period | Window-sensitive |
| Connection fees collected | period `collected` | Show count + GH₵ amount (pesewas÷100); “gross” |

### B. Booking activity

- Horizontal/stacked bar or status table from `period.bookings.byStatus`.  
- Zero-fill known `BookingStatus` enum client-side for stable UI (API omits empty keys).  
- Highlight `COMPLETED` as completed connections.

### C. Financial snapshot

Separate block titled **Connection fees & refunds** (not “Revenue”):

- Collected / Pending / Failed (count + GH₵)  
- Refunds by status (count + GH₵)  
- Token purchases (GHS) and deductions (token units) in a secondary “Rider tokens” subsection  

Surface `exclusions.note` as muted disclaimer.

### D. Rider availability

Use `availableApprox` with explicit copy:

> Snapshot estimate of approved riders marked available with a recent location update. Not a live dispatch guarantee.

Optional: show `generatedAt` as “As of …”.

### E. Date filtering

| Control | Behavior |
| --- | --- |
| Presets | Today / Last 7 days / Last 30 days / All time |
| Custom | `datetime-local` or date inputs → convert to ISO UTC `from`/`to` |
| Apply | Refetch `GET /admin/analytics?from=&to=` |
| All time | Omit both params |
| UX copy | “Period metrics use inclusive UTC `createdAt`. Passenger/rider totals are current snapshots and ignore the date filter.” |

### F. States

| State | Handling |
| --- | --- |
| Loading | Skeleton / muted “Loading overview…” |
| Empty period | Cards show 0; booking chart empty message |
| Network / 5xx | ErrorBanner + Retry (reuse 1A pattern) |
| 401 | Existing client → session expired |
| 403 | Forbidden page or inline “No permission for analytics” (do not fake zeros) |
| Role without Overview nav | Already blocked by `RequireMfaSession` + `canAccessPath` |

Visual style: extend Phase 1A restrained desktop-first shell (CSS variables, no purple gradients / heavy animation). Prefer CSS/HTML bars over a chart library for v1.

---

## 5. API gap assessment

| Desired feature | Gap? | Recommendation |
| --- | --- | --- |
| KPI overview for supported roles | **None** — `/admin/analytics` sufficient | Implement FE against this endpoint |
| Finance-only thinner payload | Optional | FINANCE_ADMIN may call `/admin/financial-reports` instead/in addition; same period fields, no passenger/rider snapshot |
| Net fee after refunds as first-class field | Soft gap | Display gross + refunds separately; optional labeled client derive |
| Day-by-day trend charts | Gap | Out of Phase 1B unless new backend series endpoint (do not invent) |
| Live ops board / activity feed | Gap | **Do not build** in 1B |
| Available riders as exact matching supply | Documented approx | Keep “approx” labeling; no new API required |
| ABANDONED fee visibility | Soft gap | Mention in exclusions footnote; no 1B backend work |

**Smallest backend addition (only if product insists):** none for MVP Overview. Defer trend series and live feed.

---

## 6. Frontend implementation plan

### Component structure (proposed)

```
src/api/admin-analytics.ts          # fetchAnalytics(from?, to?)
src/api/types.ts                    # AnalyticsResponse types
src/pages/OverviewPage.tsx          # page shell + filter state
src/features/overview/
  OverviewFilters.tsx
  MetricCards.tsx
  BookingStatusPanel.tsx
  ConnectionFeePanel.tsx
  TokenPanel.tsx
  SnapshotDisclaimer.tsx
src/pages/OverviewPage.test.tsx     # mocked analytics
```

### API / types

- Extend typed client: `GET /admin/analytics` with optional query.  
- Mirror backend field names exactly (`amountPesewas`, `availableApprox`, etc.).  
- Helper `formatGhsFromPesewas(n)` for display only.

### Data fetching

- `useEffect` + abort/`authOp`-style request id (or simple `cancelled` flag) — **no new dependency** unless team prefers TanStack Query later.  
- Refetch on filter apply; Retry on error.

### Permissions

- Keep route behind existing Overview nav permissions (matches analytics `anyOf`).  
- Backend remains authority; FE must not invent metrics for unauthorized roles.  
- Known product note (Phase 0 S6): Support can see fee/token aggregates via `InvestigateDisputes`/`ViewPayments` — Overview will expose that unless product splits APIs later; do not silently strip fields client-side without product decision.

### Charts

- Prefer CSS flex bars / table for status distribution.  
- **Do not add** Chart.js/Recharts unless a later phase requires trends.

### Responsive

- Desktop-first grid (2–4 columns); stack cards on narrow viewports; keep AppShell sidebar behavior.

### Tests

1. Renders metric cards from mocked analytics payload.  
2. Date filter builds correct `from`/`to` query (or omits for all-time).  
3. Empty `byStatus` → stable zero UI.  
4. 403 → error/forbidden path, not fake KPIs.  
5. 401 path relies on existing client session expiry.  
6. Labels never claim transport-fare revenue; exclusions note visible.  
7. `availableApprox` copy includes approximate/snapshot language.  
8. Pesewas → GH₵ formatting (100 → GH₵1.00).

---

## 7. Ordered implementation steps

1. Add `AnalyticsResponse` types + `fetchAdminAnalytics`.  
2. Build `OverviewPage` with loading/error/empty and filters.  
3. Metric cards + booking status panel + fee/refund/token panels.  
4. Wire `/overview` route; remove placeholder.  
5. Extend UI primitives only as needed (e.g. `Panel`, `Stat`).  
6. Unit/component tests with mocked fetch.  
7. Manual MFA login smoke against local API.  
8. Update a short Phase 1B implementation note (later phase — not this discovery).  
9. Stop for review before commit.

---

## 8. Risks and dependencies

| Risk | Mitigation |
| --- | --- |
| Confusing snapshot vs period | Persistent UI copy + `dateRange.interpretation` |
| Mislabeling gross SUCCESS as “net revenue” | Explicit “gross” / separate refunds |
| Support seeing finance aggregates | Document; product may later split ops/finance analytics |
| MFA 403 mid-session | Surface as access error; user re-auths |
| Large all-time `groupBy` cost | Prefer default Last 7/30 days; All time opt-in |
| Approximate available riders misread as live | Footnote + `generatedAt` |
| Forced re-MFA (~15m) | Already Phase 1A behavior |

**Dependencies:** Phase 0 analytics backend (committed); Phase 1A auth shell (committed); local Ride API + DB with sample data for smoke.

---

## 9. Recommendation

### READY WITH CONDITIONS

Phase 1B Overview can be implemented **entirely against existing `GET /admin/analytics`** (optionally `/admin/financial-reports` for finance-focused layout). No backend invention required for MVP.

**Conditions before / during implementation:**

1. UI must separate connection fees, refunds, and tokens; never invent transport-fare revenue.  
2. Label `availableApprox` and passenger/rider totals as **snapshots**.  
3. Label fee `collected` as **gross**; do not imply net unless product approves a derived figure.  
4. No live activity feed or trend charts without a new backend series (out of scope).  
5. Confirm with product whether Support should see fee/token blocks as-is (Phase 0 anyOf) or whether Overview should hide finance panels for Support (presentation-only; backend still returns full payload).

---

**Stop.** Discovery only — awaiting review before Phase 1B implementation.
