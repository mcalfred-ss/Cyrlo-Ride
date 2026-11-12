# Cyrlo Ride — Phase 4 Discovery Report  
## Financial Management (READ-ONLY)

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `f25bba13cdd06ba8f7a5ffcea37abbb4bbc1ed9f` (`feat(admin): complete phase 3 booking management`)  
**Mode:** READ-ONLY discovery (this report only; no source/API/migration/deploy/stash changes)  
**Working tree at discovery start:** clean  
**Ghana/maps stash:** intact (`stash@{0}: wip-ghana-maps-preserve-phase0`)

**Naming note:** `ADMIN_IMPLEMENTATION_ROADMAP.md` labeled finance under **Phase 6 — Finance and rider tokens**. This project phase is **Phase 4 — Financial Management** per current plan. Overview already surfaces connection-fee / refund / token **aggregates**; Support dispute recommend remains a separate Support phase.

---

## 1. Executive Summary

**Backend financial APIs are substantially implemented.** Phase 4 is primarily Admin SPA work to replace the `/finance` placeholder and wire existing contracts — **without inventing a payments directory API that does not exist**.

| Capability | Backend | Admin SPA |
| --- | --- | --- |
| Financial overview aggregates | **Exists** `GET /admin/analytics` + `GET /admin/financial-reports` | Overview partially; Finance page placeholder |
| Payments directory (all charges) | **Missing** `GET /admin/payments` | N/A — do not invent |
| Payment detail (dedicated) | **Missing** | Booking detail shows BOOKING_FEE rows; token purchase embeds payment |
| Refunds directory | **Exists** `GET /admin/payments/refunds` | Missing |
| Refund execute / reconcile | **Exists** (recent MFA) | Missing |
| Reconciliation cases | **Exists** | Missing |
| Token packages CRUD | **Exists** | Missing |
| Token purchases list | **Exists** | Missing |
| Token ledgers browse | **Exists** `GET /admin/token-ledgers` | Missing |
| Support refund **recommendation** | **Exists** (disputes / cancel-requests) | Deferred to Support phase |
| Real Paystack charge/refund in admin UI tests | Must stay test/mock only | Constraint |

**Critical product rule:** A Support `REFUND_FEE` recommendation creates / queues a `PaymentRefund` in `REQUESTED` (often **unauthorized** until Finance). It does **not** mean money has been refunded. Only Finance `ExecuteRefunds` + provider confirmation → `SUCCEEDED`.

**No new backend endpoints are required** for a useful first Finance console covering: financial report view, refunds queue + execute/reconcile, reconciliation cases, token packages, purchases, ledgers — if Phase 4 accepts the absence of a global payments browser.

---

## 2. Financial Architecture

### 2.1 Modules and mounts (`backend/src/app.ts`)

| Area | Code | Mount |
| --- | --- | --- |
| Passenger connection-fee init + Paystack webhook | `modules/payments` | `/api/v1/payments`, webhook `POST /payments/paystack/webhook` |
| Finance refunds / reconcile | `modules/payments` admin router | `/api/v1/admin/payments` |
| Rider wallet / packages / purchases | `modules/wallet` | `/api/v1/wallet` |
| Finance packages / purchases / ledgers | `modules/wallet` admin router | `/api/v1/admin` (`/token-packages`, `/token-purchases`, `/token-ledgers`) |
| Analytics + financial report | `modules/admin` console | `/api/v1/admin/analytics`, `/financial-reports` |
| Support refund recommend | `modules/disputes` | `/api/v1/admin/disputes*`, `/cancellation-requests*` |
| Booking fee on booking DTOs | `modules/admin` console bookings | Already used in Phase 3 |

### 2.2 Core Prisma models (`backend/prisma/schema.prisma`)

- **`Payment`** — `purpose` (`BOOKING_FEE` \| `TOKEN_PURCHASE`), `status` (`PENDING` \| `SUCCESS` \| `FAILED` \| `ABANDONED`), `amountPesewas`, `providerReference`, `idempotencyKey`.
- **`PaymentRefund`** — compensating fee refund; original payment stays `SUCCESS`. Statuses: `REQUESTED` \| `PROCESSING` \| `SUCCEEDED` \| `FAILED` \| `MANUAL_RECONCILIATION`. Execution gated by `authorizedAt`.
- **`PaymentWebhookEvent`** — unique `providerEventId`; duplicate deliveries no-op once `processedAt` set.
- **`FinancialReconciliationCase`** — Finance-visible cases (string status `OPEN` \| `IN_REVIEW` \| `RESOLVED`).
- **`RefundReconciliationAttempt`** — attempt history for a refund.
- **`TokenPackage`** / **`TokenPurchase`** / **`RiderWallet`** / **`TokenLedgerEntry`**.

### 2.3 Key constants

- Connection fee: `BOOKING_FEE_PESEWAS = 100` (GH₵1) — `backend/src/config/constants.ts`.
- Provider: Paystack (`Payment.provider` default `"paystack"`).

### 2.4 What Cyrlo does **not** collect

Transportation fares are **not** platform payments. Analytics `exclusions.transportationFareRevenue: false` with note that Cyrlo does not collect fare revenue. Admin UI must never label connection fees or token purchases as “trip fare revenue.”

---

## 3. Payment Lifecycle

### 3.1 Statuses (`PaymentStatus`)

`PENDING` → `SUCCESS` \| `FAILED` \| `ABANDONED`

### 3.2 Booking connection fee

1. Booking/accept path creates a `BOOKING_FEE` payment row (`PENDING`).
2. Passenger `POST /payments/booking-fee` → Paystack `initializeTransaction`; returns `authorizationUrl`, `reference`, `paymentExpiresAt`.
3. Paystack webhook `charge.success` / `charge.failed` → `PaymentsService.handlePaystackWebhook` → `applyChargeSuccess` / `applyChargeFailed`.
4. Unpaid timeout / cancel paths may abandon pending fee payments (sweeper / booking rules); `ABANDONED` fees are **excluded** from analytics connection-fee buckets.

### 3.3 Token purchase

1. Rider `POST /wallet/purchases` creates `TokenPurchase` + `TOKEN_PURCHASE` payment (`PENDING`) and Paystack init.
2. On `charge.success`, wallet `fulfillPaidPurchase` credits tokens + ledger `PURCHASE`.
3. Fail/abandon paths mark purchase/payment accordingly; late success on abandoned purchase can open reconciliation case `ABANDONED_TOKEN_PURCHASE_SUCCESS`.

### 3.4 Webhook processing & duplicate protection

Source: `PaymentsService.handlePaystackWebhook` (`module.service.ts`).

1. Verify `x-paystack-signature` against `PAYSTACK_SECRET_KEY`.
2. Derive `providerEventId` (`paystack:{event}:{data.id}` or payload hash fallback).
3. Insert-or-load `PaymentWebhookEvent`; unique constraint race → reload.
4. If `processedAt` already set → `{ accepted: true }` (idempotent).
5. Else process: refund events via refund processor; `charge.success` / `charge.failed` via charge handlers; then set `processedAt`.
6. On failure, store `processingError` and rethrow (allows crash recovery re-apply).

**Admin SPA must never call the public webhook.**

---

## 4. Refund Lifecycle

### 4.1 Statuses (`PaymentRefundStatus`)

| Status | Meaning |
| --- | --- |
| `REQUESTED` | Queued; may lack `authorizedAt` (Support recommend) |
| `PROCESSING` | Submitted / provider pending |
| `SUCCEEDED` | Provider **processed** confirmation only (`localStatusFromProvider`) |
| `FAILED` | Provider failed; may retry if attempts remain |
| `MANUAL_RECONCILIATION` | Unsafe to auto-retry; Finance reconcile path |

Rules in `refund-lifecycle.ts`:

- `SUCCEEDED` only from provider status `processed` — **never** from mere submission.
- Worker/Finance submit requires `isRefundAuthorizedForExecution` → eligible status **and** `authorizedAt != null`.

### 4.2 How refunds are created

| Path | Who | Effect |
| --- | --- | --- |
| Matrix auto (rider cancel, unpaid timeout, etc.) | System / bookings | May create refund with policy authorization |
| Support dispute `REFUND_FEE` | `RecommendRefunds` + recent MFA | Queues `REQUESTED` via `requestFeeRefund`; `refundExecuted: false` |
| Support cancel-request `REFUND_FEE` | `RecordSupportDecisions` + recent MFA | Same pattern |
| Late payment success after abandon | System | May queue refund + audit `payment.late_success.refund_queued` |

### 4.3 Finance execution

| Step | Endpoint | Permission | Recent MFA |
| --- | --- | --- | --- |
| Authorize + submit | `POST /admin/payments/refunds/:refundId/execute` | `ExecuteRefunds` | **Yes** |
| Reconcile with provider | `POST /admin/payments/refunds/:refundId/reconcile` | `ReconcilePaystack` | **Yes** |

`executeRefund` → `authorizeRefundExecution` (sets `authorizedAt`, audit `payment.refund.authorized`) then `submitRefund` (Paystack refund API, audits submission / failure / manual review).

**UI copy requirement:** Distinguish “recommended / REQUESTED” vs “authorized” vs “SUCCEEDED (money moved)”.

---

## 5. Admin API Contract Inventory

Base: `/api/v1`.

### 5.1 Reports & overview

| Method | Endpoint | Permission | Recent MFA | Query | Response highlights |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/analytics` | any of MonitorOperations, ViewFinancialReports, InvestigateDisputes, **ViewPayments** | No | `from?`, `to?` ISO | Snapshot + period: bookings, **connectionFees** (collected/pending/failed), **refunds.byStatus**, **tokens** purchases/usage; exclusions note |
| `GET` | `/admin/financial-reports` | `ViewFinancialReports` | No | same | Finance slice: connectionFees, refunds, tokens, completedConnections; **no** passenger/rider snapshot KPIs |

### 5.2 Payments admin (`/admin/payments`)

| Method | Endpoint | Permission | Recent MFA | Notes / response |
| --- | --- | --- | --- | --- |
| `GET` | `/refunds` | `ViewPayments` | No | Optional `?status=`; **no pagination schema** — repo `take: 100`, `orderBy createdAt asc`. Fields: id, paymentId, bookingId, amountPesewas, currency, status, reason, attempts, providerRefundId, providerStatus, authorizedAt/By, submittedAt, confirmedAt, nextAttemptAt, failureReason, reconciliationNote, createdAt, `payment{id,providerReference,amountPesewas,status,bookingId}` |
| `GET` | `/refunds/:refundId/reconciliation-attempts` | `ViewPayments` | No | Up to 50 attempts |
| `POST` | `/refunds/:refundId/execute` | `ExecuteRefunds` | **Yes** | Authorize + submit |
| `POST` | `/refunds/:refundId/reconcile` | `ReconcilePaystack` | **Yes** | Provider sync |
| `GET` | `/reconciliation/cases` | `ViewPayments` | No | Optional `?status=`; take 100 |
| `POST` | `/reconciliation/cases/:caseId/resolve` | `ReconcilePaystack` | **Yes** | Body `{ notes? }` |

**Missing:** `GET /admin/payments` (global payment directory), dedicated `GET /admin/payments/:paymentId`.

### 5.3 Wallet admin (mounted under `/admin`)

| Method | Endpoint | Permission | Recent MFA | Query / body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/token-packages` | `ManageTokenPackages` | No | — | Package catalog (all for finance) |
| `POST` | `/admin/token-packages` | `ManageTokenPackages` | **Yes** | createPackageSchema | Created package; audit `wallet.package.created` |
| `PATCH` | `/admin/token-packages/:packageId` | `ManageTokenPackages` | **Yes** | updatePackageSchema | Updated; audit |
| `GET` | `/admin/token-purchases` | `ViewPayments` | No | page, pageSize, status? | Paginated purchases + nested payment snapshot |
| `GET` | `/admin/token-ledgers` | `ViewTokenLedgers` | No | page, pageSize, riderId?, type?, from?, to? | Paginated ledger with rider summary + `kind` classifier |

### 5.4 Support-adjacent (deferred from Phase 4 core UI)

| Method | Endpoint | Permission | Recent MFA |
| --- | --- | --- | --- |
| `POST` | `/admin/disputes/:id/recommend` | `RecommendRefunds` | **Yes** |
| `POST` | `/admin/cancellation-requests/:id/recommend` | `RecordSupportDecisions` | **Yes** |

### 5.5 Capability matrix vs existing APIs

| Desired capability | Supported? |
| --- | --- |
| Financial overview | **Yes** — analytics / financial-reports |
| Payments directory | **No** dedicated list |
| Payment detail | **Partial** — via booking detail / purchase embed |
| Refund request directory | **Yes** — `/admin/payments/refunds` |
| Refund recommendations | **Yes** — Support APIs (defer UI) |
| Actual refund execution | **Yes** — execute + reconcile |
| Wallet / token reporting | **Yes** — purchases + ledgers + analytics tokens |
| Revenue / fee reporting | **Yes** — connection fee buckets only; not fare |

---

## 6. Permission and Role Matrix

Source: `backend/src/common/authz/permissions.ts` (mirrored in Admin FE).

| Permission | SUPER | OPS | FINANCE | SUPPORT | Typical use |
| --- | --- | --- | --- | --- | --- |
| `ViewPayments` | Y | **N** | Y | Y | Refunds list, cases, token purchases; also unlocks analytics |
| `ViewFinancialReports` | Y | **N** | Y | **N** | `/admin/financial-reports` |
| `ExecuteRefunds` | Y | **N** | Y | **N** | Execute refund (MFA) |
| `ReconcilePaystack` | Y | **N** | Y | **N** | Reconcile refund / resolve case (MFA) |
| `ManageTokenPackages` | Y | **N** | Y | **N** | Package CRUD (mutate MFA) |
| `ViewTokenLedgers` | Y | **N** | Y | **N** | Ledger browse |
| `RecommendRefunds` | Y | **N** | **N** | Y | Dispute recommend (MFA) — Support phase |
| `MonitorOperations` | Y | Y | **N** | **N** | Analytics (Ops) without Finance nav |

**Nav today** (`nav.ts`): `/finance` anyOf ViewPayments \| ViewFinancialReports \| ViewTokenLedgers \| ManageTokenPackages.  
→ **Finance + Support (+ Super) see Finance nav**; **Ops does not**. Support with only ViewPayments must not be shown execute/reconcile/package-write controls.

**Do not change** permission catalog or role mappings.

---

## 7. Financial Categories and Accounting Semantics

| Category | Source of truth | Include in “platform fee revenue”? |
| --- | --- | --- |
| Connection / booking fee | `Payment` purpose `BOOKING_FEE`; analytics `period.connectionFees` | Gross SUCCESS collected — show separately from refunds |
| Transportation fare | **Not collected** | **Never** |
| Fee refunds | `PaymentRefund` amounts by status | Separate panel; REQUESTED ≠ SUCCEEDED |
| Token purchase cash | `TOKEN_PURCHASE` payments / analytics `tokens.purchases.amountPesewas` | Separate from connection fees |
| Token deductions | Ledger `DEDUCTION` (acceptance cost) | Operational tokens, not cash revenue |
| Token refunds / adjustments | Ledger `REFUND` / `ADJUSTMENT` | Separate from cash fee refunds |

**UI rule:** Never sum connection fees + token purchases + fares into one “revenue” figure. Overview already separates ConnectionFeePanel, RefundPanel, TokenPanel — Finance pages must keep the same discipline.

Amounts are integer **pesewas**; display via existing `formatGhsFromPesewas`.

---

## 8. Audit and Security Findings

### Audit (mutations)

| Action examples | When |
| --- | --- |
| `payment.refund.authorized` / `submission_attempted` / `failed` / `manual_review_required` | Refund processor |
| `payment.refund.reconciliation_attempted` / `discrepancy_detected` | Reconcile |
| `payment.reconciliation.case_opened` / `finance_review_completed` | Cases |
| `wallet.package.created` / update | Package CRUD |
| `payment.late_success.refund_queued` | System late charge |
| Ordinary refund/payment **list reads** | **No** per-read audit |

### Sensitive fields

| Field | Guidance |
| --- | --- |
| Paystack secret / webhook signature | Server-only; never FE |
| `authorizationUrl` / `accessCode` | Passenger/rider checkout only — not Finance browse |
| `providerReference` / `providerRefundId` | OK for Finance ops; not secrets |
| Passenger/rider phones on ledger/purchase | PII — Finance/Support with ViewPayments/ViewTokenLedgers only |
| Exact GPS | Out of Phase 4 |

### Findings

| ID | Severity | Finding |
| --- | --- | --- |
| F1 | **Pass** | Execute/reconcile/package writes require recent MFA |
| F2 | **Pass** | Support cannot ExecuteRefunds |
| F3 | **Info** | Support has ViewPayments → can list refunds/cases/purchases; UI must hide Finance-only actions |
| F4 | **Info** | Refunds list lacks pagination (cap 100) — document |
| F5 | **Info** | No global payments browser — booking/token paths only |
| F6 | **Pass** | Webhook idempotent via `PaymentWebhookEvent` |
| F7 | **Pass** | Recommendation ≠ execution (`refundExecuted: false`) |

---

## 9. Frontend Integration Plan

### Present

| Asset | Role |
| --- | --- |
| Nav `/finance` | Already gated |
| Router `/finance` | **Placeholder** |
| Overview + ConnectionFee / Refund / Token panels | Aggregate patterns + money formatting |
| `AdminAnalytics` types | Reuse for financial-report subset |
| `apiRequest` / ErrorBanner / URL sync / ConfirmReasonPanel | Standard patterns |
| Booking detail payments table | Connection-fee context deep-link |

### Missing

| Asset | Need |
| --- | --- |
| `api/admin-finance.ts` (or split payments/wallet clients) | Typed clients |
| Finance hub / nested routes | e.g. `/finance`, `/finance/refunds`, `/finance/purchases`, `/finance/ledgers`, `/finance/packages`, `/finance/reports` |
| Recent-MFA step-up UX for execute/reconcile/package write | May need shared step-up if not already generic |
| Permission-aware action visibility | Support vs Finance |

### Suggested route layout (implementation choice)

Keep single `/finance` hub with sections **or** nested routes under `/finance/*` inheriting nav parent via `canAccessPath`. Prefer nested for deep-links and URL filter sync (mirrors bookings).

---

## 10. Gaps and Blockers

| Gap | Blocks Phase 4? | Stance |
| --- | --- | --- |
| No `GET /admin/payments` | Blocks “all charges” browser only | **Defer**; use refunds + purchases + booking payments |
| Refunds list no pagination | Soft UX limit | Document; filter by status |
| Support recommend UI | Not Finance core | **Defer** to Support phase |
| Recent-MFA modal for mutations | Blocks safe execute UX if missing | Inspect/reuse auth patterns; required before enabling execute |
| Live Paystack in automated tests | Policy | Keep mocks / test mode only |
| Ops wants Finance screens | No permission | Correct — do not broaden map |

**Not a blocker** for refunds queue, reports, packages, purchases, ledgers, reconciliation cases.

---

## 11. Recommended Implementation Breakdown

### 4A — Finance foundation & reports
- API clients for `financial-reports` (+ optional analytics reuse)
- Replace `/finance` placeholder with hub
- Period filters (`from`/`to`); separate fee / refund / token panels
- Permission-aware empty states for Support (ViewPayments) vs Finance (reports)

### 4B — Refunds & reconciliation
- Refunds directory (status filter, authorized vs not)
- Detail/side panel: attempts list
- Execute + reconcile with recent MFA + destructive confirm
- Reconciliation cases list + resolve
- Copy: REQUESTED ≠ SUCCEEDED

### 4C — Tokens (packages, purchases, ledgers)
- Packages list + create/update (MFA on mutate)
- Purchases directory
- Ledgers directory with filters
- Never merge token cash into connection-fee totals

### 4D — Security, regression, final review
- Role tests: Finance yes / Support view-only / Ops no Finance nav
- No real Paystack / no production refunds
- Regression: overview, bookings, passengers, riders, auth
- Implementation report

**Out of Phase 4:** Support dispute/cancel recommend UI; trip-GPS; inventing payments directory endpoint.

---

## 12. Testing Requirements

### Frontend (at implementation)
- Reports load / date window / empty
- Refunds list + status filter + 403
- Execute/reconcile: MFA gate, confirm, success/error, Support hidden
- Cases resolve
- Packages CRUD permission + MFA
- Purchases / ledgers pagination & filters
- Hostile payloads: no secrets; amounts stay pesewas-correct
- Regression suites green; typecheck + build

### Backend regression (re-run only)
- `payments` refund / refund-auth db tests
- `wallet` module tests
- `admin/console` analytics / financial report tests
- Permission probes where present

### Explicitly forbidden in Phase 4 work
- Real Paystack charges/refunds
- Production webhook triggers
- Permission/role map edits
- Schema migrations

---

## 13. Explicitly Deferred Features

- Global admin payments directory (`GET /admin/payments`)
- Dedicated payment detail page beyond embeds
- Support disputes / cancellation-request recommend UI
- Trip GPS evidence
- Combining fee + token + fare into single revenue KPI
- Ops access to Finance module
- Flutter / `apps/cyrlo_app` changes
- Live SEARCHING/offers (ops board)
- Auto-executing refunds from Support recommendations

---

## 14. Discovery stop

Phase 4 Financial Management discovery complete.

**Backend readiness for Finance console: high** (refunds, reconcile, packages, purchases, ledgers, reports).  
**Backend readiness for universal payments browser: low** (endpoint missing).  
**Frontend readiness: Overview patterns ready; `/finance` still placeholder.**

Do not implement until this report is reviewed. No source changes, commits, pushes, deploys, migrations, real Paystack activity, or stash operations were performed beyond creating this file.
