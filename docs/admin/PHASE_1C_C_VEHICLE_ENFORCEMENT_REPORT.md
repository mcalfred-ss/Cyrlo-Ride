# Cyrlo Ride — Phase 1C-C Vehicle Review Enforcement Report

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Baseline HEAD:** `c306fc3` (unchanged; work uncommitted)  
**Scope:** Backend rider application approval only  
**Mode:** Local — **no stage / commit / push / deploy**  
**Frontend C1 changes:** preserved (untouched)  
**Ghana/maps stash:** preserved  

---

## 1. Objective

Enforce: **every vehicle must receive an explicit individual review before application approval.**  
Application approval must not silently auto-approve `PENDING_REVIEW` vehicles.

---

## 2. Behavior changes

### Before

`RidersService.reviewApplication(APPROVED)`:

- Allowed approval while vehicles were still `PENDING_REVIEW`.
- Auto-approved those vehicles and wrote vehicle review decisions inside the application approve path.

### After

| Case | Result |
| --- | --- |
| Any vehicle `PENDING_REVIEW` | **409 CONFLICT** — `All vehicles must be individually reviewed before application approval` |
| No vehicle `APPROVED` (e.g. all `REJECTED`) | **409 CONFLICT** — `At least one vehicle must be approved before application approval` |
| ≥1 `APPROVED`, none `PENDING_REVIEW` | Application → `APPROVED`, user role → `RIDER`, wallet ensured; **vehicle rows unchanged** |
| Application `REJECTED` | **Unchanged** — profile rejected; still-pending vehicles cascade to `REJECTED` |

Audit `rider.application.approved` is recorded **only after** a successful atomic approval (not on blocked attempts).

---

## 3. Transaction / concurrency protection

New repository method: `RidersRepository.approveApplicationAtomic`

Inside a single `prisma.$transaction`:

1. `SELECT … FROM rider_profiles … FOR UPDATE`
2. `SELECT … FROM rider_vehicles … FOR UPDATE`
3. Evaluate pending / approved guards
4. Update profile + user role + wallet/signup bonus + application-level review decision  
   **without** updating vehicle verification rows

Effects:

- Concurrent double-approve: one commits; the other sees non-`PENDING_REVIEW` profile → **409**.
- Vehicle status cannot flip under the approval transaction without waiting on the same row locks.
- Partial success (role changed but audit/wallet skipped) is avoided for the approve path by bundling writes; audit remains outside the DB tx but only runs after the tx commits.

Memory test double uses a per-rider promise lock as a stand-in for `FOR UPDATE` serialization.

---

## 4. Tests and results

| Suite | Coverage | Result |
| --- | --- | --- |
| `application-review.test.ts` | Pending blocked; all-rejected blocked; approve with mixed approved+rejected; no auto-approve; reject cascade unchanged; concurrent double-approve + single audit | **6 passed** |
| `application-review.db.test.ts` | Postgres FOR UPDATE path + concurrent approve | **1 passed** |
| `module.test.ts` | Full onboarding flow now reviews vehicle before approve | **Pass** |
| `directory.test.ts` | Regression | **Pass** |
| `admin/suspend.test.ts` | Regression | **Pass** |
| `npm run typecheck` (backend) | | **Pass** |

Broader command: `npx vitest run src/modules/riders src/modules/admin/suspend.test.ts` — green in local run.

---

## 5. Changed files

| File | Change |
| --- | --- |
| `backend/src/modules/riders/module.service.ts` | Approve via atomic repo; reject path preserved; audit only on success |
| `backend/src/modules/riders/module.repository.ts` | `approveApplicationAtomic` with FOR UPDATE |
| `backend/src/modules/riders/memory-riders-repository.ts` | Matching atomic approve + lock |
| `backend/src/modules/riders/module.test.ts` | Explicit vehicle review before approve |
| `backend/src/modules/riders/application-review.test.ts` | **New** unit coverage |
| `backend/src/modules/riders/application-review.db.test.ts` | **New** Postgres coverage |
| `docs/admin/PHASE_1C_C_VEHICLE_ENFORCEMENT_REPORT.md` | This report |

**Not modified:** permissions, Prisma schema/migrations, Flutter, Phase 1C-C1 frontend API clients/UI.

---

## 6. Remaining limitations

1. **Reject path** still cascade-rejects `PENDING_REVIEW` vehicles (intentionally unchanged).
2. **DRAFT vehicles** on a `PENDING_REVIEW` application are uncommon (submit promotes vehicles), but if present they are neither pending nor approved — approval would 409 for lack of an approved vehicle. No product change requested for DRAFT.
3. **Application reject** is not yet a single DB transaction (pre-existing pattern); only approve was hardened.
4. Frontend C2 still needed to drive per-vehicle review UX before calling application approve.

---

## 7. Stop

Backend enforcement complete for review. **Do not start C2** until product accepts this report. No commit/push performed.
