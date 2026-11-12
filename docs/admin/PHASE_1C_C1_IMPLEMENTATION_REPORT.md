# Cyrlo Ride — Phase 1C-C1 Implementation Report  
## Frontend API Foundation (Review + Account Actions)

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Baseline HEAD:** `c306fc31c4c932624ac8dbe00755d78d624e5df5`  
**Scope:** `apps/cyrlo_admin` API types/clients/tests only  
**Mode:** Local work — **no stage / commit / push / deploy**  
**Ghana/maps stash:** preserved  

---

## 1. Summary

Typed admin clients now cover:

| Method | Path | Client |
| --- | --- | --- |
| `GET` | `/admin/riders/applications` | `fetchPendingApplications` |
| `GET` | `/admin/riders/applications/:riderId` | `fetchRiderApplication` |
| `POST` | `/admin/riders/applications/:riderId/review` | `reviewRiderApplication` |
| `POST` | `/admin/riders/vehicles/:vehicleId/review` | `reviewRiderVehicle` |
| `POST` | `/admin/users/suspend` | `suspendUser` |
| `POST` | `/admin/users/reinstate` | `reinstateUser` |

All use shared `apiRequest`. Review bodies follow **riders-module** `reviewRiderSchema` (`decision` + optional `reason`), not the unused admin legacy schema.

**UI / C2 not started.**

---

## 2. Files changed

| File | Change |
| --- | --- |
| `apps/cyrlo_admin/src/api/types.ts` | Application, review, vehicle-result, suspend/reinstate types |
| `apps/cyrlo_admin/src/api/admin-riders.ts` | Pending/detail/review/vehicle-review clients |
| `apps/cyrlo_admin/src/api/admin-users.ts` | Suspend/reinstate clients (**new**) |
| `apps/cyrlo_admin/src/api/admin-riders.mutations.test.ts` | Path/method/body/error tests (**new**) |
| `apps/cyrlo_admin/src/api/admin-users.test.ts` | Suspend/reinstate tests (**new**) |
| `docs/admin/PHASE_1C_C1_IMPLEMENTATION_REPORT.md` | This report |

**Unchanged:** backend, Flutter, permissions, schema, production UI pages.

---

## 3. API contracts (as typed)

### Review decision body (application + vehicle)

```ts
{ decision: 'APPROVED' | 'REJECTED'; reason?: string }
```

- Reject: backend requires `reason` length ≥ 5.
- Approve: `reason` optional; client omits when not provided.

### Pending list item

`riderId`, `fullName`, `phoneNumber`, `status`, `verificationStatus`, `submittedAt`, `vehicleCount`

### Application detail / review result

Matches `getApplicationForOps`: documents metadata, vehicles, `reviewHistory` (`id`, `decision`, `reason`, `vehicleId`, `createdAt`, `actorId`), `hasEncryptedGhanaCard`, `ghanaCardNumber: null`.

### Vehicle review result

`publicVehicleView`: id, category, registration, make/model/colour/capacity, verificationStatus, rejectionReason.

### Suspend / reinstate

- Body: `{ userId, reason }` (reason required, 2–200 on backend).
- Suspend result: `{ userId, status: 'SUSPENDED', activeTripsPreserved, sessionsRevoked }`
- Reinstate result: `{ userId, status: 'ACTIVE' }`

---

## 4. Vehicle-approval enforcement finding (**STOP GATE**)

### Product decision

> Every required vehicle must receive an **explicit individual** review before application approval.

### Current backend behavior

`RidersService.reviewApplication` (`backend/src/modules/riders/module.service.ts` ~L653–686):

- On `APPROVED`, if any vehicle is still `PENDING_REVIEW`, the service **auto-approves** those vehicles in-loop, writes vehicle review decisions, then sets profile `APPROVED`, role `RIDER`, and ensures wallet.
- Precondition only requires ≥1 vehicle in `APPROVED` **or** `PENDING_REVIEW` — it does **not** require prior individual vehicle reviews.

`POST /admin/riders/vehicles/:vehicleId/review` already supports explicit per-vehicle decisions.

### Can C1/C2 enforce this safely with current endpoints?

| Approach | Safe? |
| --- | --- |
| FE only calls application `APPROVED` after all vehicles are already `APPROVED` | **Workflow guidance only** — not enforcement; any direct API caller can still auto-approve pending vehicles |
| FE “safe approve” helper that assumes vehicles were reviewed | **Forbidden** by C1 instructions; would invent false safety |
| Backend reject `APPROVED` while any vehicle remains `PENDING_REVIEW` | **Required for real enforcement** |

**Conclusion:** Backend enforcement is necessary. **No backend code was changed in C1.**

### Smallest proposed backend change (for later approval)

In `reviewApplication` when `decision === 'APPROVED'`:

1. If any vehicle has `verificationStatus === 'PENDING_REVIEW'`, throw **400**  
   e.g. `All vehicles must be individually reviewed before application approval`.
2. Require at least one vehicle already `APPROVED` (keep a clear 400 if none).
3. **Remove** the auto-approve loop over `PENDING_REVIEW` vehicles.
4. Leave reject path as-is (may still cascade-reject pending vehicles), unless product wants symmetry later.
5. Update unit tests in `riders/module.test.ts` accordingly.

No permission-matrix or migration required for that change.

### C1 client stance

`reviewRiderApplication` documents the auto-approve behavior in a comment and sends the decision as-is. It does **not** implement a frontend-only safe-approve path.

**Stop for review** before C2 UI that would depend on this policy, and before any backend patch.

---

## 5. Test results

| Command | Result |
| --- | --- |
| Focused mutation/user tests | **11 passed** |
| `npm test` (full) | **16 files / 69 tests passed** |
| `npm run typecheck` | Pass (after test typing fix) |
| `npm run build` | Pass |

Coverage includes paths/methods, body serialization (optional vs required reason), and 401/403/409 propagation via `ApiError` / unauthorized handler.

---

## 6. Outcome / next step

- C1 API foundation is ready for review.
- **Do not start C2** until the vehicle-approval enforcement decision is accepted (backend patch vs temporary UI-only gating with known hole).
- Discovery report (`PHASE_1C_C_DISCOVERY_REPORT.md`) remains untracked from prior audit unless separately committed.
