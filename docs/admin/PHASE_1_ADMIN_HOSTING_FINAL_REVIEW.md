# Cyrlo Ride — Phase 1 Admin Hosting Final Review  
## First VPS deployment of Admin SPA + condition remediation

**Original review date:** 2026-11-12  
**Remediation update:** 2026-11-12  
**Live URL:** https://cyrlorideadmin.eqostack.com  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `c306fc31c4c932624ac8dbe00755d78d624e5df5`  
**Ghana/maps stash:** intact (`stash@{0}: On main: wip-ghana-maps-preserve-phase0`)  

**Remediation mode:** Local docs/helpers only — **no** deploy, push, DNS/Nginx/CORS/cert changes, migrations, real SMS, Paystack, or stash mutation. Live release `20261112T084947Z` left untouched.

---

## Verdict (after remediation)

### **APPROVED WITH CONDITIONS** (narrowed)

Hosting remains sound. Conditions **M1**, **M2** (process/baseline), and **M3** (classification) are **remediated in-repo**.  

**Remaining open condition:**

- **H1** — Production Admin OTP→MFA smoke **not executed**. Safe procedure and exact blocker documented; owner authorization + Admin test path still required before claiming auth-ready.

No **BLOCKER** for hosting isolation/configuration.

---

## Condition remediation status

| ID | Condition | Status | Evidence |
| --- | --- | --- | --- |
| H1 | Production OTP/MFA verification | **Open — documented blocker** | `apps/cyrlo_admin/.deploy/ADMIN_PROD_AUTH_SMOKE.md`; prod flags: `NODE_ENV=production`, `OTP_DEV_EXPOSE_CODE` absent, `SMS_PROVIDER=vynfy`, `OTP_STATIC_LOGINS` present with **4** entries (app review passenger/rider shape — not Admin), `ADMIN_BOOTSTRAP_SECRET` absent |
| M1 | Nginx template TLS drift | **Remediated** | Local template updated to match live TLS + HTTP→HTTPS shape; local directive checks pass; **live Nginx not modified** |
| M2 | Rollback baseline / first-release gap | **Remediated (documented + tooling)** | `RELEASE_AND_ROLLBACK.md` + `promote-release.sh`; explicitly states first release has **no** prior artifact; live release not deleted/replaced |
| M3 | Git change separation | **Remediated (classified)** | Classification below; nothing staged/committed/stashed |

---

## 1. H1 — Production OTP/MFA (HIGH)

### Finding (unchanged risk)
Unauthenticated hosting checks passed; privileged production login was never proven.

### Inspection (no secrets printed)
| Flag | Production observation |
| --- | --- |
| `NODE_ENV` | `production` |
| `OTP_DEV_EXPOSE_CODE` | Absent (cannot be enabled in production) |
| `SMS_PROVIDER` | `vynfy` |
| `OTP_STATIC_LOGINS` | Present, `entry_count=4` |
| `ADMIN_BOOTSTRAP_SECRET` | Absent |

### Can a safe smoke run now?
**No — not without owner action.**

**Blocker:** Admin SPA requires `role=ADMIN` + MFA. The four static OTP allowlist entries match **passenger/rider** store/QA accounts (`docs/deployment/REVIEW_TEST_ACCOUNTS.md`), not Admin staff. Using a real staff phone would send **real Vynfy SMS**. Enabling `OTP_DEV_EXPOSE_CODE`, disabling MFA, or bypassing auth is forbidden. This remediation must not change production infra to invent an Admin static-OTP account.

### Safe path when owner authorizes
Documented in `apps/cyrlo_admin/.deploy/ADMIN_PROD_AUTH_SMOKE.md`:

1. Named Admin phone authorized for the test.  
2. Controlled OTP: Admin on `OTP_STATIC_LOGINS` **or** explicit approval for one real SMS.  
3. MFA device / supervised enrollment.  
4. Explicit “run production Admin auth smoke” authorization.  
5. Report pass/fail **without** logging OTP, TOTP secrets, or tokens.

Local Phase 1B smoke (`docs/admin/PHASE_1B_SMOKE_TEST_REPORT.md`) used **local** `OTP_DEV_EXPOSE_CODE` — **not** a substitute for production.

---

## 2. M1 — Nginx template (MEDIUM) — remediated

### Finding
Local helper was HTTP-only while live vhost is certbot TLS + HTTP 301.

### Remediation
Updated `apps/cyrlo_admin/.deploy/cyrlorideadmin.eqostack.com.nginx` to the intended production shape:

- `listen 443 ssl` + Let’s Encrypt cert paths for `cyrlorideadmin.eqostack.com`  
- HTTP server: `301` to HTTPS (certbot pattern)  
- SPA `try_files`, `/assets/` cache, `index.html` no-cache, `autoindex off`  
- **No** `proxy_pass`  
- Comments: do not overwrite live with an HTTP-only bootstrap

### Evidence (local checks)
All required directives present; `proxy_pass` absent. Live Nginx/services **not** reloaded or edited during remediation.

---

## 3. M2 — Rollback baseline (MEDIUM) — remediated

### Finding
Only release `20261112T084947Z` exists — no prior symlink target.

### Remediation (no invented prior release; live untouched)
| Artifact | Role |
| --- | --- |
| `apps/cyrlo_admin/.deploy/RELEASE_AND_ROLLBACK.md` | Documents first-release limitation + future promote/rollback |
| `apps/cyrlo_admin/.deploy/promote-release.sh` | Promotes a prepared release, retains prior releases (default 5), never deletes active `current` |

**Explicit limitation retained:** until a second release is promoted, rollback cannot flip to a previous static artifact; recovery is re-upload, Admin-site disable only, or CORS backup restore if CORS-related.

---

## 4. M3 — Git change separation (MEDIUM) — classified

**No stage / commit / stash / reset / discard. Ghana maps stash untouched.**

### A. Phase 1C product implementation
**Modified**
- `apps/cyrlo_admin/src/api/admin-riders.ts`
- `apps/cyrlo_admin/src/api/types.ts`
- `apps/cyrlo_admin/src/app/router.tsx`
- `apps/cyrlo_admin/src/config/nav.ts`
- `apps/cyrlo_admin/src/config/nav.test.ts`
- `apps/cyrlo_admin/src/pages/RiderProfilePage.tsx`
- `apps/cyrlo_admin/src/pages/RiderProfilePage.test.tsx`
- `backend/src/modules/riders/module.service.ts`
- `backend/src/modules/riders/module.repository.ts`
- `backend/src/modules/riders/memory-riders-repository.ts`
- `backend/src/modules/riders/module.test.ts`

**Untracked**
- `apps/cyrlo_admin/src/api/admin-users.ts`
- `apps/cyrlo_admin/src/api/admin-users.test.ts`
- `apps/cyrlo_admin/src/api/admin-riders.mutations.test.ts`
- `apps/cyrlo_admin/src/features/applications/*`
- `apps/cyrlo_admin/src/pages/ApplicationsPage.tsx` (+ test)
- `apps/cyrlo_admin/src/pages/ApplicationDetailPage.tsx` (+ test)
- `backend/src/modules/riders/application-review.test.ts`
- `backend/src/modules/riders/application-review.db.test.ts`
- `docs/admin/PHASE_1C_*.md` (discovery / C1 / enforcement / integrated / complete)

### B. Hosting / deployment helpers
- `apps/cyrlo_admin/.deploy/cyrlorideadmin.eqostack.com.nginx`
- `apps/cyrlo_admin/.deploy/update-cors-admin-origin.py`
- `apps/cyrlo_admin/.deploy/verify-admin-hosting.sh`
- `apps/cyrlo_admin/.deploy/promote-release.sh`
- `apps/cyrlo_admin/.deploy/RELEASE_AND_ROLLBACK.md`
- `apps/cyrlo_admin/.deploy/ADMIN_PROD_AUTH_SMOKE.md`
- `apps/cyrlo_admin/.deploy/inspect-auth-flags.py` (read-only prod flag inspector; prints no secrets)

### C. Hosting reports
- `docs/admin/PHASE_1_ADMIN_HOSTING_REPORT.md`
- `docs/admin/PHASE_1_ADMIN_HOSTING_FINAL_REVIEW.md` (this file)

### D. Unrelated
- Ghana maps stash entries (untouched)  
- No other dirty paths outside Admin Phase 1C + hosting above

**Commit guidance:** at least two logical commits/PRs later — (1) Phase 1C product, (2) hosting helpers + hosting reports — never one mixed “hosting” commit for the whole tree.

---

## Original evidence summary (still valid)

| Check | Result |
| --- | --- |
| DNS A | `188.166.155.199` |
| HTTPS / cert through 2027-02-10 | Pass |
| Isolated static root + no API proxy | Pass |
| SPA / assets | Pass |
| API origin in bundle | `https://cyrloride.eqostack.com/api/v1` |
| CORS Admin allow + evil deny | Pass |
| Ride / Maps / other sites | Healthy / active |

---

## Residual findings (post-remediation)

### HIGH (open)
- **H1** — Production Admin auth smoke awaiting owner-authorized account path (see §1).

### MEDIUM (closed in-repo; residual ops)
- **M1/M2/M3** — Closed via template/docs/classification; next deploy must **use** `promote-release.sh` retain policy and keep commits separated.

### MEDIUM (pre-existing, out of hosting remediation scope)
- **M4** — Production CORS still allows localhost browser origins via `isAllowedCorsOrigin` default — not introduced by Admin hosting.

### LOW (unchanged)
- L1 static security headers; L2 mutating CORS helper discipline; L3 verify-script coverage; L4 PowerShell/`$?` quirks.

---

## Safe local checks run during remediation

| Check | Result |
| --- | --- |
| Nginx template required TLS/SPA directives | Pass |
| Template contains no `proxy_pass` | Pass |
| `.deploy/*` secret-pattern scan | Pass (none) |
| Rollback doc names first release `20261112T084947Z` + no-prior limitation | Pass |
| `git stash list` Ghana stash | Intact |
| Production infra modified | **No** |

---

## Final stop

Remediation complete for M1–M3 documentation/tooling; H1 remains an **owner-gated** open condition with a written safe procedure.

**Do not** start the next Admin development phase from this update.  
Await owner authorization before any production Admin OTP/MFA smoke.
