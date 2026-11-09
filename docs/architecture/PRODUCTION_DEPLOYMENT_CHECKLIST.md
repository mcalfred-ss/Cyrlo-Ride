# Cyrlo Ride — Production Deployment Checklist

Companion to `CYRLO_RIDE_MILESTONE_11_INTEGRATION_AUDIT.md`.  
**Do not** modify VPS, Nginx, DNS, or hosted websites from application milestones without a separate ops change request.  
**Never** point this app at the legacy `cyrlo_ride` database.

---

## 1. Required environment variables

Copy `backend/.env.example` → `backend/.env` (or platform secrets). Production boot rejects development placeholders containing `change-me` or `development-only`.

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `HOST` / `PORT` | Yes | Bind address for the API |
| `DATABASE_URL` | Yes | PostgreSQL URL for **`cyrlo_ride_app` only** |
| `CORS_ORIGINS` | Yes | Comma-separated browser origins |
| `JWT_ACCESS_SECRET` | Yes | Distinct from refresh; no placeholders |
| `JWT_REFRESH_SECRET` | Yes | Distinct from access |
| `JWT_ACCESS_TTL_SECONDS` | Yes | Default 900 |
| `JWT_REFRESH_TTL_SECONDS` | Yes | Default 2592000 |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Yes | Must match token verification |
| `OTP_HASH_SECRET` | Yes | No placeholders in production |
| `OTP_*` rate/TTL settings | Yes | Tune for abuse control |
| `OTP_DEV_EXPOSE_CODE` | Must be false/ignored | Ignored when `NODE_ENV=production` |
| `ADMIN_BOOTSTRAP_SECRET` | Optional | ≥32 chars to enable bootstrap; empty disables |
| `ADMIN_MFA_ENCRYPTION_KEY` | Yes | 32-byte base64 AES key |
| `ADMIN_MFA_*` / `TOTP_ISSUER` | Yes | MFA windows and issuer label |
| `IDENTITY_ENCRYPTION_KEY` | Yes | 32-byte base64; **must differ** from MFA key |
| `IDENTITY_ENCRYPTION_KEY_VERSION` | Yes | Integer ≥ 1 |
| `STORAGE_PROVIDER` | Yes for docs | `bunny` |
| `BUNNY_STORAGE_ZONE_NAME` | Yes for docs | Edge Storage zone name |
| `BUNNY_STORAGE_ACCESS_KEY` | Yes for docs | Zone password / AccessKey |
| `BUNNY_STORAGE_HOSTNAME` | Yes for docs | e.g. `storage.bunnycdn.com` |
| `BUNNY_CDN_BASE_URL` | Yes for docs | Pull zone URL (`https://….b-cdn.net`) |
| `BUNNY_CDN_TOKEN_KEY` | Yes for docs | Pull zone Advanced Token Authentication key |
| `OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS` | Yes | Short TTL recommended (e.g. 60) |
| `PAYSTACK_SECRET_KEY` | **Required in production** | Webhook HMAC + API |
| `PAYSTACK_PUBLIC_KEY` | Recommended | Client initialize |
| `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` | **Required in production** | Product-approved: **20** (seconds per offer before next batch) |
| `SMS_PROVIDER` / `SMS_API_KEY` | Required for live OTP | **Deployment blocker until existing vendor adapter is wired** (Phase 11B). Credentials alone → `ready=false` |
| `SMS_SENDER_ID` | Optional | Default `Cyrlo` |
| `PUSH_PROVIDER` | Optional until push | `fcm` for HTTP v1 |
| `FCM_PROJECT_ID` | Required for push | Firebase project id |
| `FCM_SERVICE_ACCOUNT_FILE` | Required for push | Path to mounted service-account JSON (never commit) |
| `PUSH_API_KEY` | Deprecated | Only with `PUSH_PROVIDER=fcm-legacy` temporary bridge |
| `NOTIFICATION_OUTBOX_*` | Optional | Worker tuning |
| `MAPS_PROVIDER` / `MAPS_API_KEY` | Optional | Server maps stub may remain unused |
| `LOG_LEVEL` | Yes | Prefer `info` or `warn` in production |
| `TRUST_PROXY` | Yes if behind reverse proxy | **Never `true`.** Use hop count `1`–`5` or explicit IPs/CIDRs after topology is verified |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Yes | Global API limiter |

Generate encryption keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 2. Database setup and migrations

1. Create PostgreSQL database `cyrlo_ride_app` (role with least privilege).  
2. Set `DATABASE_URL` to that database only.  
3. From `backend/`:

```bash
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```

4. Confirm: schema valid (`npm run prisma:validate`) and status **up to date**.  
5. Seed operational data **outside** inventing product rules: active service-zone polygons (ops-sourced), token packages (`STARTER` / `STANDARD` / `PRO` per master spec starting prices if still provisional), Super Admin bootstrap if enabled.

### Rollback limitations

- Prisma migrations are forward-only by default.  
- Do **not** assume `migrate resolve` or manual DROP is safe for financial tables.  
- Prefer restore-from-backup for catastrophic schema mistakes.  
- Never run destructive SQL against legacy `cyrlo_ride`.

---

## 3. Worker processes and scheduling

Current packaging starts these inside the API when `NODE_ENV !== 'test'`:

| Worker | Module | Interval (default) | Responsibility |
| --- | --- | --- | --- |
| Unpaid booking expiry | `jobs/expire-unpaid-bookings.ts` | ~60s | `AWAITING_PAYMENT` → `PAYMENT_FAILED` after 10 minutes |
| Matching | `jobs/matching-workers.ts` | 5s | Expire offers + expire offers/searches |
| Notification outbox | `jobs/notification-outbox-worker.ts` | `NOTIFICATION_OUTBOX_POLL_MS` | Claim/deliver outbox rows |
| Refunds | `jobs/refund-workers.ts` | 10s | Submit / reconcile refunds; queue missing booking-fee refunds |

**Production guidance**

- Until separate process entrypoints exist, run **one** API instance that owns matching timers, or accept duplicate dispatch ticks (accept TX still single-winner). Prefer single matching writer.  
- Outbox claim SQL supports multiple workers; safe to scale delivery later.  
- Process crash: financial state recovers via DB constraints + webhook reprocessing; restart API to resume timers.  
- Health does not prove workers are alive — monitor logs / metrics separately.

---

## 4. External provider configuration

### PostgreSQL

- Private network only.  
- Connection pooling compatible with Prisma (avoid PgBouncer transaction mode unless configured for Prisma).  
- Backups: see §5.

### Paystack

1. Live/test secret + public keys in env.  
2. Webhook URL → `POST /api/v1/payments/paystack/webhook` (mounted under payments router).  
3. Enable **charge** and **refund** webhook events on that URL.  
4. Verify signature header validation in staging with duplicate delivery.  
5. Confirm currency `GHS` and booking fee amount **100** pesewas.  
6. Confirm refunds stay `PROCESSING` until `refund.processed` (or Finance reconcile), not merely after create-refund HTTP 200.

### Bunny.net object storage

1. Create a **private** Edge Storage zone (no public open listing).  
2. Attach a Pull Zone; enable **Token Authentication** (Advanced / HS256).  
3. Set `STORAGE_PROVIDER=bunny` plus zone name, AccessKey, storage hostname, CDN base URL, and CDN token key.  
4. Keep `OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS` short (e.g. 60).  
5. Confirm Ghana Card and vehicle images never logged as plaintext.

### Identity / MFA encryption

1. Store keys in a secrets manager (product key-manager choice still open).  
2. Rotate via `IDENTITY_ENCRYPTION_KEY_VERSION` only with a tested re-encrypt plan.  
3. Never put keys in git, backup SQL dumps, or audit payloads.

### SMS

1. Choose vendor (open decision).  
2. Implement/enable adapter; credentials alone may not send.  
3. OTP is fail-closed without a working sender in production.

### Push (FCM HTTP v1)

1. Set `PUSH_PROVIDER=fcm`, `FCM_PROJECT_ID`, and `FCM_SERVICE_ACCOUNT_FILE` (mounted JSON).  
2. Confirm Firebase console APNs auth key/certs for Flutter iOS (FCM→APNs; no direct APNs in API).  
3. Register device tokens via notifications API.  
4. Opt-in live check: `FCM_LIVE_VERIFY=1 FCM_LIVE_DEVICE_TOKEN=… npx tsx scripts/verify-fcm-http-v1.ts`.  
5. Unconfigured push fails closed on send; in-app outbox delivery continues.

### Maps

- Server geocode may remain stub. Flutter uses pinned Cyrlo Maps commit per master spec.  
- Do not invent a Cyrlo Maps HTTP API.

### Socket.IO

- Same origin/CORS rules as HTTP.  
- Clients authenticate with access token in `handshake.auth.token`.  
- Join booking rooms only via `booking:subscribe` after server ownership check.

---

## 5. Backup and recovery

Script: `backend/scripts/backup-postgres.sh`

```bash
export DATABASE_URL='postgresql://…/cyrlo_ride_app'
export BACKUP_DIR=/var/backups/cyrlo-ride
export RETENTION_DAYS=14
./backend/scripts/backup-postgres.sh
```

Produces custom-format `pg_dump` files. Schedule via cron on the DB host.

### Restore (outline)

1. Stop writers (API/workers).  
2. Create empty target DB or restore into a new database name.  
3. `pg_restore --clean --if-exists -d "$DATABASE_URL" path/to/dump` (test on staging first).  
4. Run `prisma migrate status` — expect up to date.  
5. Verify payment/webhook/ledger row counts spot checks.  
6. Resume API.

**Note:** Dumps do not include encryption key material. Identity ciphertext is useless without `IDENTITY_ENCRYPTION_KEY`.

---

## 6. Health checks

| Endpoint | Purpose | Expect |
| --- | --- | --- |
| `GET /api/v1/health` | Liveness | `200` even if DB down (process up) |
| `GET /api/v1/health/ready` | Readiness | `200` when `SELECT 1` succeeds; `503` if DB unavailable |

Load balancers should:

- Use **ready** for traffic admission.  
- Use **live** for restart decisions.  
- Not treat missing SMS/Paystack as readiness failure unless you add explicit dependency probes later.

---

## 7. Deployment verification

After deploy:

1. `NODE_ENV=production` process starts (fails closed if secrets missing).  
2. `/health` and `/health/ready` OK.  
3. `prisma migrate status` up to date.  
4. Auth OTP send path works (or intentionally blocked until SMS ready).  
5. Admin login + MFA enroll/verify.  
6. Create booking → Paystack initialize → webhook → `SEARCHING`.  
7. Matching creates offers only when timeout env set.  
8. Accept → one token debit → complete trip.  
9. Duplicate webhook delivery leaves balances unchanged.  
10. Rider document upload to R2 + signed download.  
11. Notification outbox drains (in-app at minimum).  
12. Socket connect with token; `booking:subscribe` for owned booking.  
13. Confirm logs contain no secrets, OTP codes, or Ghana Card plaintext.

---

## 8. Rollback considerations

| Change type | Rollback approach |
| --- | --- |
| Application code only | Redeploy previous artifact; keep DB |
| Additive migration | Usually safe to keep; app rollback must tolerate new columns |
| Destructive migration | Restore DB backup; do not invent down migrations in prod |
| Secret rotation mistake | Restore previous secret version from vault; restart |
| Paystack webhook URL change | Keep old URL until new verified |
| Feature flags / env | Turn off matching by unsetting timeout only in emergency (dispatch fails closed) |

Financial rule: **never** delete or rewrite `token_ledger_entries`, successful `payments`, or processed `payment_webhook_events` to “fix” balances. Use compensating ledger/refund rows.

---

## 9. Pre-pilot gate

Pilot is blocked until:

- [x] Product sets `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` (= **20**)  
- [ ] Live polygons loaded for Atwima Kwanwoma pilot subareas *(deferred — jump later)*  
- [x] Paystack live keys + webhook verified *(staging webhook: Transactions + Refund → `https://cyrloride.eqostack.com/api/v1/payments/paystack/webhook`; signature check OK)*  
- [ ] Bunny.net storage + CDN token auth configured *(replaces Cloudflare R2)*  
- [ ] Identity + MFA keys in secrets manager  
- [ ] SMS path proven for OTP  
- [ ] Backups scheduled and restore drilled once  
- [ ] Single matching writer topology agreed  
- [ ] Open refund/dispute policies acknowledged (no silent invention)

Flutter integration can proceed earlier against staging with test keys and an explicit offer timeout.
