# Cyrlo Ride — Phase 1C-B Test Remediation Report  
## Closing Final Review Test Conditions

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Baseline HEAD:** `8fbaef42070e7ad91ff98981c19fa29bb769bdfb`  
**Scope:** Test-only (no production UI/API/behavior changes)  
**Mode:** Local remediation — **no stage / commit / push / deploy**

---

## 1. Conditions addressed

| # | Final-review condition | Status |
| --- | --- | --- |
| 1 | Committed directory stale-request / request-ID race test | **Closed** |
| 2 | Profile back-navigation asserts query-string preservation | **Closed** |

No product defects were exposed. Production logic was not modified.

---

## 2. Changed files

| File | Change |
| --- | --- |
| `apps/cyrlo_admin/src/pages/RidersPage.test.tsx` | Added out-of-order directory race test |
| `apps/cyrlo_admin/src/pages/RiderProfilePage.test.tsx` | Replaced weak back-nav check with full directory → profile → back query assertion |
| `docs/admin/PHASE_1C_B_TEST_REMEDIATION_REPORT.md` | This report |

**Unchanged:** backend, Flutter, permissions, schema, API contracts, production React components, styling, unrelated tests.  
**Stash:** Ghana/maps stash preserved.

---

## 3. Test 1 — Directory stale-request race

**Location:** `RidersPage.test.tsx` — `ignores a slower prior directory response after a newer filter/page request`

### Scenario

1. Mount directory at  
   `?verificationStatus=APPROVED&page=1&pageSize=10&status=ACTIVE`  
   (older request held open).
2. Navigate (before older resolves) to  
   `?q=Kofi&status=ACTIVE&verificationStatus=DRAFT&availability=OFFLINE&page=2&pageSize=10`  
   (newer request held open).
3. Resolve **newer** response first (page 2, total 3, applicant “Kofi Applicant”).
4. Resolve **older** response afterward (page 1, total 40, “Ama Rider”).

### Assertions

- Newer row (`Kofi Applicant`) is shown; older row (`Ama Rider`) never appears.
- Pagination remains **Page 2** / **showing 1 of 3**; count remains **3 rider profiles**.
- After older resolves, newer results/pagination/filters/search draft remain unchanged (`DRAFT`, `q=Kofi`, pageSize `10`).

Uses the existing `requestId` guard in `RidersPage` via URL-driven concurrent fetches (`createMemoryRouter` + deferred `fetch` promises).

---

## 4. Test 2 — Profile back-navigation query preservation

**Location:** `RiderProfilePage.test.tsx` — `preserves directory query params when returning from profile`

### Scenario

1. Open `/riders` with representative query:  
   `q=Kofi&status=ACTIVE&verificationStatus=PENDING_REVIEW&availability=OFFLINE&page=2&pageSize=10`
2. Click the directory row link into `/riders/:riderId` (query forwarded).
3. Click **Back to directory** (`data-testid="rider-back"`).

### Assertions

- Returned pathname is `/riders`.
- `URLSearchParams` retain exact values: `q`, `status`, `verificationStatus`, `availability`, `page`, `pageSize`.
- Directory probe + filter/search controls reflect the same values after return.

---

## 5. Verification

Commands run in `apps/cyrlo_admin`:

| Command | Result |
| --- | --- |
| `npm test` (rider page files) | **13 passed** |
| `npm test` (full suite) | **14 files / 58 tests passed** |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

---

## 6. Outcome

Final-review conditions **F2** and **F3** from `PHASE_1C_B_FINAL_REVIEW.md` are closed by committed automated coverage. Phase 1C-C not started.
