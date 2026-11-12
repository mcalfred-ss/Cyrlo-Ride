# Cyrlo Ride Admin — Pre-Commit Final Audit (Phases 4–8)

**Date:** 2026-11-12  
**Mode:** READ-ONLY (no source fixes, no stage/commit/push/deploy, no migrations, no Paystack/prod mutations)  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `f25bba13cdd06ba8f7a5ffcea37abbb4bbc1ed9f` (`f25bba1` — Phase 3 booking management)  
**Compared against:** `ADMIN_PHASES_4_TO_8_FINAL_REVIEW.md`, Phase 4–8 implementation reports, backend routes/permissions

---

## 1. Overall verdict

### **APPROVED WITH CONDITIONS**

The Phase 4–8 Admin SPA implementation is consistent with existing backend contracts, keeps permission maps untouched, and does not invent unsupported endpoints. Automated Admin quality gates previously documented remain green (143 tests / typecheck / build).

**Conditions before commit (recommended fixes — not applied in this audit):**

1. Correct refund lifecycle copy that incorrectly implies `REQUESTED` means Finance-authorized.
2. Surface `authorizedAt` / authorization state on refund directory or detail (API already returns these fields).
3. Distinguish `MANUAL_RECONCILIATION` from ordinary reconcile UX copy (avoid presenting it as a normal retry).

None of these are deploy blockers for a reviewed follow-up patch; they are accuracy gaps against Phase 4 discovery rules.

---

## 2. Security findings

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| S1 | **Pass** | Invitation token held in React state only; dismiss clears banner; copy says one-time. No `localStorage` / `sessionStorage` writes in `AdminsPage` / `admin-staff.ts`. | `AdminsPage.tsx` invite banner |
| S2 | **Pass** | No OTP/TOTP/recovery/env secrets added to new finance/zones/audit pages. `developmentCode` remains local-only on `OtpPage` (pre-existing). | Grep of new pages |
| S3 | **Pass** | Support cannot execute refunds, reconcile, or manage packages — UI gated on `ExecuteRefunds` / `ReconcilePaystack` / `ManageTokenPackages` (Support matrix lacks these). Tests assert Support hides execute. | `FinanceRefundsPage.tsx`, `FinancePackagesPage.tsx`, `FinanceRefundsPage.test.tsx`, `permissions.ts` |
| S4 | **Pass** | Ops blocked from `/finance` and nested `/finance/*` via nav `anyOf` + `canAccessPath`. | `nav.test.ts` |
| S5 | **Pass** | Zone **verify** uses `Permission.VerifyServiceZones` (Super-only in role map). Other lifecycle actions use `ManageServiceZones`. Confirm step before mutate. | `ZoneDetailPage.tsx`, `permissions.ts` |
| S6 | **Pass** | Refund/package/case mutations: confirm panel + `busy` / `inFlight` guards; execute/reconcile/package write require recent MFA on backend (403 messaging via `errorMessage`). SPA does not call Paystack. | `FinanceRefundsPage.tsx`, `admin-finance.ts`, routes |
| S7 | **Info** | Audit metadata rendered via `JSON.stringify` truncated to 160 chars — **no client-side key redaction**. Relies on backend not putting OTP/MFA/session secrets in audit metadata. Acceptable for ManageAdmins-only page; optional harden later. | `AuditLogsPage.tsx` `metadataPreview` |
| S8 | **Info** | Operator “reason” on execute/reconcile is **not** sent to API (checkpoint only). Intentional; ticket systems must capture rationale offline. | Confirm panel description |

---

## 3. Permission findings

| ID | Severity | Finding |
| --- | --- | --- |
| P1 | **Pass** | `apps/cyrlo_admin/src/config/permissions.ts` **unchanged** in this working tree (last commit `93bfe77` Phase 1A). |
| P2 | **Pass** | Finance nav: ViewPayments \| ViewFinancialReports \| ViewTokenLedgers \| ManageTokenPackages. Ops excluded. |
| P3 | **Pass** | Nested `/finance/refunds` inherits parent for Support (view) and Finance; Ops false — tested. |
| P4 | **Pass** | `/reports` gated MonitorOperations \| ViewFinancialReports \| ViewPayments — Ops/Finance/Support/Super as designed. |
| P5 | **Pass** | Hub withholds financial-report panels without `ViewFinancialReports`; Support still gets payment deep-links. |
| P6 | **Info** | No admin staff directory API — revoke-by-UUID UX is correct and documented; not a permission bug. |

---

## 4. Financial correctness findings

| ID | Severity | Finding |
| --- | --- | --- |
| F1 | **Pass** | Connection fees, refunds, and token purchases rendered in separate panels/pages; TokenPanel states purchases/deductions are not connection-fee revenue / not fares. |
| F2 | **Pass** | Exclusions note shown; `transportationFareRevenue: false` displayed; never labeled as trip fare revenue. |
| F3 | **Pass** | Amounts use `formatGhsFromPesewas` (integer pesewas). |
| F4 | **Pass** | No SPA webhook/Paystack SDK; execute/reconcile only hit admin API with mocks in tests. |
| F5 | **Pass** | Cap-100 / no pagination called out on refunds UI. |
| F6 | **Medium** | Refunds page copy: *“A requested refund is **authorized** but has not been confirmed…”* — **incorrect**. Support-queued `REQUESTED` rows often have `authorizedAt: null` until Finance execute. Should not equate REQUESTED with authorized. |
| F7 | **Medium** | API returns `authorizedAt` / `authorizedById`; **UI never displays them** (grep zero matches in `FinanceRefundsPage.tsx`). Phase 4 discovery required authorized vs not to be visible. |
| F8 | **Low** | `MANUAL_RECONCILIATION` shares the same “Reconcile with Paystack” control as other non-SUCCEEDED statuses without special copy that it is **not** an ordinary auto-retry path. |

---

## 5. Database test failure diagnosis (`refund-auth.db.test.ts`)

**Verdict: Not caused by Phase 4–8 Admin SPA work. Backend source was not modified in this tree. Failures are stale test setup vs current booking fee lifecycle.**

### Evidence

1. `BookingsServiceImpl.create` (current) returns `payment: null` and documents **connection fee on accept** (`connectionFeeTiming: 'on_accept'`). No `BOOKING_FEE` payment row is created at booking create.
2. `refund-auth.db.test.ts` `setupBookingFee` still:
   - calls `bookings.create(...)`
   - runs `prisma.payment.updateMany({ where: { bookingId: created.id }, data: { status: 'SUCCESS' } })`
   - then `prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } })`
3. With no payment row, `findFirstOrThrow` throws → **9+ tests** fail with `PrismaClientKnownRequestError` / “No record was found”.
4. Sweeper tests expecting `queueMissingBookingFeeRefunds` / `missingRefundsQueued ≥ 1` fail with `0` because the fixture never establishes a SUCCESS fee payment via the accept path.

### Classification

| Cause | Applies? |
| --- | --- |
| Local DB fixture / stale test assumptions | **Yes** — primary |
| Missing/stale test data relative to fee-on-accept product change | **Yes** |
| Setup/teardown bugs in SPA | **No** |
| Actual backend regression introduced by Phase 4–8 | **No** (SPA-only; booking fee-on-accept predates this work) |

**Remediation (out of scope for this audit):** Rewrite `setupBookingFee` to accept a rider, create SUCCESS fee payment the way production does post-accept, then assert refund authorization. Track as backend test debt, not a commit blocker for Admin FE.

Unit suites re-run earlier without this DB file: **48/48 passed** (wallet, console, console.permissions, service-zones, refund-lifecycle).

---

## 6. Unexpected or unrelated file changes

| Area | Status |
| --- | --- |
| `apps/cyrlo_app` / Flutter | **Not modified** |
| `backend/**` | **Not modified** |
| `permissions.ts` / role maps | **Not modified** |
| Ghana stash | **Intact** — `stash@{0}: On main: wip-ghana-maps-preserve-phase0` |
| Other stash | `stash@{1}: wip-before-main-merge` (pre-existing; not Ghana; untouched) |
| Working tree | Only `apps/cyrlo_admin/**` + `docs/admin/**` Phase 4–8 artifacts |

No unrelated product modules appear in `git status`.

---

## 7. Exact Git status

```
Branch: feature/admin-phase-0
HEAD:   f25bba13cdd06ba8f7a5ffcea37abbb4bbc1ed9f
Staged: (none)

 M apps/cyrlo_admin/src/api/types.ts
 M apps/cyrlo_admin/src/app/router.tsx
 M apps/cyrlo_admin/src/config/nav.test.ts
 M apps/cyrlo_admin/src/config/nav.ts
?? apps/cyrlo_admin/src/api/admin-finance.test.ts
?? apps/cyrlo_admin/src/api/admin-finance.ts
?? apps/cyrlo_admin/src/api/admin-geo.ts
?? apps/cyrlo_admin/src/api/admin-staff.ts
?? apps/cyrlo_admin/src/api/admin-tokens.test.ts
?? apps/cyrlo_admin/src/api/admin-tokens.ts
?? apps/cyrlo_admin/src/api/admin-zones.ts
?? apps/cyrlo_admin/src/components/LoadError.tsx
?? apps/cyrlo_admin/src/components/Pagination.tsx
?? apps/cyrlo_admin/src/layouts/FinanceLayout.tsx
?? apps/cyrlo_admin/src/lib/apiMessage.ts
?? apps/cyrlo_admin/src/lib/useLoader.ts
?? apps/cyrlo_admin/src/pages/AdminsPage.tsx
?? apps/cyrlo_admin/src/pages/AuditLogsPage.tsx
?? apps/cyrlo_admin/src/pages/GeoPage.tsx
?? apps/cyrlo_admin/src/pages/ReportsPage.tsx
?? apps/cyrlo_admin/src/pages/ZoneDetailPage.tsx
?? apps/cyrlo_admin/src/pages/ZonesPage.tsx
?? apps/cyrlo_admin/src/pages/finance/
?? docs/admin/ADMIN_PHASES_4_TO_8_FINAL_REVIEW.md
?? docs/admin/PHASE_4_DISCOVERY_REPORT.md
?? docs/admin/PHASE_4_IMPLEMENTATION_REPORT.md
?? docs/admin/PHASE_5_IMPLEMENTATION_REPORT.md
?? docs/admin/PHASE_6_IMPLEMENTATION_REPORT.md
?? docs/admin/PHASE_7_IMPLEMENTATION_REPORT.md
?? docs/admin/PHASE_8_IMPLEMENTATION_REPORT.md
?? docs/admin/PRE_COMMIT_FINAL_AUDIT.md   (this file, after write)
```

`git diff --stat` (tracked modifications only):

```
 apps/cyrlo_admin/src/api/types.ts       | 246 ++++++++++++++++++++++++++++++++
 apps/cyrlo_admin/src/app/router.tsx     |  72 ++++------
 apps/cyrlo_admin/src/config/nav.test.ts |  16 +++
 apps/cyrlo_admin/src/config/nav.ts      |  16 ++-
 4 files changed, 303 insertions(+), 47 deletions(-)
```

`git diff --check`: **exit 0** (CRLF normalize warnings on Windows only; no conflict markers / whitespace errors).

---

## 8. Required fixes (report only — not applied)

| Priority | Fix |
| --- | --- |
| **P0 for accuracy** | Rewrite REQUESTED explainer: queued/recommended ≠ authorized ≠ SUCCEEDED; point operators at `authorizedAt`. |
| **P0 for accuracy** | Show `authorizedAt` (and optionally authorized vs not badge) on refund table and/or detail. |
| **P1** | Special-case `MANUAL_RECONCILIATION` messaging so reconcile is not framed as a normal retry. |
| **P2 (backend tests)** | Update `refund-auth.db.test.ts` fixtures for fee-on-accept (separate backend chore). |
| **P3 optional** | Audit metadata client redaction denylist for obvious secret key names. |

---

## 9. Stop

Audit complete. **Await authorization** before staging, committing, pushing, or deploying. No code was modified except creation of this report file.
