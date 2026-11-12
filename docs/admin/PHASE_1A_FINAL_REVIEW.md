# Cyrlo Ride — Phase 1A Final Security and Integration Review  
## Admin Authentication Shell (`apps/cyrlo_admin`)

**Date:** 2026-11-12  
**Mode:** Independent READ-ONLY review — no application code modified by this review  
**Branch:** `feature/admin-phase-0`  
**Phase 0 commit:** `545f455254168eaa47b78d906e035bc294cfc601`  
**Reviewer scope:** Git safety, auth state machine, token handling, live backend contract comparison, 401/403 behavior, role/nav matrix, FE config, tests/build

---

## Verdict: APPROVED WITH CONDITIONS

Phase 1A correctly implements a fail-closed privileged admin shell: OTP → MFA verify/enroll → in-memory MFA access session → `GET /admin/me`, with no privileged `/auth/refresh` restoration and no access-token persistence in `localStorage`.

No **security blockers** were found that would force `NOT APPROVED` for this phase’s stated scope (auth shell + placeholders only). Several **conditions** must be resolved before treating the SPA as production-ready operator tooling, and a few **non-blocking** gaps remain in tests and race hardening.

---

## 1. Git safety

| Check | Result |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | `545f455` — `feat(admin): add phase 0 console backend foundation` (intact) |
| Staged | Nothing staged |
| Commit / push / merge / deploy during Phase 1A work | No new commit on this branch beyond Phase 0; working tree uncommitted |
| Ghana/maps stash | Intact: `stash@{0}: On main: wip-ghana-maps-preserve-phase0` |

**Working tree (uncommitted, not unexpected for Phase 1A):**

| Path | Notes |
| --- | --- |
| `apps/cyrlo_admin/` | New SPA (untracked); `.env` / `node_modules` / `dist` gitignored |
| `admin/README.md` | Modified — points to SPA |
| `docs/admin/PHASE_1A_DISCOVERY_REPORT.md` | Untracked |
| `docs/admin/PHASE_1A_IMPLEMENTATION_REPORT.md` | Untracked |
| This review file | Created by review only |

**Note:** Live working tree includes post-report hardening (network error mapping, public-auth 401 isolation, retry UI). Reported “17 tests” is stale; current suite is **20** tests (see §8).

---

## 2. Authentication state machine

### Observed phases (`AuthProvider.tsx`)

| Phase | Entry | Exit to privileged dashboard? |
| --- | --- | --- |
| `anonymous` | Initial / after logout / after acknowledge expiry | No |
| `awaiting_otp` | Successful `POST /admin/auth/otp` | No |
| `mfa_required` | OTP verify `MFA_REQUIRED` | No (holds `mfaToken` only) |
| `mfa_enrollment_required` | OTP verify `MFA_ENROLLMENT_REQUIRED` | No (holds `enrollmentToken` only) |
| `authenticated` | Only after `establishFromTokens` succeeds | Yes |
| `session_expired` | Access expiry timer or privileged API 401 | No |

### `establishFromTokens` gate (critical path)

```119:132:apps/cyrlo_admin/src/auth/AuthProvider.tsx
  const establishFromTokens = useCallback(
    async (accessToken: string, refreshToken: string) => {
      if (!hasPrivilegedMfaAssurance(accessToken)) {
        clearMemorySession();
        throw new ApiError(401, 'MFA_REQUIRED', 'Access token lacks MFA assurance');
      }
      setMemorySession({ accessToken, refreshToken });
      const profile = await loadMeOrExpire();
      setMe(profile);
      ...
      setPhase('authenticated');
```

`hasPrivilegedMfaAssurance` requires `role === 'ADMIN'`, `mfa === true`, non-expired `exp`, and rejects non-`access` purposes (`token-claims.ts` L26–34). Enrollment / pending MFA JWTs cannot satisfy this check.

Enrollment is only marked complete after backend `POST /admin/mfa/enroll/confirm` returns session tokens; FE does not flip `authenticated` on QR start alone (`MfaEnrollPage.tsx` + `confirmEnrollment`).

Router guard (`RequireMfaSession.tsx`) additionally requires `phase === 'authenticated'`, `me`, `staffRole`, live MFA token claims, and `canAccessPath`.

### Access-denied / session-expired screens

- `/forbidden` — role path denial  
- `/session-expired` — privileged expiry / privileged 401  

### State-machine findings

#### C1 — Orphan privileged tokens if `/admin/me` fails after `setMemorySession`  
- **Severity:** Medium (Condition)  
- **File/lines:** `apps/cyrlo_admin/src/auth/AuthProvider.tsx` L119–132; `apps/cyrlo_admin/src/api/client.ts` L71–82  
- **Evidence:** Memory session is written **before** `loadMeOrExpire()`. On non-401 failures (network, 403, 5xx), `onUnauthorized` does not run; phase stays pre-auth while `getAccessToken()` may still hold an MFA access JWT.  
- **Risk:** Orphaned privileged bearer in JS memory; unlikely to open the dashboard because phase ≠ `authenticated`, but any future call that uses the default authenticated client could attach it.  
- **Recommended correction:** Clear memory session in `establishFromTokens` `catch` / only call `setMemorySession` after `/admin/me` succeeds (or roll back on any failure).

#### C2 — No async generation / stale-response guard  
- **Severity:** Low–Medium (Condition)  
- **File/lines:** `AuthProvider.tsx` `verifyMfa` / `confirmEnrollment` / `establishFromTokens`  
- **Evidence:** Overlapping submits can resolve out of order; later obsolete success could overwrite a newer session.  
- **Risk:** Rare race to wrong session identity after double-submit.  
- **Recommended correction:** Monotonic request id / abort controller; ignore stale resolutions.

#### N1 — `acknowledgeSessionExpired` incomplete cleanup  
- **Severity:** Low (Non-blocking)  
- **File/lines:** `AuthProvider.tsx` L295–298  
- **Evidence:** Clears phase + phone only; does not clear `error` / `developmentCode`.  
- **Risk:** Cosmetic stale error/dev-code display.  
- **Recommended correction:** Reset remaining auth UI fields.

---

## 3. Token security

| Requirement | Assessment |
| --- | --- |
| Access token in memory only | **Pass** — `session-store.ts`; tests assert `localStorage` null |
| Refresh token not in local/sessionStorage | **Pass** — memory only; used for logout |
| No fabricated MFA claims | **Pass** — claims decoded from JWT; dashboard also requires `/admin/me` under backend MFA middleware |
| No automatic privileged refresh | **Pass** — no FE call to `/auth/refresh`. Backend `issueAccess` on refresh omits `mfa` (`backend/src/modules/auth/module.service.ts` L291–300) |
| Expiry clears protected access | **Pass** — timer (−5s skew) → `session_expired`; guard redirects |
| Reload requires re-auth | **Pass** — in-memory session lost |
| Logout clears privileged state | **Pass** — always clears in `finally` |
| Logout contract | **Pass** — `POST /auth/logout` with Bearer access + `{ refreshToken }` (`min 20`), matches `logoutSchema` / `authenticate` + `requireActiveAccount` |
| Tokens in logs/URLs | **Pass** — not observed in SPA logging; not placed in routes |
| Service worker / HTTP cache of authed JSON | **Pass** — no service worker; `fetch` default; no SW registration in app |

#### N2 — Recovery codes retained in React state for the session  
- **Severity:** Low (Non-blocking)  
- **File/lines:** `AuthProvider.tsx` L238; `HomePage.tsx` L16–24  
- **Evidence:** Codes remain displayed whenever `auth.recoveryCodes` is set until logout/expiry. Backend issues them once; FE keeps them in memory for the login session.  
- **Risk:** Shoulder-surfing / longer exposure than “shown once then dismissed”.  
- **Recommended correction:** Explicit dismiss that clears `recoveryCodes` after copy/ack.

#### N3 — Client-side JWT decode is unsigned  
- **Severity:** Informational (Non-blocking; by design)  
- **File/lines:** `token-claims.ts` L13–22  
- **Evidence:** Comment states UX-only; backend `requirePermission` enforces `mfa === true` + purpose `access`.  
- **Risk:** None for authorization if `/admin/me` and API guards remain mandatory (they do).

---

## 4. API integration (live backend comparison)

Compared FE (`admin-auth.ts` / `types.ts`) to `module.routes.ts`, Zod schemas, and service return shapes — **not** discovery docs alone.

| FE call | Backend | Match |
| --- | --- | --- |
| `POST /admin/auth/otp` `{ phoneNumber }` | `adminOtpRequestSchema` + rate limit | **Yes** |
| `POST /admin/auth/otp/verify` `{ phoneNumber, code }` | `adminOtpVerifySchema` | **Yes** |
| OTP branches `MFA_REQUIRED` / `MFA_ENROLLMENT_REQUIRED` | `verifyAdminOtp` return unions | **Yes** |
| `POST /admin/auth/mfa/verify` `code` xor `recoveryCode` | `adminMfaVerifySchema` refine | **Yes** (FE omits `undefined` via `JSON.stringify`) |
| MFA verify `data` includes `staffRole` | `verifyMfa` returns `{ ...session, staffRole }` | **Yes** |
| `POST /admin/mfa/enroll/start` Bearer enrollment JWT | Controller uses Authorization; purpose `admin_mfa_enrollment` | **Yes** |
| `POST /admin/mfa/enroll/confirm` `{ code }` | `adminMfaConfirmSchema` | **Yes** |
| Enroll confirm returns `recoveryCodes` + session **without** required `staffRole` | `confirmMfaEnrollment` → `{ recoveryCodes, ...session }` | **OK** — FE treats `staffRole` optional; identity from `/admin/me` |
| `GET /admin/me` | Auth + MFA + `ViewAdminProfile`; shape matches `AdminMe` | **Yes** |
| `POST /auth/logout` | Auth router L40–45 | **Yes** |
| Success envelope `{ success: true, data }` | Shared API response helper | **Yes** |
| Error `{ error: { code, message } }` | Parsed in `client.ts` | **Yes** |

No invented privileged endpoints in the SPA. Placeholder pages do not call Phase 0 console APIs yet (correct for Phase 1A scope).

---

## 5. 401 and 403 handling

```75:82:apps/cyrlo_admin/src/api/client.ts
    const usedPrivilegedAccessToken =
      useAuth && options.accessToken === undefined && Boolean(token);
    if (response.status === 401 && usedPrivilegedAccessToken) {
      clearMemorySession();
      onUnauthorized?.();
    }
```

| Case | Behavior | Assessment |
| --- | --- | --- |
| Privileged API 401 | Clears session → `session_expired` | **Pass** |
| Public OTP/MFA 401 | Does **not** expire privileged session / does not force session-expired | **Pass** (regression fix present; covered by client test) |
| 403 | Throws `ApiError`; does not clear session | **Pass** |
| Network failure | `NETWORK_ERROR` status 0; not treated as expiry | **Pass** |
| MFA-required routing | Driven by OTP verify **success** statuses, not by guessing 401 bodies | **Pass** |

#### N4 — Concurrent privileged 401s  
- **Severity:** Low (Non-blocking)  
- **Evidence:** Multiple parallel 401s may invoke `expireSession` repeatedly (idempotent clears).  
- **Risk:** Harmless redirect churn.  
- **Recommended correction:** Optional single-flight guard.

---

## 6. Role and permission mapping

Product names map to code enums (`SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `SUPPORT_ADMIN`) — FE matches backend/`ADMIN_ROLE_PERMISSION_MATRIX.md`.

`permissions.ts` `rolePermissionMap` matches `backend/src/common/authz/permissions.ts` catalogs and role grants.

Navigation (`nav.ts`) uses centralized `anyOf` permission lists; `RequireMfaSession` blocks direct URL access via `canAccessPath`. Backend remains final authority (placeholders do not call APIs).

Sample checks (aligned with matrix):

| Role | Visible | Hidden |
| --- | --- | --- |
| FINANCE_ADMIN | overview, finance, zones/geo (coverage) | riders, passengers, admins |
| SUPPORT_ADMIN | passengers, bookings, support | admins/audit |
| OPERATIONS_ADMIN | riders, passengers, zones | finance |
| SUPER_ADMIN | all including admins/audit | — |

#### N5 — Support sees Finance nav via `ViewPayments`  
- **Severity:** Low (Non-blocking / product)  
- **File/lines:** `nav.ts` L63–72  
- **Evidence:** Matrix allows Support payment **view**; Finance placeholder is coarse.  
- **Risk:** Over-broad placeholder label, not privilege escalation (no API yet).  
- **Recommended correction:** Split “Payments view” vs “Finance ops” nav in later phases.

---

## 7. Frontend security and configuration

| Area | Assessment |
| --- | --- |
| Vite env | Only `VITE_API_BASE_URL`, `VITE_ENVIRONMENT` (`.env.example` placeholders) |
| Secrets in bundle | No server secrets (`JWT_*`, bootstrap, DB, SMS keys) in source; build is public SPA assets |
| CORS | Relies on backend local-origin allowance; SPA origin is Vite port |
| Router protection | Auth layout vs `RequireMfaSession` shell |
| XSS | No `dangerouslySetInnerHTML`; MFA QR uses `<img src={qrCodeDataUrl}>` from API data URL |
| Tailwind | v4 via `@tailwindcss/vite` |
| Scripts | `dev` / `build` / `typecheck` / `test` present |
| Dependencies | React 19, RR 7, Vite 8, Vitest 5 — reasonable; no TanStack Query (acceptable) |

#### N6 — MFA QR `img` trusts API `qrCodeDataUrl`  
- **Severity:** Low (Non-blocking)  
- **File/lines:** `MfaEnrollPage.tsx` L42–43  
- **Evidence:** If API/MITM returned a non-image URL scheme, browser behavior depends on scheme.  
- **Risk:** Low under HTTPS + trusted API.  
- **Recommended correction:** Allowlist `data:image/` prefix before render.

---

## 8. Tests and verification

### Coverage vs required scenarios

| Scenario | Covered? | Where |
| --- | --- | --- |
| OTP → MFA_REQUIRED → authenticated | **Yes** | `AuthProvider.test.tsx` |
| OTP → MFA_ENROLLMENT_REQUIRED | **Yes** | `AuthProvider.test.tsx` |
| Reject non-MFA establish | **Yes** | `AuthProvider.test.tsx` |
| Privileged 401 → session_expired | **Yes** | `AuthProvider.test.tsx` |
| Public auth 401 does not expire | **Yes** | `client.test.ts` |
| Privileged 401 expires | **Yes** | `client.test.ts` |
| 403 keeps session | **Yes** | `client.test.ts` |
| Network error mapping | **Yes** | `client.test.ts` |
| Role nav + direct deny | **Yes** | `nav.test.ts`, `RequireMfaSession.test.tsx` |
| Anonymous route guard | **Yes** | `RequireMfaSession.test.tsx` |
| localStorage not used | **Yes** | session + auth tests |
| Failed OTP UI path | **Partial** — client/public 401 covered; AuthProvider failed-OTP phase assertion thin |
| Failed MFA | **No dedicated test** | Condition |
| Logout end-to-end | **No dedicated test** | Condition |
| Browser reload | **Implicit** (memory store) — **no explicit test** | Condition |
| Stale async responses | **No** | Condition (ties to C2) |
| Session-expired page UX | **No** | Non-blocking |

### Safe local re-run (this review)

| Check | Result |
| --- | --- |
| `npm run test` | **20 passed** (6 files) |
| `npm run typecheck` | **pass** |
| `npm run build` | **pass** |

Mocks only — no real SMS / production credentials / live vendor calls in tests.

---

## 9. Security blockers vs conditions vs improvements

### Security blockers
**None** for Phase 1A auth-shell scope.

### Conditions (must address before production operator use)

| ID | Severity | Summary |
| --- | --- | --- |
| C1 | Medium | Clear/roll back memory session if `/admin/me` fails after provisional `setMemorySession` |
| C2 | Low–Medium | Guard against stale concurrent auth completions |
| C3 | Medium (process) | Keep `OTP_DEV_EXPOSE_CODE=false` outside local/dev; never enable in shared staging without controls (backend already hard-disables exposure when `NODE_ENV=production`) |
| C4 | Medium (test debt) | Add tests: failed MFA, logout clears state, reload/anonymous after memory wipe, enroll confirm → authenticated |

### Non-blocking improvements

| ID | Summary |
| --- | --- |
| N1 | Full reset on acknowledge session expired |
| N2 | Dismiss recovery codes after acknowledgment |
| N3 | Unsigned JWT decode (acceptable with current backend gates) |
| N4 | Single-flight 401 expiry |
| N5 | Finer Support vs Finance nav labels later |
| N6 | Allowlist QR data-URL scheme |
| N7 | Document forced re-MFA UX until backend refresh hardens MFA re-assertion (already known) |

---

## 10. Forced re-MFA (accepted design)

Staff `/auth/refresh` issues access JWTs **without** `mfa` / `mfaAt`. The SPA correctly refuses to use refresh for privileged restore. Admins must OTP + MFA again after access TTL (~900s locally). This is fail-closed and appropriate until a backend MFA-preserving refresh exists.

---

## 11. Review actions taken / not taken

| Action | Done? |
| --- | --- |
| Read-only inspection of FE + backend routes/schemas/services | Yes |
| Safe local test / typecheck / build | Yes |
| Code fixes | **No** |
| Stage / commit / push / merge / deploy | **No** |

---

**Stop.** Awaiting human decision on conditions C1–C4 before commit of Phase 1A.

---

## 12. Remediation status (2026-11-12 follow-up)

See also `docs/admin/PHASE_1A_REMEDIATION_REPORT.md`. Conditions below were closed in the working tree (still **uncommitted**).

### C1 — Roll back provisional sessions — **CLOSED**

| | |
| --- | --- |
| **Files** | `apps/cyrlo_admin/src/auth/AuthProvider.tsx` |
| **Correction** | `establishFromTokens` clears provisional memory tokens (and `me`) if `/admin/me` fails; clears only when this attempt’s access token is still installed so a newer win is not clobbered |
| **Tests** | `AuthProvider.lifecycle.test.tsx` — “rolls back provisional tokens when /admin/me fails (C1)” |
| **Remaining** | None for Phase 1A |

### C2 — Guard concurrent MFA completions — **CLOSED**

| | |
| --- | --- |
| **Files** | `apps/cyrlo_admin/src/auth/AuthProvider.tsx` |
| **Correction** | `authOpIdRef` generation guard: bumped on new OTP challenges and each MFA/enroll attempt; stale completions return before mutating memory and re-check after `/admin/me` |
| **Tests** | `AuthProvider.lifecycle.test.tsx` — “ignores stale concurrent MFA completion (C2)” |
| **Remaining** | Extreme multi-tab races still out of scope (in-memory single tab) |

### C3 — Protect development OTP exposure — **CLOSED**

| | |
| --- | --- |
| **Files** | `backend/src/config/env.ts`, `backend/src/modules/admin/module.service.ts`, `backend/src/config/env.security.test.ts`, `backend/.env.example` |
| **Correction** | `loadEnv` **rejects** `OTP_DEV_EXPOSE_CODE=true` when `NODE_ENV=production`; admin OTP echo uses `canExposeDevelopmentOtp(env)` |
| **Tests** | `env.security.test.ts` — “OTP_DEV_EXPOSE_CODE production fail-closed” (3 cases) |
| **Deployment** | Staging/production must use `NODE_ENV=production` and `OTP_DEV_EXPOSE_CODE=false`. Do not set expose true on shared hosts. |
| **Remaining** | Operators must not run shared staging with `NODE_ENV=development` |

### C4 — Authentication lifecycle tests — **CLOSED**

| | |
| --- | --- |
| **Files** | `apps/cyrlo_admin/src/auth/AuthProvider.lifecycle.test.tsx` |
| **Correction** | Added coverage for failed MFA, logout clear, reload/remount without persistent restore, enroll→authenticated, C1 rollback, C2 stale ignore |
| **Tests** | 6 new lifecycle tests; full admin suite **27** passed at remediation verification |
| **Remaining** | Broader E2E browser suite still deferred |

**Post-remediation verification (admin SPA):** `npm run test` → 27 passed; `npm run typecheck` → pass; `npm run build` → pass.  
**Backend:** `vitest run src/config/env.security.test.ts` → 14 passed.
