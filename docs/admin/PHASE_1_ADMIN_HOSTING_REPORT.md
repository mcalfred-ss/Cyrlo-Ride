# Cyrlo Ride — Phase 1 Admin Hosting Report  
## First VPS deployment of Admin SPA

**Deployment date:** 2026-11-12  
**Live URL:** https://cyrlorideadmin.eqostack.com  
**VPS:** `188.166.155.199`  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `c306fc31c4c932624ac8dbe00755d78d624e5df5`  
**Working tree:** Phase 1C uncommitted work preserved (not staged/committed)  
**Ghana/maps stash:** intact (`stash@{0}: On main: wip-ghana-maps-preserve-phase0`)  
**Mode:** Frontend static hosting only — **no** migrations, **no** backend business-logic changes, **no** git commit/push  

---

## 1. Summary

The Admin Vite SPA from `apps/cyrlo_admin` is live behind a dedicated Nginx vhost and Let’s Encrypt certificate. It talks to the existing Ride API at `https://cyrloride.eqostack.com/api/v1`. Ride API, Maps API, and other EQOStack sites remained healthy after deploy.

**Status:** **Deployed and verified** (unauthenticated checks only; no live admin login performed).

---

## 2. Pre-deployment inspection

| Check | Result |
| --- | --- |
| DNS `cyrlorideadmin.eqostack.com` A | `188.166.155.199` |
| SSH | Documented key `~/.ssh/id_ed25519_cirlo` → `root@188.166.155.199` |
| Existing Ride API | Healthy (`GET /api/v1/health`) |
| Maps API unit | `cyrlo-maps-api.service` active |
| `/var/www/cyrlorideadmin` | Did not exist (safe to create) |
| Existing Nginx sites | Left in place; new site added beside them |

API base path confirmed from backend `API_PREFIX = /api/v1` and Admin client usage → production build uses:

`https://cyrloride.eqostack.com/api/v1`

---

## 3. Build and test results

From `apps/cyrlo_admin` before deploy:

| Step | Result |
| --- | --- |
| `npm test` | **19 files, 81 tests passed** |
| `npm run typecheck` | **exit 0** |
| Production build | **exit 0** |

Build environment (shell only; local `.env` left as localhost for dev):

- `VITE_API_BASE_URL=https://cyrloride.eqostack.com/api/v1`
- `VITE_ENVIRONMENT=production`

Bundle checks:

- Contains `https://cyrloride.eqostack.com/api/v1`
- No `localhost:3000`
- No matched secret patterns (`sk_live`, `sk_test`, Paystack/identity secrets)

Artifacts:

- `dist/index.html`
- `dist/assets/index-CY0VeW0t.js`
- `dist/assets/index-dSLvfgEu.css`

---

## 4. Hosting architecture

```
Internet
  → Nginx TLS (cyrlorideadmin.eqostack.com)
      → static root /var/www/cyrlorideadmin/current
          → releases/<timestamp>/
Browser JS fetch
  → https://cyrloride.eqostack.com/api/v1/*  (existing Ride API; not proxied by Admin vhost)
```

| Item | Value |
| --- | --- |
| Web root | `/var/www/cyrlorideadmin` |
| Current symlink | `/var/www/cyrlorideadmin/current` → `releases/20261112T084947Z` |
| Release kept | `releases/20261112T084947Z` (first release; future deploys keep prior releases) |
| Nginx available | `/etc/nginx/sites-available/cyrlorideadmin.eqostack.com` |
| Nginx enabled | `/etc/nginx/sites-enabled/cyrlorideadmin.eqostack.com` |
| SPA fallback | `try_files $uri $uri/ /index.html` |
| Asset cache | `/assets/` → 7d / immutable |
| `index.html` | `Cache-Control: no-cache` |
| Directory listing | `autoindex off` |

Admin is **not** served from the Ride API document root or proxied through the API vhost.

---

## 5. TLS

| Item | Value |
| --- | --- |
| Issuer | Let’s Encrypt (certbot `--nginx`) |
| Cert path | `/etc/letsencrypt/live/cyrlorideadmin.eqostack.com/` |
| Subject | `CN=cyrlorideadmin.eqostack.com` |
| Valid | 2026-11-12 → **2027-02-10** |
| HTTP | 301 redirect to HTTPS |
| Existing certs | Untouched (`cyrloride.eqostack.com`, `eqostack.com`, maps, etc.) |

`nginx -t` passed before reload.

---

## 6. CORS change (narrow)

**File:** `/etc/cyrlo-ride/ride.env`  
**Backup:** `/etc/cyrlo-ride/ride.env.bak-admin-cors-20261112`

| Before | After |
| --- | --- |
| `https://cyrloride.eqostack.com` | `https://cyrloride.eqostack.com,https://cyrlorideadmin.eqostack.com` |

Only the Admin origin was appended. Credential/CORS policy unchanged. Ride API restarted once after the env update; Maps API was not restarted for CORS.

Verified preflight:

- `Access-Control-Allow-Origin: https://cyrlorideadmin.eqostack.com`
- `Access-Control-Allow-Credentials: true`

---

## 7. Production security checks

| Check | Result |
| --- | --- |
| Ride `NODE_ENV` | `production` |
| `OTP_DEV_EXPOSE_CODE` in `ride.env` | **Absent** (not enabled) |
| Dev OTP echo in UI | Only if API returns `developmentCode`; production must not |
| Privileged tokens in local/session storage | **None** (browser check: empty storage on login page) |
| Admin vhost proxies API | **No** |
| Secrets in Vite env / bundle | **No** API secrets embedded |
| Live admin OTP / SMS / Paystack QA | **Not performed** |

---

## 8. Verification results

| Check | Result |
| --- | --- |
| DNS A → `188.166.155.199` | Pass |
| HTTPS homepage `200` | Pass |
| JS/CSS assets `200` | Pass |
| Direct `/overview` HTTP `200` (SPA shell) | Pass |
| Nested `/riders/:id` refresh shell `200` | Pass |
| Browser `/` → login (`Cyrlo Admin · production`) | Pass |
| Browser `/overview` unauthenticated → `/login` | Pass |
| Bundle API base = Ride HTTPS `/api/v1` | Pass |
| CORS Admin origin allowed | Pass |
| Ride health / ready | `200` / `200` |
| Maps unit active | Active (root HTTP `401` expected without auth) |
| `eqostack.com` | `200` |
| Other Nginx sites still enabled | Pass |

No live administrator credentials were used.

---

## 9. Rollback procedure

Previous release retention: this is the first Admin release. Rollback of **Admin only**:

1. Point symlink at a known-good release (when more than one exists):  
   `ln -sfn /var/www/cyrlorideadmin/releases/<PRIOR> /var/www/cyrlorideadmin/current`
2. `nginx -t && systemctl reload nginx`
3. If CORS must be reverted: restore `/etc/cyrlo-ride/ride.env.bak-admin-cors-20261112` → `/etc/cyrlo-ride/ride.env`, then `systemctl restart cyrlo-ride-api.service`
4. Do **not** roll back Maps, Cirlo, EQOStack, or Ride app code for an Admin frontend issue

Nginx site disable (last resort): remove symlink under `sites-enabled`, `nginx -t`, reload — leaves other vhosts alone.

---

## 10. Local files touched for this hosting task

| Path | Role |
| --- | --- |
| `apps/cyrlo_admin/.deploy/cyrlorideadmin.eqostack.com.nginx` | Source copy of initial vhost template |
| `apps/cyrlo_admin/.deploy/update-cors-admin-origin.py` | One-shot CORS helper used on VPS |
| `apps/cyrlo_admin/.deploy/verify-admin-hosting.sh` | Remote verification script |
| `apps/cyrlo_admin/dist/*` | Local production build output (deployed) |
| `docs/admin/PHASE_1_ADMIN_HOSTING_REPORT.md` | This report |

**Not committed.** Phase 1C source changes remain uncommitted as before. No git stage/commit/push.

Server-only changes: `/var/www/cyrlorideadmin/**`, Nginx Admin vhost, Let’s Encrypt Admin cert, Ride `CORS_ORIGINS` append + API restart.

---

## 11. Remaining concerns

1. First release only — keep at least one prior release on future deploys before deleting old ones.
2. Authenticated production smoke (OTP + MFA) still needs an explicit owner-authorized test.
3. Local Admin `.env` still points at localhost for development; production values are baked only into the deployed build via shell env at build time.
4. Maps root URL returns `401` without credentials (pre-existing behavior; service remains active).

---

## 12. Stop condition

Hosting for Phase 1 Admin frontend is complete and verified.  
**Do not start the next Admin development phase from this deploy task.**  
Await review of this report before further work.
