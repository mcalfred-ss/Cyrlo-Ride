# Cyrlo Admin — production OTP/MFA smoke (procedure & blockers)

**Status (2026-11-12 remediation):** **Not executed** — no safe authorized Admin path available without owner action.  
**Must not:** enable `OTP_DEV_EXPOSE_CODE`, disable MFA, weaken CORS, bypass auth, or send SMS without explicit owner authorization.

## Production configuration observed (no secrets)

| Flag | Observation |
| --- | --- |
| `NODE_ENV` | `production` |
| `OTP_DEV_EXPOSE_CODE` | **Absent** (fail-closed; cannot be `true` in production) |
| `SMS_PROVIDER` | `vynfy` (non-static phones receive real SMS) |
| `OTP_STATIC_LOGINS` | **Present**, `entry_count=4` (shape matches app review / internal QA passenger+rider allowlist — **not** Admin staff) |
| `ADMIN_BOOTSTRAP_SECRET` | **Absent** / empty (bootstrap endpoint disabled) |
| Admin SPA | https://cyrlorideadmin.eqostack.com → API `https://cyrloride.eqostack.com/api/v1` |

Admin login uses `/admin/auth/*` and requires `users.role === 'ADMIN'`, then MFA (enroll or verify). App-review static OTP phones are passenger/rider accounts and **cannot** complete Admin MFA smoke.

## Why a smoke was not run during remediation

A safe authenticated smoke needs **all** of:

1. An **Admin** (`role=ADMIN`) account the owner explicitly authorizes for this test.  
2. A **controlled OTP delivery** method that does not spam production users:
   - Preferred: add that Admin phone to `OTP_STATIC_LOGINS` with a fixed code (narrow allowlist; no SMS), **or**
   - Owner-authorized real SMS to that staff phone via existing Vynfy (still real SMS — only with explicit approval).  
3. Access to that Admin’s **MFA authenticator** (or a supervised enrollment on a test Admin with owner present).  
4. No enabling of `OTP_DEV_EXPOSE_CODE`, no MFA disable, no auth bypass.

**Current blocker:** No owner-authorized Admin test account with a non-SMS or explicitly approved SMS path was provided for this task, and production infrastructure must not be changed here to invent one. Using an arbitrary staff phone would send real SMS and expose credentials — **out of bounds**.

## Prerequisites for a future authorized smoke

Owner must supply (out-of-band; **do not commit secrets**):

1. Confirmation that a named Admin phone may be used.  
2. Either:
   - Temporary/permanent `OTP_STATIC_LOGINS` entry for that Admin phone (ops change + API restart), **or** approval to receive one real OTP SMS.  
3. MFA device access / enrollment supervision.  
4. Explicit “you may run production Admin auth smoke now” authorization.

## Procedure (when authorized)

Do **not** log OTP codes, TOTP secrets, access tokens, or refresh tokens in reports.

1. Open https://cyrlorideadmin.eqostack.com/login — confirm `Cyrlo Admin · production`.  
2. Enter authorized Admin E.164 phone → Send OTP.  
3. Enter OTP from the approved delivery method (static allowlist or owner SMS).  
4. Complete MFA (TOTP or recovery only if owner provides recovery and accepts risk).  
5. Confirm shell: signed-in identity + staff role; navigate `/overview` and one privileged page (e.g. `/riders` or `/applications`) — data loads via `https://cyrloride.eqostack.com/api/v1`.  
6. Confirm browser storage still has **no** privileged tokens in `localStorage` / `sessionStorage`.  
7. Sign out; confirm return to login.  
8. Record pass/fail in a short smoke note **without** secrets.

## Unauthenticated checks already green (not a substitute)

- Login UI renders.  
- `/overview` redirects to `/login` when anonymous.  
- CORS allows Admin origin; hostile origin denied.  
- Local Phase 1B smoke previously passed against **local** API with `OTP_DEV_EXPOSE_CODE` — that path is **forbidden** on production.
