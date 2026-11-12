# Cyrlo Ride — Admin Phase 0 Review Report

**Date:** 2026-11-12  
**Mode:** READ-ONLY engineering review (no application code changes, no deploy, no merge/push, no stash discard)  
**Subject:** Phase 0 backend foundation on `feature/admin-phase-0`  
**Verdict:** **APPROVED WITH CONDITIONS**

Phase 0 is directionally sound: new admin routes are MFA-gated, grant-checked, connection-fee–scoped (not transport-fare), and covered by local unit/permission/DB tests. It is **not** unconditionally safe for an unscoped frontend build until the conditions in §8 are addressed or explicitly accepted.

---

## 1. Executive verdict

| Verdict | Meaning |
| --- | --- |
| **APPROVED WITH CONDITIONS** | Proceed to frontend **Phase 1 (auth shell)** with documented MFA refresh constraints; delay or tightly scope passenger/booking/overview UI until privacy and analytics-window conditions are resolved or product-signed. |

Not **APPROVED** (unconditional): privacy vs requirements, partial date windows, least-privilege passenger access, and incomplete acceptance criteria (OpenAPI / route-level authz tests).  
Not **NOT APPROVED**: no unauthenticated admin routes found; financial model does not invent transport-fare revenue; Git baseline is coherent.

---

## 2. Git integrity findings

### Observed state

| Item | Value |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| `HEAD` | `44e024a` — *Remove duplicate matching zone helpers that broke the staging build.* |
| `origin/main` | `44e024a` (identical) |
| Merge-base(`HEAD`, `origin/main`) | `44e024a` |
| Working tree | **Dirty**: Phase 0 implementation uncommitted (modified admin/wallet/audit/prisma + untracked console modules, migration, `docs/admin/*`) |
| Stashes | `stash@{0}: wip-ghana-maps-preserve-phase0`; `stash@{1}: wip-before-main-merge` (preserved; not popped) |

### Baseline discrepancy (audit `b1fcbef` / `d5aae37` vs report `44e024a`)

**Legitimate.** The earlier audit captured:

- Local `main` then at `b1fcbef`
- `origin/main` / staging then at `d5aae37`

Current `origin/main` is **3 commits ahead of `b1fcbef`**:

1. `4487312` — passenger prefs / account edit-delete / Pragya supply gating  
2. `d5aae37` — matching nearby/supply API contract  
3. `44e024a` — matching zone helper build fix  

Both `b1fcbef` and `d5aae37` are ancestors of current `origin/main`. The Phase 0 branch tip matches latest `origin/main`; it contains the expected post-audit mainline changes. Phase 0 product code itself is **not yet committed** on the branch (working-tree only).

| ID | Severity | Location | Problem | Recommended correction |
| --- | --- | --- | --- | --- |
| G1 | Medium | Working tree on `feature/admin-phase-0` | Phase 0 claimed “complete” but changes are uncommitted; risk of loss or accidental mix with stash restore | Commit Phase 0 on the feature branch (when authorized); keep Ghana stash separate |
| G2 | Low | `docs/admin/ADMIN_*` untracked | Audit docs + Phase 0 report sit only as untracked files | Commit docs with Phase 0 or a docs-only commit |

No history rewriting or stash discard was performed during this review.

---

## 3. Security and permission findings

### What is correct

Every Phase 0 route in `backend/src/modules/admin/module.routes.ts` (lines 114–198) and `GET /admin/token-ledgers` in `backend/src/modules/wallet/module.routes.ts` (lines 90–97) uses:

- `authenticate`
- `requireActiveAccount`
- `requirePermission` or `requireAnyPermission`

`requirePermission` / `requireAnyPermission` (`backend/src/common/middleware/authorize.ts`) enforce:

- `role === 'ADMIN'`, `purpose === 'access'`, `mfa === true`
- Active DB grant + MFA enrollment enabled
- Permission check against **DB grant role**, not client-supplied `staffRole`

Pagination/filters are Zod-validated after authz; they cannot bypass permission middleware.

Finance correctly lacks `ViewBookingHistory` / passenger list access. Audit writes remain unavailable via `/audit` (empty router).

### Findings

| ID | Severity | File / lines | Problem | Recommended correction |
| --- | --- | --- | --- | --- |
| S1 | **High** | `module.routes.ts` 137–153; `permissions.ts` 63–71 | Passenger directory uses `SuspendReinstateRiders OR ViewBookingHistory`. Support has `ViewBookingHistory` → full passenger list/search with phone numbers. Requirements/roadmap framed passenger list as Ops/Super (`ADMIN_IMPLEMENTATION_ROADMAP.md` Phase 0; matrix “NEW?” for Support). Least privilege: booking history ≠ directory browse | Restrict list/get to `SuspendReinstateRiders` (Ops/Super), or add a dedicated `ViewPassengers` granted only to Ops/Super; keep Support on booking-centric lookup |
| S2 | **High** | `console.service.ts` 266–270, 394–395; requirements §privacy | `GET /admin/bookings` and `:bookingId` return exact `pickupLatitude`/`pickupLongitude` and detail also returns destination coordinates to any role with `ViewBookingHistory` (includes Support). Requirements: exact coordinates only for GPS-gated roles; do not expose lat/lng to Support by default | Omit or approximate coords for Support; require `MonitorOperations` / `ViewTripGpsEvidence` (+ recent MFA for precise trails) for exact coordinates |
| S3 | Medium | `module.routes.ts` 191–197; `permissions.ts` 9, 40–41 | Audit logs gated by `ManageAdmins` (Super-only). Matches roadmap “Super initially,” but conflates **user administration** with **security audit read**. Future Ops compliance access would incorrectly require admin-management rights | Accept for Phase 0 Super-only; later introduce `ViewAuditLogs` (document if inventing) without granting invite/revoke |
| S4 | Medium | `console.service.ts` 183–190; `console.repository.ts` 224–232 | Passenger profile returns DOB/gender/homeLocation; repository still selects home lat/lng (omitted in response). Sensitive PII for Support via S1 | Narrow fields by role; avoid selecting unused home coordinates |
| S5 | Medium | `console.service.ts` 313–327 | Audit list returns raw `metadata` and `ipAddress` to Super — may contain sensitive operational detail from prior audited actions | Redact known sensitive metadata keys; document Super-only sensitivity |
| S6 | Medium | `module.routes.ts` 114–126; `permissions.ts` 63–71 | Analytics `anyOf` includes `InvestigateDisputes` and `ViewPayments` → Support receives connection-fee and token revenue aggregates (not only ops counts) | Split ops KPIs vs finance KPIs, or gate fee/token blocks on `ViewFinancialReports` / `ViewPayments` explicitly in the handler |
| S7 | Low | Phase 0 routes generally | Read endpoints do not use `requireRecentMfa` (unlike trip GPS / docs). Acceptable for many reads; booking exact coords (S2) are more sensitive than typical list fields | Apply recent MFA if exact coords remain on booking detail |

**Suspend/reactivate:** Unchanged existing routes; still `SuspendReinstateRiders` only — appropriate. Support can list passengers (S1) but cannot suspend — asymmetric privilege worth product confirmation.

---

## 4. API correctness findings

| ID | Severity | File / lines | Problem | Recommended correction |
| --- | --- | --- | --- | --- |
| A1 | **High** | `console.service.ts` 51–134; `console.schema.ts` 5–10 | `from`/`to` apply only to booking-fee and token aggregates. Passenger/rider counts, `bookings.byStatus`, `completedConnections`, and `refunds.byStatus` are **all-time**. Response still echoes `window`, which frontend will treat as applying to the whole payload | Document `windowAppliesTo: ['connectionFees','tokens']` (or filter all series); add tests for window isolation |
| A2 | Medium | `console.service.ts` 137–148 | `getFinancialReport` calls full `getAnalytics` (including passenger/rider/booking status work) then discards ops fields — wasteful and couples contracts | Dedicated finance repository path; keep response contract stable |
| A3 | Medium | `console.service.ts` 261–295 vs list shape | Booking detail spreads list item (`connectionFeePayment`) **and** full `payments[]` — duplicate fee representation; frontend must prefer one | Document canonical field; or omit `connectionFeePayment` on detail |
| A4 | Medium | Roadmap acceptance | OpenAPI/contract notes not updated for new routes | Add paths to API contract / Swagger before UI codegen |
| A5 | Low | `console.schema.ts` 28–38 | Booking status enum must stay in sync with Prisma `BookingStatus` manually | Derive from shared const or add schema test against Prisma enum |
| A6 | Low | List responses | Pagination nested in `data.pagination` (consistent with wallet) — fine, but differs from some modules that use `meta` | Stick to one pattern in admin UI client |

Validation: schemas are `.strict()`, UUID params, pageSize capped via shared pagination helpers — good. 404s for missing passenger/booking — good. Filters do not widen authz — good.

---

## 5. Financial accuracy findings

### Verified correct

- Fee aggregates filter `purpose: 'BOOKING_FEE'` only (`console.repository.ts` 77–79).
- Token purchase money uses `purpose: 'TOKEN_PURCHASE'` + `status: 'SUCCESS'` (112–115).
- Amounts exposed as `amountPesewas` with `currency: 'GHS'` and `unitPesewas: BOOKING_FEE_PESEWAS` (100) — no silent GHS float conversion in the API.
- Explicit `exclusions.transportationFareRevenue: false` note (`console.service.ts` 130–133).
- No transport-fare fields, distance×rate, or GMV-style metrics in console responses.
- SUCCESS / PENDING / FAILED fee buckets queried separately; refunds reported by `PaymentRefund.status` groupBy.

### Findings

| ID | Severity | File / lines | Problem | Recommended correction |
| --- | --- | --- | --- | --- |
| F1 | Medium | `console.service.ts` 75–81, 100–118; `countRefundsByStatus` | “Collected” is gross SUCCESS fee sum; refunds are **counts only**, not pesewas, and not window-filtered (A1). Net connection-fee revenue after refunds is not computable from the payload | Add `refunds.amountPesewasByStatus` (and window); document that `collected` is gross |
| F2 | Low | `console.service.ts` 75–80 | `ABANDONED` booking-fee payments omitted from analytics | Include abandoned count/amount or document exclusion |
| F3 | Low | Frontend risk | API returns pesewas; UI must divide by 100 for GH₵ display | Contract note + UI helper tests |

**Conclusion:** Phase 0 does **not** mistake transportation fares for Cyrlo revenue. Remaining issues are gross-vs-net clarity and date-window consistency, not fare invention.

---

## 6. Database and performance findings

Migration `20261112120000_admin_phase0_console_indexes`:

- `users(role, status)` — useful for passenger/rider counts and filtered lists  
- `payments(purpose, status, created_at)` — useful for fee/token aggregates  
- `audit_logs(created_at)` — useful for unfiltered chronological audit pages  

**Not applied to staging/production during this review.**

| ID | Severity | File / lines | Problem | Recommended correction |
| --- | --- | --- | --- | --- |
| D1 | Medium | `console.repository.ts` 170–178 | Passenger `q` uses `contains` on phone/displayName/fullName — cannot use btree indexes efficiently at scale | Document ops search patterns; consider `startsWith` on normalized phone or trigram later |
| D2 | Low | `console.repository.ts` 55–64, 100–109 | All-time `groupBy` on bookings/refunds will grow cost; no date predicate | Align with analytics window (A1) |
| D3 | Low | `listBookings` 312–363 | Single query with nested passenger/rider/latest fee — **no N+1**; good | Keep pattern |
| D4 | Low | Analytics `Promise.all` of ~12 queries | Acceptable for dashboard; watch DB connection load under multi-admin polling | Cache short TTL or materialize later |
| D5 | Low | `findPassenger` selects home lat/lng unused by service | Unnecessary sensitive column read | Drop from select |

Pagination uses `skip`/`take` + count in a transaction — standard; deep pages remain O(offset).

---

## 7. Test results

### Checks run (local, safe)

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | Pass |
| `vitest` `console.test.ts` + `console.permissions.test.ts` + `console.db.test.ts` | **3 files, 17 tests passed** |
| Production / Paystack / staging migrate | **Not run** (per rules) |

### Coverage assessment

Present: schema pagination limits, matrix constants, mocked analytics (no fare keys), passenger coordinate omission in service mapping, booking fee summary shape, audit list shape, isolated `requirePermission` probes, Postgres aggregate/list happy path.

| ID | Severity | Gap | Recommended correction |
| --- | --- | --- | --- |
| T1 | **High** | No HTTP tests of **actual** Phase 0 routers with `requireAnyPermission` (passengers, analytics) — probes only test single-permission helper | Supertest against `createAdminRouter` with mocked `findGrant` or DB grants per role |
| T2 | Medium | No assertion Finance **403** on `/admin/passengers` or Support **200/403** policy decision | Role matrix route tests |
| T3 | Medium | No test that `from`/`to` leaves booking/refund counts unchanged while fee sums change (A1) | Window isolation DB test |
| T4 | Medium | No wallet `token-ledgers` tests (schema/service/authz) | Add unit + permission probe |
| T5 | Low | No sensitive-exposure test that booking JSON must not include exact coords for Support | Add once S2 policy chosen |
| T6 | Low | DB test does not assert net fee vs refunds | Optional finance fixture |

**Tests passing ≠ authorization policy complete.** Matrix unit checks do not exercise mounted Express routes for `requireAnyPermission`.

---

## 8. Critical issues that must be fixed before frontend integration

Interpret “critical” as **blockers for unscoped UI work**. None are unauthenticated RCE-class flaws; they are product-security and contract blockers.

| Priority | ID | Must resolve before… |
| --- | --- | --- |
| 1 | **S2** | Building bookings browser / detail screens (exact coords vs privacy requirements) |
| 2 | **S1** | Building passenger directory (Support directory access vs Ops/Super intent) |
| 3 | **A1** | Building Overview KPI charts with date filters (misleading window) |
| 4 | **T1** (or manual security checklist) | Claiming route authz is proven for Phase 0 anyOf endpoints |

**Also required as a Phase 1 auth condition (not a Phase 0 API bug, but frontend-blocking):**

| ID | Severity | Detail |
| --- | --- | --- |
| B1 | **High** | `/auth/refresh` issues access tokens **without** `mfa` / `mfaAt` (`auth/module.service.ts` `issueAccess` ~291–298). Staff SPA must **not** use passenger refresh for privileged sessions until fixed; force admin MFA re-login (already noted in requirements). |

If product explicitly accepts Support passenger browse + Support exact booking coords + partial analytics windows, document those acceptances and downgrade S1/S2/A1 from blockers to tracked debt.

---

## 9. Non-blocking improvements

| ID | Severity | Item |
| --- | --- | --- |
| S3, S4, S5, S6 | Medium | Permission semantics / PII narrowing / analytics split |
| F1, F2 | Medium–Low | Net fee revenue + abandoned payments |
| A2–A6, D1–D5 | Medium–Low | Contract polish, performance, OpenAPI |
| G1 | Medium | Commit Phase 0 branch contents |
| Remaining gaps below | — | Later phases |

---

## 10. Remaining backend gaps — blockers vs later

| Gap | Before frontend? | Classification |
| --- | --- | --- |
| Admin session refresh / MFA preservation | **Yes for durable SPA sessions** (or mandatory re-MFA UX) | **Condition / Phase 1 blocker** if silent refresh expected |
| Live operations board API | No for auth/passengers/finance/zones | Later (Phase 4); use polling on bookings filters interim |
| Paginated rider directory | No — applications APIs exist for review UI | Later (Phase 3 enhancement) |
| Unified payment browser | No — refunds + token purchases + financial-reports suffice initially | Later |
| Platform config (`ManagePlatformConfig`) | No | Later / deprecate |
| Dedicated `ManageRiderDocuments` | No — identity routes use `AccessIdentityDocuments` | Later / deprecate |
| Staff notification broadcast | No | Later |
| OpenAPI documentation | **Should before typed client** | Condition for clean FE integration (A4) |

**Genuine blockers for a full dashboard:** S1/S2/A1 policy + MFA refresh strategy.  
**Not blockers for starting FE:** live ops, rider directory, unified payments, platform config, broadcasts.

---

## 11. Recommended next implementation phase

1. **Resolve conditions** (S1, S2, A1) with product + small backend patch **or** written acceptance.  
2. **Commit** Phase 0 (+ review report) on `feature/admin-phase-0`; keep Ghana stash untouched.  
3. **Phase 1 — Admin auth shell** only: OTP → MFA → store staff tokens; **disable** passenger `/auth/refresh` for admin; idle timeout aligned with access TTL; `GET /admin/me` nav.  
4. Then **Phase 2 Overview** only after A1 clarified.  
5. Passenger/booking UIs after S1/S2.  
6. Finance screens can largely proceed on existing refunds/packages + `financial-reports` / `token-ledgers` once auth shell exists (Finance lacks booking coords exposure).

Do **not** deploy Phase 0 to staging/production until committed, migrated deliberately, and conditions reviewed.

---

## 12. Review summary

**Inspected:** Git branch/HEAD/`origin/main`/stash/working tree; `permissions.ts`; `authorize.ts`; admin `module.routes.ts`, `console.*`, wallet admin ledger path; auth `issueAccess`/refresh; Phase 0 migration; audit/requirements/roadmap docs; Phase 0 tests.

**Checks run:** TypeScript `--noEmit`; Vitest console unit + permission + Postgres DB suites (17 passed). No staging/production migrate, no Paystack, no pushes, no stash changes, no application code edits.

**Safe to proceed?** **Conditionally yes** — start **Phase 1 auth shell** with forced re-MFA (no privileged refresh), and treat passenger/booking/overview UI as blocked on S1/S2/A1 until fixed or product-accepted. Unconditional full-dashboard frontend work is **not** recommended yet.

---

## 13. Product-approved corrections (implemented 2026-11-12)

Product accepted the three review conditions. Fixes landed on `feature/admin-phase-0` (working tree; **not committed** in this pass). Original review text above is retained as historical findings.

### S1 — Passenger directory permission

| Item | Detail |
| --- | --- |
| Decision | Directory/detail require **`ViewBookingHistory` only** |
| Change | `module.routes.ts`: removed `requireAnyPermission(SuspendReinstateRiders, ViewBookingHistory)`; both `GET /admin/passengers` and `/:passengerId` use `requirePermission(ViewBookingHistory)`. Suspend/reinstate mutations unchanged. |
| Tests | `console.permissions.test.ts` — Support (history, no suspend) allowed; Finance denied; Suspend is not the directory gate; `PASSENGER_DIRECTORY_PERMISSION` constant. `console.test.ts` matrix assertion. |

### S2 — Booking coordinate privacy

| Item | Detail |
| --- | --- |
| Decision | Support (and ordinary booking history for **all** roles) must not receive exact lat/lng |
| Change | Repository no longer selects pickup/destination coordinates for admin list/detail. Service serialization sets `exactCoordinatesIncluded: false` and `privacy` notes. Passenger booking history likewise omits coords. No new permission string. Precise location remains a separate decision (existing MFA `trip-gps`). |
| Tests | `console.test.ts` + `console.db.test.ts` — full JSON must not match latitude/longitude/lat/lng/lon. |

### A1 — Analytics date filters

| Item | Detail |
| --- | --- |
| Decision | `from`/`to` apply to **all period metrics**; snapshots stay current-state |
| Change | Response contract: `snapshot` vs `period`; `dateRange` documents inclusive UTC `createdAt` bounds. Bookings-by-status, fees, refunds (count+amount), and tokens all receive the same filter. Snapshot passenger/rider/available/pending ignore the window. |
| Tests | Unit: period filter passed to all period repo methods; snapshot stable when period counts change. DB: all-time vs 2026+ window shrinks period completed/fees while snapshot totals unchanged; ancient window still returns 2020 fixture period rows. |

### Verification of this correction pass

```
npx tsc -p tsconfig.json --noEmit
npx vitest run src/modules/admin/console.test.ts src/modules/admin/console.permissions.test.ts src/modules/admin/console.db.test.ts
```

Result: typecheck clean; **3 files / 20 tests passed** (includes Postgres integration).

### Remaining (not in this correction scope)

- Admin `/auth/refresh` MFA preservation (Phase 1 auth shell constraint).
- Live ops board; OpenAPI path annotations; commit of Phase 0 branch.
