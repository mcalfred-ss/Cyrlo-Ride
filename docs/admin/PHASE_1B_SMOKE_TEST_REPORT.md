# Cyrlo Ride — Phase 1B Local Authentication Smoke Test Report

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `93bfe7763c749b2de4342b330bad920578dc3f3c`  
**Verdict:** **PASS**

No commit, push, deploy, or staging of files was performed during this smoke.

---

## 1. Environment used (local only)

| Item | Value |
| --- | --- |
| API | Local Ride API `http://127.0.0.1:3000` / `http://localhost:3000` |
| Admin SPA | Vite `http://localhost:5174` (`VITE_ENVIRONMENT=local`) |
| Admin API base | `VITE_API_BASE_URL=http://localhost:3000/api/v1` |
| Database | Local PostgreSQL `127.0.0.1:5432` / `cyrlo_ride_app` (TCP reachable) |
| OTP mechanism | `OTP_DEV_EXPOSE_CODE=true` + empty `SMS_PROVIDER` (dev no-op SMS; UI shows `developmentCode`) |
| MFA mechanism | Local enrolled Super Admin TOTP (code generated via local decrypt helper against `admin_mfa_credentials`; helper deleted after use) |
| Staff identity | Existing local Super Admin account (phone redacted in this report) |
| Production / staging | **Not used** |

**Config notes**

- Backend process already listening on `0.0.0.0:3000` (PID identified as local `tsx` Ride API). Process was **not** killed.
- Vite already serving admin on `localhost:5174`.
- Local CORS allows machine-local browser origins (Vite origin accepted).
- Ghana/maps stash remained intact: `stash@{0}: wip-ghana-maps-preserve-phase0`.

---

## 2. API and frontend startup results

| Check | Result |
| --- | --- |
| Identify port 3000 occupant | Local Node/`tsx` `backend/src/server.ts` |
| `GET /api/v1/health` | **200** `{ status: "ok", service: "cyrlo-ride-api" }` |
| Admin SPA HTTP | **200** at `http://localhost:5174/` |
| DB connectivity | **Pass** (`127.0.0.1:5432`) |
| Safe OTP path available | **Pass** (dev expose + no-op SMS) |
| New servers started | Not required — existing local API + Vite reused |

---

## 3. OTP and MFA outcome

| Step | Result |
| --- | --- |
| Open local admin login | **Pass** (`Cyrlo Admin · local`) |
| Request OTP for authorized local Super Admin | **Pass** (`POST /admin/auth/otp`) |
| Retrieve OTP via approved local mechanism | **Pass** (UI `Dev code` from `OTP_DEV_EXPOSE_CODE`) |
| Submit OTP | **Pass** → MFA challenge |
| Complete MFA with local TOTP | **Pass** → authenticated shell |
| Authenticated shell | **Pass** — “Signed in as Local Super Admin · Super Admin”; full Super Admin nav |

No real SMS was sent. No production/staging credentials were used. OTP codes / tokens / secrets are **not** recorded here.

---

## 4. Overview API results

| Check | Result |
| --- | --- |
| `GET /admin/me` | **Pass** (shell identity + role rendered after MFA) |
| Navigate to `/overview` (client route) | **Pass** |
| `GET /admin/analytics` | **Pass** (dashboard populated from live response) |
| Metric cards | **Pass** — real snapshot values observed (e.g. passengers `4` / `4` active; riders registered `1`; available approx `0`) |
| Booking status bars | **Pass** — zero-filled statuses with non-zero period rows (`PAYMENT_FAILED 1`, `EXPIRED 2`, `CANCELLED 1`) |
| Connection fees / refunds / tokens separate | **Pass** — “Collected (gross) GH₵4.00”, refunds table (`SUCCEEDED` separate), token purchases `GH₵10.00` / deductions `0 tokens` |
| Approx availability labeling | **Pass** — “Available riders (approx)” + “Snapshot estimate — not a live dispatch guarantee” |
| Transport-fare exclusion copy | **Pass** — exclusions note visible |
| No automatic polling | **Pass** — copy states no automatic refresh; no live feed |

---

## 5. Date filter results

Observed via instrumented `fetch` spy in the browser (URLs only; no auth headers logged):

| Action | Request |
| --- | --- |
| All time | `GET .../admin/analytics` (**no** `from`/`to`) |
| Last 7 days | `GET .../admin/analytics?from=...&to=...` (ISO query params present) |

UI also shows inclusive UTC / snapshot-vs-period copy on the filter panel.

---

## 6. Session behavior

| Scenario | Result | Evidence |
| --- | --- | --- |
| Hard browser navigation / refresh | Requires re-authentication | Full navigation to `/overview` dropped in-memory session → login |
| Privileged `401` on analytics | Redirects to session-expired | Mocked privileged analytics `401` → `/session-expired` copy about no MFA restore via refresh |
| Logout | Clears session | Profile menu **Log out** → `/login` |
| Unauthenticated Overview access | Blocked | After session clear, Overview requires login again |
| Analytics `403` | No fabricated KPIs | Mocked `403` → “Permission denied…” error UI only (Retry / forbidden link); metric panels not shown |

---

## 7. Failures and evidence

No blocking failures.

Non-blocking observations:

1. Accessibility snapshot briefly lagged behind DOM after SPA route change (Overview content was present when read via `document.querySelector('main')`).
2. Backend `HOST=0.0.0.0` on the already-running local process (not changed for this smoke). Vite remained localhost-bound.
3. Temporary local TOTP helper and SQL probe files were created for MFA/DB verification and **deleted** afterward; they were never staged.

---

## 8. Working-tree / stash confirmation

| Check | Result |
| --- | --- |
| Commit created | **No** |
| Push / deploy | **No** |
| Files staged | **No** |
| Phase 1B working tree preserved | **Yes** (Overview implementation + Phase 1B docs still uncommitted) |
| Ghana/maps stash | **Intact** (`stash@{0}: wip-ghana-maps-preserve-phase0`) |

---

## 9. Verdict

### PASS

Local OTP → MFA → admin shell → Overview analytics (including date filters and financial separation) and session/logout/401/403 behaviors were verified against the local Ride API and local admin SPA only.
