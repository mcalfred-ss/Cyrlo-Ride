# Cyrlo Ride — Phase 1C-A Final Review  
## Backend Rider Management Read APIs

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Expected baseline HEAD:** `8f4184027c68f20c0011e777cb5c34abc74a8025`  
**Verified HEAD:** `8f4184027c68f20c0011e777cb5c34abc74a8025`  
**Mode:** Review only — **not staged / not committed**

---

## 1. Baseline and scope

| Check | Result |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | Matches expected Phase 1B commit |
| Ghana/maps stash | Intact: `stash@{0}: wip-ghana-maps-preserve-phase0` |
| Permissions / role map | **Unchanged** |
| Suspend / reinstate | **Unchanged** (no diff under `admin/module.service` / schemas / authz) |
| Migrations / schema | **None** |
| Flutter | Untouched |

### Diff inventory (Phase 1C-A + discovery docs)

**Modified**

- `backend/src/modules/riders/module.controller.ts`
- `backend/src/modules/riders/module.repository.ts`
- `backend/src/modules/riders/module.routes.ts`
- `backend/src/modules/riders/module.schema.ts`
- `backend/src/modules/riders/module.service.ts`

**Added**

- `backend/src/modules/riders/directory.test.ts`
- `backend/src/modules/riders/directory.db.test.ts`
- `docs/admin/PHASE_1C_A_IMPLEMENTATION_REPORT.md`
- `docs/admin/PHASE_1C_DISCOVERY_REPORT.md` (prior discovery; still untracked)
- `docs/admin/PHASE_1C_A_FINAL_REVIEW.md` (this file)

No `.env`, secrets, `node_modules`, or `dist` in the change set.

---

## 2. Review findings

### 2.1 Pending applicants vs approved riders — **PASS**

List and profile both return distinguishable fields:

| Field | Purpose |
| --- | --- |
| `verificationStatus` | `DRAFT` / `PENDING_REVIEW` / `APPROVED` / `REJECTED` |
| `role` | `PASSENGER` (typical applicant) vs `RIDER` (after approval) |
| `status` | Account `ACTIVE` / `SUSPENDED` / `DELETED` |

Directory population is “has `rider_profile`”, so applicants appear before role flips to `RIDER`. Filters support `verificationStatus` and `status` independently.

### 2.2 Deterministic ordering / pagination — **PASS (corrected)**

**Issue found:** initial list used only `orderBy: { createdAt: 'desc' }`, which is non-deterministic when timestamps tie and can skip/duplicate across `skip`/`take` pages.

**Scoped correction applied:**

```ts
orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
```

**Evidence:** Postgres test  
`directory.db.test.ts` → “uses createdAt DESC then id DESC so tied timestamps paginate without duplicates” — two riders with identical `createdAt`, `pageSize: 1` → page1 = higher UUID, page2 = lower UUID, no overlap.

### 2.3 `ReviewRiders` + MFA — **PASS**

Both `GET /admin/riders` and `GET /admin/riders/:riderId` use ops middleware:

`authenticate` → `requireActiveAccount` → `requirePermission(RIDER_DIRECTORY_PERMISSION)`  
where `RIDER_DIRECTORY_PERMISSION === Permission.ReviewRiders`.

`requirePermission` rejects non-ADMIN / non-access / `mfa !== true`, missing enrollment, and roles without `ReviewRiders` (Support/Finance). Covered by `directory.test.ts` authz cases.

### 2.4 Sensitive material exclusion — **PASS**

Profile/list selects omit latitude/longitude; service sets `privacy.exactCoordinatesIncluded: false`.  
Assertions reject `latitude`/`longitude`/`ghanaCard`/`password`/`secret`/`accessToken`/`refreshToken` in JSON.  
Ghana Card / docs remain on separate MFA-recent identity routes. Coordinate reads remain on `GET /admin/riders/:riderId/location`.

### 2.5 Suspension / reinstatement — **PASS (unchanged)**

No edits to suspend/reinstate handlers, schemas, or permission grants. Existing behavior (mandatory reason, trips preserved, availability forced offline, matching ACTIVE filter) untouched.

---

## 3. Verification commands

| Command | Result |
| --- | --- |
| `npx vitest run src/modules/riders/directory.test.ts src/modules/riders/directory.db.test.ts` | **10 passed** (was 9; +1 deterministic-order DB case) |
| `npx tsc -p tsconfig.json --noEmit` | **Pass** |

---

## 4. Remaining risks

| Risk | Severity | Note |
| --- | --- | --- |
| Token **balance** on profile under `ReviewRiders` | Low | Ops snapshot only; ledger history still Finance-gated. Product may later split if undesired. |
| Applicants still `role=PASSENGER` in directory | Info | Intended; use `verificationStatus` + `role` together in UI. |
| Discovery + 1C-A docs uncommitted | Process | Include intentionally when committing 1C-A. |
| No HTTP integration test hitting Express mount order | Low | Route order reviewed (`/` and `/applications*` before `/:riderId`); unit/DB cover service/repo. |
| Frontend not built | Expected | Phase 1C-B. |

---

## 5. Verdict

**READY TO COMMIT** after this review, with the secondary `id DESC` sort included.

Do **not** stage/commit in this step (per instructions). Next step is an explicit commit request covering rider module changes + 1C docs as product prefers.
