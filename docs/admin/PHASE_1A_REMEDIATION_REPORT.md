# Cyrlo Ride — Phase 1A Remediation Report  
## Closing final-review conditions C1–C4

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**HEAD (unchanged):** `545f455254168eaa47b78d906e035bc294cfc601` — `feat(admin): add phase 0 console backend foundation`  
**Status:** Remediation implemented in working tree — **not staged, not committed, not pushed, not deployed**

---

## 1. Git safety

| Item | Value |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | `545f455` (Phase 0 intact; no new commit) |
| Staged | Nothing |
| Ghana/maps stash | Intact: `stash@{0}: wip-ghana-maps-preserve-phase0` |
| Flutter `apps/cyrlo_app` | Untouched |
| Production/staging env values | Not modified (local `.env` / deploy hosts unchanged by this remediation) |

---

## 2. Conditions addressed

| ID | Status | Summary |
| --- | --- | --- |
| C1 | **CLOSED** | Provisional in-memory session rolled back if `/admin/me` fails |
| C2 | **CLOSED** | Auth operation generation guard rejects stale MFA/enrollment completions |
| C3 | **CLOSED** | Production `loadEnv` rejects `OTP_DEV_EXPOSE_CODE=true`; admin echo uses `canExposeDevelopmentOtp` |
| C4 | **CLOSED** | Lifecycle tests for failed MFA, logout, reload, enroll success, C1, C2 |

---

## 3. Files changed

### Frontend (`apps/cyrlo_admin`)

| File | Change |
| --- | --- |
| `src/auth/AuthProvider.tsx` | C1 rollback; C2 `authOpIdRef`; safer catch; acknowledge clears error/dev code |
| `src/auth/AuthProvider.lifecycle.test.tsx` | **New** — C4 lifecycle suite (6 tests) |
| `src/api/admin-auth.ts` | Prior fix retained: enroll start forces `POST` |
| `src/pages/MfaEnrollPage.tsx` | Prior fix retained: Retry on enroll QR failure |
| `src/api/client.ts` / `client.test.ts` | Prior hardening retained (network + public 401 isolation + enroll POST test) |

### Backend

| File | Change |
| --- | --- |
| `src/config/env.ts` | Production refine: forbid `OTP_DEV_EXPOSE_CODE=true` |
| `src/modules/admin/module.service.ts` | Use `canExposeDevelopmentOtp(env)` for `developmentCode` |
| `src/config/env.security.test.ts` | Production fail-closed tests for OTP expose |
| `.env.example` | Document fail-closed / local-only policy |

### Docs

| File | Change |
| --- | --- |
| `docs/admin/PHASE_1A_FINAL_REVIEW.md` | §12 remediation status for C1–C4 |
| `docs/admin/PHASE_1A_REMEDIATION_REPORT.md` | This report |

---

## 4. What was corrected

### C1
`establishFromTokens` still needs the access token available for `GET /admin/me`, so it may set memory provisionally, then:
- on `/admin/me` failure → clear memory (only if this attempt’s token is still installed) and clear `me`;
- never leave `phase === 'authenticated'` without a successful profile load.

### C2
`authOpIdRef` increments when OTP verification installs a new MFA/enrollment challenge and at the start of each MFA verify / enroll confirm. Completions whose `opId` no longer matches are ignored **before** mutating memory and again after `/admin/me`, so a late stale response cannot replace a fresher session.

### C3
- Runtime exposure already required `NODE_ENV !== 'production' && OTP_DEV_EXPOSE_CODE` via `canExposeDevelopmentOtp`.
- **New:** `loadEnv` fails closed if production sets `OTP_DEV_EXPOSE_CODE=true`.
- Admin OTP path now calls `canExposeDevelopmentOtp` (aligned with passenger auth).
- **Deploy requirement:** staging/production → `NODE_ENV=production`, `OTP_DEV_EXPOSE_CODE=false`.

### C4
New focused tests (mocked fetch only; no SMS/payments):

1. Failed MFA stays on `mfa_required`, no access token  
2. Logout clears memory + identity  
3. Remount after `clearMemorySession` stays `anonymous` (reload model)  
4. Enroll confirm → `authenticated`  
5. Failed `/admin/me` rolls back tokens  
6. Stale concurrent MFA ignored  

---

## 5. Verification results (actual)

### Admin SPA (`apps/cyrlo_admin`)

| Check | Result |
| --- | --- |
| `npm run test` | **27 passed** (7 files) |
| `npm run typecheck` | **pass** |
| `npm run build` | **pass** |

### Backend (relevant)

| Check | Result |
| --- | --- |
| `npx vitest run src/config/env.security.test.ts` | **14 passed** (includes 3 new OTP expose cases) |

No real SMS, Paystack, or live vendor calls in these runs.

---

## 6. Remaining risks / limitations

1. **Forced re-MFA** after access TTL remains by design until backend refresh preserves MFA.  
2. **Single-tab** generation guard; multi-tab in-memory sessions are independent.  
3. **N2** recovery-code dismiss UX still optional.  
4. **Shared hosts must not run with `NODE_ENV=development`** if OTP expose could be enabled — deploy with `NODE_ENV=production`.  
5. Working tree still contains the full Phase 1A SPA + docs; **await review before commit**.

---

## 7. Final restrictions observed

- No commit, push, merge, deploy, or staging.  
- Phase 1B not started.  

**Stop — awaiting review.**
