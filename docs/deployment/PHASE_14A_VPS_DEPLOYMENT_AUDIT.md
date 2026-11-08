# Cyrlo Ride — Phase 14A: VPS Pre-Deployment Audit

**Date:** 2026-11-07  
**Type:** Infrastructure and repository audit only  
**VPS (context only, not contacted):** `188.166.155.199`  
**Existing sites that must remain operational:** `eqostack.com`, `cirlo.online` (Eqostack-Tech)  
**Proposed staging API host:** `api-staging.cyrloride.com` (proposal — existence not verified)  

**Restrictions honored:** no deploy, no SSH/VPS access, no Nginx/DNS/firewall/PostgreSQL changes, no migrations, no application source changes, no secrets committed or printed.

Related docs: `docs/architecture/PRODUCTION_DEPLOYMENT_CHECKLIST.md`, Phase 12–13C architecture notes.

---

## 1. Current backend deployment architecture

| Item | Finding |
| --- | --- |
| Shape | Modular monolith (`backend/`) — Express 5 HTTP API + Socket.IO on the same Node process |
| Build | `npm run build` → `tsc -p tsconfig.json` → `dist/` |
| Start | `npm start` → `node dist/server.js` |
| Entry | `src/server.ts` → `createApp()` + `http.createServer` + Socket.IO + listen |
| Prefix | `API_PREFIX = /api/v1` |
| Package manager | **npm** with committed `package-lock.json` |
| Node engines | `>=20` (`package.json`) |
| Workers | **In-process only** — started from `createApp()` when `NODE_ENV !== 'test'` |
| Separate worker binaries | **None found** — no CLI/PM2 worker entrypoints for refunds/matching/outbox/expiry |

**Implication:** Staging can run as **one supervised Node process** that owns API + Socket.IO + all timers. Independently supervised workers are **not** supported without new entry points (out of scope for 14A). Prefer **one** API instance for matching timers until a dedicated matching writer exists.

```
Internet → (proposed) Nginx TLS → Node (HOST/PORT)
                ├── Express /api/v1/*
                ├── Socket.IO (same HTTP server)
                └── setInterval workers (unref’d)
```

---

## 2. Runtime requirements

### Commands

| Step | Command (from `backend/`) |
| --- | --- |
| Install | `npm ci` (preferred) or `npm install` |
| Generate Prisma client | `npx prisma generate` |
| Migrate (deploy) | `npx prisma migrate deploy` |
| Build | `npm run build` |
| Run | `NODE_ENV=production npm start` |
| Validate | `npm run typecheck`, `npm test`, `npx prisma validate`, `npx prisma migrate status` |

### Process behaviour

| Topic | Behaviour |
| --- | --- |
| Bind | `HOST` (default `0.0.0.0`), `PORT` (default `3000`) |
| Logging | Pino (`LOG_LEVEL`); redacts auth/OTP/token/API-key paths |
| Graceful shutdown | `SIGINT`/`SIGTERM` → close HTTP → close Socket.IO → `prisma.$disconnect` → exit 0; **10s** forced exit |
| Worker timers on shutdown | Intervals use `.unref()`; **not explicitly cleared** on shutdown (stop with process) |
| Crash recovery | Restart process; durable state in Postgres; webhooks/outbox/refund claims are conditional |

### Health

| Endpoint | Role |
| --- | --- |
| `GET /api/v1/health` | Liveness (process up; does not require DB) |
| `GET /api/v1/health/ready` | Readiness: `SELECT 1` + SMS/push adapter readiness metadata (**no secrets**) |

Use **ready** for traffic admission; **live** for restart decisions.

---

## 3. Database requirements

| Item | Requirement |
| --- | --- |
| Application DB | **`cyrlo_ride_app` only** |
| Legacy DB | **`cyrlo_ride` — do not connect, migrate, or modify** |
| Provider | PostgreSQL via Prisma (`provider = "postgresql"`) |
| Extensions | **None required** by migrations (no `CREATE EXTENSION` in repo) |
| Migration count | **14** ordered Prisma migrations (see list below) |
| Extra SQL | `prisma/financial-constraints.sql` — CHECKs/partial uniques applied with init; do not rely on `db push` |
| Pooling | Prefer direct Postgres or Prisma-compatible pooler; avoid PgBouncer **transaction** mode unless Prisma is configured for it |
| Public exposure | **Do not** open PostgreSQL to the internet |

### Migrations (order)

1. `20261106170000_init`  
2. `20261107000000_refresh_token_family`  
3. `20261107043000_admin_rbac_mfa`  
4. `20261107050000_rider_onboarding_vehicles`  
5. `20261107060000_service_zones_rider_approvals`  
6. `20261107070000_rider_location_received_at`  
7. `20261107080000_booking_payment_lifecycle`  
8. `20261107090000_matching_offers`  
9. `20261107100000_trip_execution_disputes`  
10. `20261107110000_token_packages_purchases`  
11. `20261107120000_notifications_outbox`  
12. `20261107130000_financial_reconciliation`  
13. `20261107140000_phase_11b_passenger_ack`  
14. `20261107150000_phase_13a_refund_authorization`  

### Roles / permissions (recommended)

- Dedicated role with DML + migrate privileges on `cyrlo_ride_app` only.  
- No grants on `cyrlo_ride`.  
- App runtime role should not be a superuser.

### Backup / restore

- Script: `backend/scripts/backup-postgres.sh` (`pg_dump --format=custom`, retention via `RETENTION_DAYS`).  
- Restore: stop writers → restore into staging/new DB → `prisma migrate status` → spot-check → resume.  
- Dumps **do not** include encryption keys; identity ciphertext is useless without `IDENTITY_ENCRYPTION_KEY`.

### Migration procedure (staging/production)

```bash
# With DATABASE_URL pointing ONLY at cyrlo_ride_app (or staging twin)
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status   # expect up to date
```

Never run `migrate deploy` against the legacy database URL.

---

## 4. Worker deployment architecture

All workers start inside the API process (`app.ts`). **No standalone worker entry points exist.**

| Worker | Module | Default interval | Responsibility | Duplicate protection |
| --- | --- | --- | --- | --- |
| Unpaid booking expiry | `jobs/expire-unpaid-bookings.ts` | **30s** | Expire unpaid `AWAITING_PAYMENT` | Conditional status transitions |
| Matching | `jobs/matching-workers.ts` | **5s** | Expire offers/searches + dispatch | Accept TX / unique constraints; prefer single writer |
| Refunds | `jobs/refund-workers.ts` | **10s** | Submit authorized refunds, reconcile, missing-fee sweeper | DB claim + `authorized_at` + idempotency keys |
| Notification outbox | `jobs/notification-outbox-worker.ts` | `NOTIFICATION_OUTBOX_POLL_MS` (3s) | Claim/deliver IN_APP/PUSH/SMS | Claim/lock + backoff; multi-worker-capable |

**Required env (shared with API):** full production env; workers especially need Paystack (refunds), Vynfy/SMS + FCM (outbox), `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` (matching), `DATABASE_URL`.

**Monitoring:** health endpoints do **not** prove workers are alive — rely on process supervisor + logs.

**Restart recovery:** timers resume on process start; durable rows remain in Postgres.

---

## 5. DNS and Nginx plan (proposal — not applied)

### Proposed staging host

`api-staging.cyrloride.com`

**Not verified:** DNS ownership, zone existence, or certificate readiness.

### DNS (operator action)

| Record | Purpose |
| --- | --- |
| `A` / `AAAA` (or CNAME) for `api-staging.cyrloride.com` → VPS | Point staging API hostname at `188.166.155.199` (or the chosen LB) |
| Do **not** alter records for `eqostack.com` / `cirlo.online` | Preserve existing sites |

### Nginx (new server block only)

Requirements for a **new** vhost (do not overwrite Eqostack/Cirlo configs):

| Concern | Guidance |
| --- | --- |
| Upstream | `127.0.0.1:<CYRLO_PORT>` (choose free port; confirm vs existing Node apps) |
| TLS | HTTPS via Let’s Encrypt / existing cert workflow |
| HTTP → HTTPS | Redirect |
| Paths | Proxy `/api/v1/` and Socket.IO path (default `/socket.io/`) |
| WebSocket | `proxy_http_version 1.1`; `Upgrade` / `Connection` headers for Socket.IO |
| Body size | At least **8mb** (`client_max_body_size`) for rider document uploads (`MAX_DOCUMENT_BYTES = 8 MiB`); JSON API uses 1mb |
| Timeouts | Raise proxy read/send timeouts for uploads and long polls as needed |
| Health | Allow `GET /api/v1/health` and `/api/v1/health/ready` without auth |
| Paystack webhook | `POST /api/v1/payments/paystack/webhook` publicly reachable with valid TLS |
| Access control | Prefer IP allowlist / basic auth / VPN for staging admin surfaces if possible |

### `TRUST_PROXY`

- After verifying hop count (typically **1** for single Nginx → Node), set `TRUST_PROXY=1` (or explicit proxy CIDRs).  
- **Never** `TRUST_PROXY=true`.  
- Production/staging with `NODE_ENV=production` rejects bare `false` unless `TRUST_PROXY_DIRECT=true`.  
- **Hop count must be confirmed on the server** — not guessed in this audit.

---

## 6. Security and secrets checklist

Generate **unique staging** secrets. Never copy local `.env` to the server. Never commit secrets.

| Secret / setting | Staging requirement |
| --- | --- |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Unique, ≥32 chars, distinct, no placeholders |
| `OTP_HASH_SECRET` | Unique, no placeholders |
| `ADMIN_MFA_ENCRYPTION_KEY` | Fresh 32-byte base64; **not** example keys |
| `IDENTITY_ENCRYPTION_KEY` | Fresh 32-byte base64; **must differ** from MFA key |
| `PAYSTACK_SECRET_KEY` / public | **Test** keys for staging |
| `VYNFY_API_KEY` / `VYNFY_SENDER_ID` | Staging credentials; sender approval may still be pending |
| `SMS_PROVIDER=vynfy` | Required for real OTP delivery |
| FCM service-account JSON | Mount privately via `FCM_SERVICE_ACCOUNT_FILE`; never public URL/git |
| R2 keys + bucket | Prefer **separate staging bucket** |
| `DATABASE_URL` | Staging DB only (`cyrlo_ride_app_staging` or equivalent name) |
| `TRUST_PROXY` | Explicit hop/CIDR after topology verify |
| `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` | Explicit product-approved integer (required to boot matching in production mode) |
| `ADMIN_BOOTSTRAP_SECRET` | Empty to disable, or unique ≥32 chars if bootstrap needed once |
| `CORS_ORIGINS` | Staging web origins only |

Readiness responses must never include key material (current code returns adapter flags only).

---

## 7. Staging environment plan

| Dimension | Staging |
| --- | --- |
| Database | Separate Postgres DB; never shared with prod or legacy |
| Secrets | Unique; test Paystack |
| SMS | Vynfy with controlled destination numbers; prefer live-verify script before broad OTP |
| Push | Optional FCM project or disabled (`PUSH_PROVIDER` empty → fail-closed push, in-app may still work) |
| Domain | Proposed `api-staging.cyrloride.com` |
| Access | Restrict admin/bootstrap; no real customer trips/payments |
| Process | Single PM2/systemd unit recommended |
| Port | Private localhost port behind Nginx |

### Integrations that need live credentials to fully prove

- Vynfy handset delivery (MTN/Telecel/AT)  
- Paystack charge/refund webhooks end-to-end  
- FCM device receipt  
- R2 upload/download  

Mocked CI tests do **not** replace these.

---

## 8. Production environment considerations

- Same architecture as staging with live Paystack, production Vynfy sender, production R2/FCM.  
- Single matching writer until separate workers exist.  
- Scheduled `backup-postgres.sh` + restore drill.  
- Pilot still blocked by open product/ops items (zones polygons, offer timeout product value, Phase 12 residuals). See Production Deployment Checklist §9.  
- Do not disrupt Eqostack/Cirlo vhosts, certs, or DBs.

---

## 9. VPS deployment risks

| Risk | Mitigation |
| --- | --- |
| Overwriting Nginx for `eqostack.com` / `cirlo.online` | Add **new** server block only; peer review config before reload |
| Port collision with existing Node apps | Inventory listening ports before choosing Cyrlo `PORT` |
| Accidentally migrating `cyrlo_ride` | Separate role + URL; checklist gate |
| `TRUST_PROXY` wrong hop count | Spoofed or collapsed IPs → rate-limit/audit errors; verify with known client IP |
| Multi-instance matching timers | Duplicate dispatch work; keep instances=1 initially |
| In-memory rate limits | Not shared across processes — stay single instance or accept independent buckets |
| Worker death invisible to `/health` | Supervisor restart + log alerts |
| Staging SMS cost / spam | Controlled allowlist; opt-in verify scripts only |
| Resource contention | Monitor CPU/RAM/disk vs existing sites; start small |

**Firewall:** no recommendation to open Postgres publicly. SSH/firewall changes are out of scope and require server-owner approval.

---

## 10. Exact deployment steps (recommended order)

**Do not execute these against production VPS from this milestone.**

1. **Server owner confirms** free port, Node ≥20 available, Postgres capacity, DNS for proposed host, Nginx change window.  
2. Create staging Postgres database/role (`…_staging`); **never** use legacy `cyrlo_ride`.  
3. Create private secrets (JWT, OTP hash, MFA key, identity key, Paystack test, Vynfy, R2 staging, FCM file mount).  
4. Provision DNS for `api-staging.cyrloride.com` (or agreed alternative).  
5. Deploy code artifact to an isolated directory (e.g. `/var/www/cyrlo-ride-api` — path TBD by owner).  
6. `npm ci` → `npx prisma migrate deploy` → `npx prisma generate` → `npm run build`.  
7. Configure systemd/PM2 with `NODE_ENV=production`, env file outside git, `TRUST_PROXY` after hop verify.  
8. Start process; verify `GET /api/v1/health` and `/ready`.  
9. Add **new** Nginx server block + TLS; `nginx -t` then reload.  
10. Point Paystack **test** webhook at staging URL; verify signature + duplicate delivery.  
11. Optional: `VYNFY_LIVE_VERIFY=1` / FCM live verify scripts with dedicated test destinations.  
12. Smoke: OTP (if SMS ready), admin MFA, booking fee initialize, webhook → SEARCHING.  
13. Confirm `eqostack.com` and `cirlo.online` still healthy.  
14. Enable backups for staging DB if retained.

---

## 11. Missing information (server-owner confirmation required)

| # | Question |
| --- | --- |
| 1 | Does `cyrloride.com` DNS exist and can `api-staging.cyrloride.com` be created? |
| 2 | Exact Nginx layout / hop count from client → TLS terminator → Node? |
| 3 | Which localhost ports are already used by Eqostack/Cirlo Node apps? |
| 4 | Postgres version on VPS; capacity for a new `cyrlo_ride_app_staging` DB? |
| 5 | Preferred process manager (systemd vs PM2) already in use? |
| 6 | Where should app files and secret files live on disk? |
| 7 | Is Vynfy sender ID approved for Ghana networks? |
| 8 | Staging Paystack business / webhook access available? |
| 9 | Staging R2 bucket and FCM project available? |
| 10 | Who may open firewall/DNS/Nginx change windows? |
| 11 | Product value for `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS`? |
| 12 | Are pilot service-zone polygons ready to load? |

**This audit did not SSH to `188.166.155.199` or inspect live Nginx/Postgres.**

---

## 12. Go / no-go assessment

### Application repository (code packaging)

| Criterion | Status |
| --- | --- |
| Buildable Node ≥20 monolith with lockfile | **GO** |
| Documented start/migrate/health/shutdown | **GO** |
| App DB migrations isolated (`cyrlo_ride_app`) | **GO** (operator must keep URLs correct) |
| Workers runnable | **GO as in-process**; **NO-GO for separate worker processes** (entrypoints absent) |
| Secrets validation (Phase 13C) | **GO** if staging secrets generated correctly |
| SMS adapter (Vynfy) present | **GO for code**; live delivery **unproven** |
| VPS coexistence plan | **Documented**; execution unproven |

### VPS / staging readiness

| Criterion | Status |
| --- | --- |
| VPS inventory (ports, Nginx, Postgres) | **UPDATED 2026-11-08** — Ride on `:3020` via systemd; Cirlo remains on PM2 |
| DNS / host | **LIVE** — `cyrloride.eqostack.com` |
| Staging DB created | **YES** — `cyrlo_ride_staging` |
| Secrets mounted on server | **YES** — `/etc/cyrlo-ride/ride.env` + `providers.env` |
| Non-disruption of Eqostack/Cirlo | **OK so far** — separate Nginx site + port; do not restart `cirlo-api` for Ride |

### Verdict (updated 2026-11-08)

- **Staging API:** **LIVE** at `https://cyrloride.eqostack.com` (`cyrlo-ride-api.service`, Nginx → `127.0.0.1:3020`).  
- **OTP SMS (Vynfy):** **WORKING** after correct `providers.env` + `systemctl restart cyrlo-ride-api`.  
- **Maps HTTP:** host up; Ride readiness reports Maps configured.  
- See `docs/deployment/STAGING_LIVE_STATUS.md` for current ops detail.

---

## Appendix A — Required vs optional environment variables (summary)

**Required for `NODE_ENV=production` boot (fail-closed):**  
`DATABASE_URL`, JWT secrets, `OTP_HASH_SECRET`, MFA + identity encryption keys (strong, distinct), `PAYSTACK_SECRET_KEY`, `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS`, valid `TRUST_PROXY` (or `TRUST_PROXY_DIRECT=true`).

**Required for OTP SMS:** `SMS_PROVIDER=vynfy`, `VYNFY_API_KEY`, `VYNFY_SENDER_ID`.

**Required for rider docs:** R2 account/key/secret/bucket.

**Required for push:** `PUSH_PROVIDER=fcm`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_FILE`.

**Optional / tuning:** rate-limit windows, notification outbox knobs, maps stub, bootstrap secret, CORS, log level.

---

## Appendix B — Coexistence checklist (existing websites)

- [ ] Inventory current Nginx server blocks for `eqostack.com` / `cirlo.online`  
- [ ] Add Cyrlo staging as a **new** server block only  
- [ ] `nginx -t` before reload  
- [ ] Verify existing sites after reload  
- [ ] Confirm Cyrlo binds only to localhost/chosen port  
- [ ] Confirm Postgres user cannot see legacy DB  
- [ ] No shared `.env` with other apps  
