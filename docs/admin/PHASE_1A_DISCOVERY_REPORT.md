# Cyrlo Ride — Phase 1A Discovery Report  
## Admin Authentication Shell (READ-ONLY)

**Date:** 2026-11-12  
**Mode:** Discovery / planning only — no app created, no packages installed, no application code modified  
**Phase 0 commit:** `545f455254168eaa47b78d906e035bc294cfc601`  
**Branch at audit:** `feature/admin-phase-0`

---

## 0. Git safety

| Item | Value |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | `545f455` — `feat(admin): add phase 0 console backend foundation` |
| Working tree | Clean |
| `origin/main` | `44e024a` — branch is **1 commit ahead**, 0 behind |
| Stashes | `stash@{0}: wip-ghana-maps-preserve-phase0` (untouched); `stash@{1}: wip-before-main-merge` |

No branch switch, commit, push, merge, or deploy during this audit.

---

## 1. Existing frontend architecture

| Question | Finding |
| --- | --- |
| React / Vite / Next.js admin app? | **None.** No `vite.config.*`, `next.config.*`, or root/web `package.json` for a SPA |
| Existing app | `apps/cyrlo_app` — **Flutter** passenger/rider mobile app (`pubspec.yaml`) |
| TypeScript (web) | Only under `backend/` (`tsconfig.json`, Express API) |
| Tailwind | **Not present** in-repo for web |
| Web routing / shared UI | **None** for admin |
| Package / workspace | No pnpm/npm workspaces monorepo for web. Backend uses **npm** (`backend/package-lock.json`). Flutter is separate |
| Admin placeholder | `admin/README.md` — explicitly states **no separate admin SPA yet**; call `/api/v1` with staff JWTs; never Maps keys |

**Severity notes**

| ID | Severity | Finding |
| --- | --- | --- |
| F1 | Low | Greenfield web stack required; no reusable React auth/UI from this repo |
| F2 | Low | Do **not** embed admin UI inside Flutter `cyrlo_app` — wrong platform and threat model |

---

## 2. Recommended application location

**Create `apps/cyrlo_admin`** (Vite + React + TypeScript).

| Option | Decision |
| --- | --- |
| Reuse Flutter app | **No** |
| Put SPA under `admin/` | Possible but conflicts with existing placeholder README; prefer `apps/cyrlo_admin` beside `apps/cyrlo_app` |
| Next.js | Not required for Phase 1A (auth shell + API client); Vite SPA is enough |
| Tailwind | Introduce with the new app (no existing design system to inherit) |

Aligns with `ADMIN_IMPLEMENTATION_ROADMAP.md` Phase 1 (“`admin/` or `apps/cyrlo_admin`”).

---

## 3. Actual authentication API contracts

All successful responses use `{ success: true, data: T }` (`backend/src/common/http/response.ts`).  
Base: `/api/v1`.

### 3.1 Admin login / MFA (verified in `admin/module.routes.ts` + `module.service.ts` + `module.schema.ts`)

| Step | Method / path | Auth | Request body | `data` shape (success) |
| --- | --- | --- | --- | --- |
| Request OTP | `POST /admin/auth/otp` | Public (+ OTP rate limit) | `{ phoneNumber }` (Ghana E.164) | `{ expiresIn, resendAfter, developmentCode? }` — `developmentCode` only when non-prod + `OTP_DEV_EXPOSE_CODE` |
| Verify OTP | `POST /admin/auth/otp/verify` | Public (+ OTP rate limit) | `{ phoneNumber, code }` (6 digits) | **Branch A** MFA enrolled: `{ status: 'MFA_REQUIRED', mfaToken, expiresIn }` · **Branch B** not enrolled: `{ status: 'MFA_ENROLLMENT_REQUIRED', enrollmentToken, expiresIn }` |
| MFA verify | `POST /admin/auth/mfa/verify` | Public | `{ mfaToken, code? }` **xor** `{ mfaToken, recoveryCode? }` | `{ accessToken, refreshToken, expiresIn, staffRole }` |
| MFA enroll start | `POST /admin/mfa/enroll/start` | Bearer **enrollment** JWT (`purpose: admin_mfa_enrollment`) | — | `{ otpauthUrl, qrCodeDataUrl }` |
| MFA enroll confirm | `POST /admin/mfa/enroll/confirm` | Bearer enrollment JWT | `{ code }` | `{ recoveryCodes, accessToken, refreshToken, expiresIn }` (+ staff session) |
| Profile | `GET /admin/me` | MFA staff access + `ViewAdminProfile` | — | `{ id, phoneNumber, role: 'ADMIN', status, displayName, staffRole, mfaEnabled }` — **no permissions array** |

**Staff access JWT claims** (after MFA / enroll confirm — `issueStaffSession` ~901–926):

- `sub`, `role: 'ADMIN'`, `staffRole`, `mfa: true`, `mfaAt` (unix seconds), `purpose: 'access'`
- TTL: `JWT_ACCESS_TTL_SECONDS` default **900**
- Refresh TTL: `JWT_REFRESH_TTL_SECONDS` default **15_552_000** (~180 days)
- Pending MFA / enrollment token TTL: `ADMIN_MFA_PENDING_TTL_SECONDS` default **600**

**OTP defaults:** `OTP_TTL_SECONDS` 300; resend cooldown from env.

**Privileged middleware** (`authorize.ts`): requires `role === 'ADMIN'`, `purpose === 'access'`, **`mfa === true`**, active DB grant, MFA enrollment enabled, then permission check against **DB grant role** (not client `staffRole` claim alone).

**Recent MFA:** `requireRecentMfa` uses `mfaAt` within `ADMIN_RECENT_MFA_SECONDS` (default 900) for sensitive routes (docs, refunds, trip-gps, etc.).

### 3.2 Shared auth refresh / logout (verified in `auth/module.routes.ts` + `auth/module.service.ts`)

| Method / path | Auth | Body | Behavior |
| --- | --- | --- | --- |
| `POST /auth/refresh` | Public | `{ refreshToken }` | Rotates refresh; issues access via `issueAccess` with **only** `{ sub, role }` — **no `mfa`, no `mfaAt`, no `staffRole`** |
| `POST /auth/logout` | Bearer access + active account | `{ refreshToken }` | Revokes presented refresh family/session for `userId` |

There is **no** `POST /admin/auth/refresh` today.

---

## 4. MFA and refresh security findings

### Observed refresh behavior

`AuthServiceImpl.refresh` → `issueAccess` (`auth/module.service.ts` 253–301) strips MFA assurance. An administrator’s refresh token still rotates successfully and returns a new access token with `role: 'ADMIN'` and default `purpose: 'access'`, but **`mfa` is absent**. Privileged `/admin/*` routes then **403** (`Administrator MFA session is required`). Backend is **fail-closed** for privileged APIs.

### Phase 1A safest approach (product requirements)

| Rule | Phase 1A approach |
| --- | --- |
| Ordinary refresh must never silently restore MFA | **Do not call `/auth/refresh` to continue an admin privileged session.** Treat access expiry as end of MFA assurance. |
| Token without MFA must not access privileged admin | Already enforced by `requirePermission` / `requireAnyPermission` |
| Frontend must not treat local flags as MFA proof | Persist tokens only; derive “privileged” solely from JWT claims (`mfa === true`) or by probing `/admin/me` |
| Expired/invalid → correct step | Access expired / 401 → clear storage → phone OTP; `MFA_REQUIRED` → MFA page; `MFA_ENROLLMENT_REQUIRED` → enroll flow |
| Refresh rotation / logout remain secure | Logout with **current** MFA access + refresh while still valid; on expiry without MFA access, clear local state (optional: dedicated admin logout later) |
| Do not weaken backend MFA | **No** change that adds `mfa: true` to passenger `/auth/refresh` |

### Is a backend change required before frontend?

| Priority | Recommendation |
| --- | --- |
| **Phase 1A can start FE-only** if the SPA **never** auto-refreshes into a privileged session and always forces OTP→MFA after access TTL | Acceptable with hard client rules + tests |
| **Strongly recommended before production / Phase 1B** | Backend hardening (see §7) so a mistaken FE refresh cannot mint a confusing ADMIN access token |

| ID | Severity | Finding |
| --- | --- | --- |
| S1 | **High** | `/auth/refresh` issues ADMIN-role access tokens without MFA. Privileged APIs reject them (good), but a naive SPA may loop refresh / mis-handle 403. |
| S2 | **High** | Roadmap still lists “session refresh preserves mfa **or** forced re-MFA”. Forced re-MFA is the Phase 1A contract until a dedicated admin refresh exists. |
| S3 | Medium | Logout requires a valid access token; after access expiry, refresh-derived non-MFA access can still call logout — OK for revocation, but SPA must not treat that token as MFA. |
| S4 | Medium | Long refresh TTL (~180d) means stolen refresh remains useful for minting non-MFA ADMIN tokens / confusion; MFA still required for privilege. |
| S5 | **Critical** (if violated by FE) | Any design that sets a local `mfaVerified=true` from refresh success, or that attaches non-MFA access to privileged calls, is unsafe. |

**Verdict for §4:** Backend MFA enforcement is sufficient to start Phase 1A **with forced re-MFA**. A small backend change is **not a hard blocker** for shell UI, but **is required** before relying on silent session extension.

---

## 5. Role and permission integration

### Roles (API enums — not snake_case product names)

| Product name | API `staffRole` |
| --- | --- |
| super_admin | `SUPER_ADMIN` |
| operations_admin | `OPERATIONS_ADMIN` |
| finance_admin | `FINANCE_ADMIN` |
| support_admin | `SUPPORT_ADMIN` |

Source: `staff-roles.ts`, `permissions.ts` `rolePermissionMap`, invitation schema.

### `/admin/me`

Returns `staffRole` + `mfaEnabled`, **not** an expanded permission list. Navigation should:

1. Call `GET /admin/me` after MFA session established.  
2. Map `staffRole` → nav items using a **frontend copy** of `permissions.ts` / matrix (or later shared package).  
3. On any API **403**, hide/disable the action and show denied — **backend remains authority**.  
4. Never hide security behind nav alone.

| ID | Severity | Finding |
| --- | --- | --- |
| P1 | Medium | Permission matrix duplication will drift unless tested against backend catalog or `getMe` later returns `permissions: string[]` |
| P2 | Low | `staffRole` on JWT is informational; grant reload on each request is authoritative |

---

## 6. Proposed folder structure (`apps/cyrlo_admin`)

Keep thin — avoid heavy abstractions.

```text
apps/cyrlo_admin/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  .env.example                 # VITE_API_BASE_URL only; no Maps secrets
  src/
    main.tsx
    app/
      App.tsx
      router.tsx               # public vs protected routes
      providers.tsx            # AuthProvider
    pages/
      login/LoginPage.tsx      # phone + request OTP + verify OTP
      mfa/MfaVerifyPage.tsx
      mfa/MfaEnrollPage.tsx    # QR + confirm (first-time)
      home/HomePage.tsx        # shell landing (“signed in”)
      forbidden/ForbiddenPage.tsx
    layouts/
      AuthLayout.tsx
      AppShell.tsx             # sidebar + header
    components/
      Sidebar.tsx
      Header.tsx
      AccountMenu.tsx
      EnvironmentBanner.tsx
    auth/
      AuthProvider.tsx
      session-storage.ts       # access/refresh; no mfa boolean flag
      token-claims.ts          # decode JWT for mfa/exp only (UX)
      RequireMfaSession.tsx    # route guard: mfa===true + /admin/me ok
      usePermissions.ts        # nav helpers from staffRole
    api/
      client.ts                # fetch wrapper; Authorization header
      admin-auth.ts            # OTP / MFA / me
      types.ts
    config/
      permissions.ts           # mirror backend catalog for nav
      nav.ts                   # role → sidebar items
    styles/
      index.css                # Tailwind entry
```

**Flows**

1. Login → OTP verify → MFA verify **or** enroll → store `accessToken` + `refreshToken`.  
2. Protected layout: require JWT `mfa === true` and successful `GET /admin/me`.  
3. Access near expiry / 401 on privileged call → clear session → Login (forced re-MFA).  
4. Logout → `POST /auth/logout` with current access + refresh → clear storage.  
5. **Never** use `/auth/refresh` to obtain a new privileged session in Phase 1A.

---

## 7. Required backend changes

### Not required to start Phase 1A UI (if forced re-MFA is hard-enforced in FE)

None for OTP/MFA/me — already implemented.

### Required / strongly recommended before production soft sessions

| ID | Severity | Change |
| --- | --- | --- |
| B1 | **High** | Reject `User.role === 'ADMIN'` on `POST /auth/refresh` **or** return a clear `MFA_REQUIRED` / `ADMIN_REAUTH_REQUIRED` without a privileged access token |
| B2 | High | Prefer `POST /admin/auth/refresh` that never sets `mfa: true` without TOTP/recovery step-up (or omit refresh entirely for staff) |
| B3 | Medium | Optional: `GET /admin/me` returns `permissions: Permission[]` from DB grant to avoid FE matrix drift |
| B4 | Low | Optional: `POST /admin/auth/logout` alias for clarity |

Do **not** “fix” passenger refresh by attaching `mfa: true` from refresh alone.

---

## 8. Implementation sequence

1. Scaffold `apps/cyrlo_admin` (Vite React TS + Tailwind + React Router).  
2. API client + auth API modules against real contracts above.  
3. Login + OTP verify branching (`MFA_REQUIRED` / `MFA_ENROLLMENT_REQUIRED`).  
4. MFA verify + enroll pages; secure token storage.  
5. `AuthProvider` + `RequireMfaSession` (JWT `mfa` + `/admin/me`).  
6. App shell: sidebar/header/account menu + environment banner.  
7. Permission-aware nav from `staffRole` (matrix mirror).  
8. Session expiry / 401 handling → forced re-login; **block** privileged refresh.  
9. Logout path.  
10. Smoke tests (unit for guards; later Playwright against staging with allowlisted OTP).  
11. Parallel/follow-up: backend B1/B2 before soft refresh UX.

---

## 9. Risks and unresolved questions

| ID | Severity | Risk / question |
| --- | --- | --- |
| R1 | High | Accidental use of `/auth/refresh` in a shared “axios interceptor” pattern from other apps |
| R2 | Medium | Permission matrix drift (P1) |
| R3 | Medium | Staging SMS / OTP allowlist for admin phones |
| R4 | Medium | Where to host SPA (same origin vs CORS); cookies vs Bearer — today API expects Bearer |
| R5 | Low | Enrollment QR secret handling in UI (never log otpauth URL) |
| R6 | Low | Product naming `super_admin` vs API `SUPER_ADMIN` in UI copy |
| Q1 | — | Should Phase 1A land on same branch as Phase 0 or a new `feature/admin-phase-1a`? |
| Q2 | — | Commit B1/B2 before or after first SPA PR? (**Recommend before production.**) |
| Q3 | — | Idle timeout equal to access TTL (900s) or shorter client idle? |

---

## 10. Summary for Phase 1A go / no-go

| Topic | Conclusion |
| --- | --- |
| Frontend foundation | Greenfield → **`apps/cyrlo_admin`** |
| Auth APIs | Complete for OTP → MFA → session → `/admin/me` |
| Refresh | Drops MFA; privileged APIs fail-closed; **forced re-MFA** for Phase 1A |
| Backend blocker for shell UI | **No**, if FE never privileges refresh |
| Backend blocker for soft sessions | **Yes** (B1/B2) |
| Roles | Use `staffRole` from `/admin/me` + local nav matrix; backend enforces |

**Recommended next step after this report:** Implement Phase 1A SPA scaffold + auth shell with forced re-MFA; schedule backend admin-refresh hardening as a paired security PR before soft session UX.
