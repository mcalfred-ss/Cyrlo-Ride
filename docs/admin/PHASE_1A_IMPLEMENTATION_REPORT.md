# Cyrlo Ride — Phase 1A Implementation Report  
## Admin Authentication Shell

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Phase 0 HEAD (unchanged):** `545f455254168eaa47b78d906e035bc294cfc601` — `feat(admin): add phase 0 console backend foundation`  
**Status:** Implemented and verified locally — **not committed, not pushed, not deployed**

---

## 0. Git safety (at verification)

| Item | Value |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | `545f455` (Phase 0 commit present; no new commit created) |
| Working tree | Dirty with Phase 1A artifacts only (uncommitted) |
| Ghana/maps stash | Intact: `stash@{0}: On main: wip-ghana-maps-preserve-phase0` |
| Flutter app | Untouched |
| Production config | Untouched |

No `git reset --hard`, `git clean`, force-push, merge, or deploy was used.

---

## 1. App structure

Greenfield SPA at **`apps/cyrlo_admin`** (beside Flutter `apps/cyrlo_app`). No monorepo workspace restructuring; npm is local to this package (same pattern as `backend/`).

```
apps/cyrlo_admin/
  .env.example          # placeholders only
  package.json          # dev / build / test / typecheck
  vite.config.ts
  src/
    api/                # typed client + admin-auth + response types
    auth/               # AuthProvider, session-store, MFA guards, JWT claim helpers
    config/             # env, permissions mirror, nav mapping
    components/ui.tsx   # shared Button / Field / Alert primitives
    layouts/            # AuthLayout, AppShell (sidebar + header)
    pages/              # login, OTP, MFA, enroll, home, placeholders, forbidden, expired
    app/                # App + React Router
    test/               # vitest setup + JWT test helpers
```

`admin/README.md` updated to point at this SPA.

TanStack Query was **not** added — auth is a single in-memory session state machine; Query would not simplify Phase 1A.

---

## 2. Framework and package choices

| Choice | Version / note |
| --- | --- |
| React | 19.x |
| TypeScript | ~7 / project references via `tsc -b` |
| Vite | 8.x |
| Tailwind CSS | 4.x via `@tailwindcss/vite` |
| React Router | 7.x (`react-router-dom`) |
| Vitest + Testing Library + jsdom | Frontend unit/integration tests |
| Package manager | **npm** (local `package-lock.json`; no pnpm/yarn workspace) |

Scripts:

- `npm run dev` — Vite dev server  
- `npm run build` — `tsc -b && vite build`  
- `npm run typecheck` — `tsc -b --pretty false`  
- `npm run test` — `vitest run`

Environment:

- `VITE_API_BASE_URL` — API origin **including** `/api/v1` (documented in `.env.example`)  
- `VITE_ENVIRONMENT` — optional UI banner label  
- No hardcoded production secrets or tokens

---

## 3. Backend endpoints integrated

All calls go through `src/api/admin-auth.ts` → `src/api/client.ts`.  
Success envelope: `{ success: true, data: T }`. Errors: `{ error: { code, message, details? } }`.

| Step | Method / path | Notes |
| --- | --- | --- |
| Request OTP | `POST /admin/auth/otp` | `{ phoneNumber }` |
| Verify OTP | `POST /admin/auth/otp/verify` | Branches `MFA_REQUIRED` / `MFA_ENROLLMENT_REQUIRED` |
| MFA verify | `POST /admin/auth/mfa/verify` | TOTP `code` **xor** `recoveryCode` |
| Enroll start | `POST /admin/mfa/enroll/start` | Bearer **enrollment** JWT |
| Enroll confirm | `POST /admin/mfa/enroll/confirm` | Returns session + `recoveryCodes` |
| Profile | `GET /admin/me` | Identity + `staffRole`; **no permissions array** |
| Logout | `POST /auth/logout` | Bearer access + `{ refreshToken }` body |

**Not used for privileged restore:** `POST /auth/refresh` (drops `mfa` assurance).

---

## 4. Authentication flow

State machine (`AuthPhase` in `AuthProvider`):

1. **anonymous** → Login phone → `requestOtp` → **awaiting_otp**  
2. OTP → `verifyOtp` →  
   - `MFA_REQUIRED` → **mfa_required** (holds `mfaToken` in React state only)  
   - `MFA_ENROLLMENT_REQUIRED` → **mfa_enrollment_required** (holds `enrollmentToken`)  
3. MFA verify **or** enroll confirm → `establishFromTokens`  
4. `establishFromTokens` requires JWT claims `mfa === true` (+ `mfaAt`), stores tokens in memory, then calls **`GET /admin/me`**  
5. Only after `/admin/me` succeeds → **authenticated**  
6. Access-token expiry timer (skew −5s) or API **401** → clear memory → **session_expired**

Screens: Login, OTP, MFA verify, MFA enroll (QR + confirm + recovery codes display), App shell, Forbidden, Session expired.

---

## 5. Forced re-MFA behavior

| Rule | Implementation |
| --- | --- |
| No auto-refresh of privileged session | `/auth/refresh` is never called |
| MFA not proven by localStorage / route flags | Access token only in memory; phase derived from real tokens + `/admin/me` |
| No fabricated `mfa: true` | `hasPrivilegedMfaAssurance` decodes the real JWT payload |
| Dashboard blocked pre-MFA | `RequireMfaSession` redirects to login / session-expired |
| Token expiry / 401 | Clear session; user must OTP + MFA again |
| Refresh token use | Held in memory **only** to call `POST /auth/logout` |

**Security tradeoff (documented):** Until backend refresh hardens MFA re-assertion, admins must fully reauthenticate when the privileged access token expires (default ~15 minutes). This is intentional fail-closed behavior, not a workaround.

---

## 6. Session storage strategy

| Token | Storage |
| --- | --- |
| Access token | **In-memory only** (`session-store.ts`) |
| Refresh token | **In-memory only** (logout) |
| MFA / enrollment challenge tokens | React state (cleared on expire/logout) |
| localStorage / sessionStorage | **Not used** for tokens |

---

## 7. Role and navigation mapping

Backend enum values (mirrored): `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `SUPPORT_ADMIN`.

- Permission catalog + `rolePermissionMap` in `src/config/permissions.ts` mirrors `backend/src/common/authz/permissions.ts` and the matrix in `docs/admin/ADMIN_ROLE_PERMISSION_MATRIX.md`.  
- Navigation items in `src/config/nav.ts` use `anyOf` permission lists — **single place** for visibility.  
- `navItemsForRole` drives the sidebar; `canAccessPath` blocks direct URL access in `RequireMfaSession`.  
- Business pages are **placeholders** only (no analytics/passengers/bookings/finance UIs).  
- API **403** surfaces as `ApiError`; frontend route guard sends users to `/forbidden`. Backend remains final authority.

---

## 8. Tests and build results

Mocked auth/API responses only — no live OTP SMS, production credentials, or live services.

| Suite | Coverage |
| --- | --- |
| `AuthProvider.test.tsx` | OTP → MFA / enrollment branches; successful MFA session; reject non-MFA establish; logout; session expire |
| `RequireMfaSession.test.tsx` | Protected routes; unauthorized direct nav; session expired redirect |
| `session-store.test.ts` | In-memory clear/set |
| `token-claims.test.ts` | MFA claim parsing |
| `nav.test.ts` | Role-aware nav filtering / path access |
| `client.test.ts` | 401 clears session + handler; 403 as ApiError |

**Verification run (2026-11-12):**

| Check | Result |
| --- | --- |
| `npm run test` | **17 passed** (6 files) |
| `npm run typecheck` | **pass** |
| `npm run build` | **pass** (`dist/` produced; ~280 kB JS gzip ~88 kB) |

---

## 9. Known limitations

1. **Forced re-MFA on access expiry** — no silent privileged refresh until backend `/auth/refresh` preserves MFA.  
2. **Full page reload** clears in-memory session (user must log in again) — by design for Phase 1A.  
3. **No permissions array from `/admin/me`** — nav uses mirrored frontend map; backend still enforces.  
4. **Placeholder modules only** — Overview, Riders, Passengers, Bookings, Zones, Geo, Finance, Support, Admins, Audit have no business logic.  
5. **TanStack Query / shared monorepo packages** deferred.  
6. **graphify CLI** not available in this environment; exploration used discovery report + source inspection.

---

## 10. Run locally

Prerequisites: local Ride API with staff OTP/MFA enabled (Phase 0 backend).

```bash
cd apps/cyrlo_admin
cp .env.example .env
# Edit VITE_API_BASE_URL=http://localhost:3000/api/v1  (or your API)

npm install
npm run dev
```

Other commands:

```bash
npm run typecheck
npm run test
npm run build
npm run preview   # serves production build
```

Never place Maps keys, production JWT secrets, or live credentials in `.env`.

---

## 11. Change inventory (uncommitted)

| Path | Change |
| --- | --- |
| `apps/cyrlo_admin/**` | New Vite React admin SPA (auth shell) |
| `admin/README.md` | Points to `apps/cyrlo_admin` |
| `docs/admin/PHASE_1A_DISCOVERY_REPORT.md` | Prior discovery (uncommitted) |
| `docs/admin/PHASE_1A_IMPLEMENTATION_REPORT.md` | This report |

**Out of scope (not built):** analytics dashboard, passenger directory, booking management, finance pages, rider management, geo/zone management, live operations.

**Awaiting review** — no commit / push / merge / deploy performed.
