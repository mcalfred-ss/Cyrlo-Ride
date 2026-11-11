# Phase 13D — Pilot Configuration Audit

**Date:** 2026-11-07  
**Scope:** Read-only audit of the Cyrlo Ride backend and docs to prepare pilot / staging configuration.  
**Code base:** `main` @ `3740328` (includes Phase 13A–13C).  
**Staging intent:** `cyrloride.eqostack.com` → localhost `3020` behind Nginx on the existing Ubuntu VPS.  
**Pilot geography (product intent only):** Ahenema Kokoben, Atwima Kwanwoma District, Ashanti Region, Ghana.  
**This document does not invent polygons, timeout values, or secrets.**

**Classification legend**

| Tag | Meaning |
| --- | --- |
| **Confirmed in code** | Behaviour verified in repository source |
| **Requires operator decision** | Product/ops must choose; code will not invent |
| **Requires external provider action** | Account, approval, or credentials from a vendor |
| **Requires live verification** | Must be proven against a real provider/network; code alone is insufficient |

---

## 1. Executive summary

Phases 13A–13C closed the major **in-repo** pilot blockers for refund authorization, Vynfy SMS adapter wiring, and production env hardening (`TRUST_PROXY`, encryption-key strength, isolated rate limits). The application **can** boot in staging once secrets and operator values are supplied.

**Pilot configuration is not yet complete.** Remaining work is almost entirely configuration and external proof:

1. **Operator decision:** explicit `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` (no default; dispatch fails closed without it).  
2. **Operator decision + data:** verified GeoJSON for the Ahenema Kokoben pilot zone — **no polygon exists in the repository**. Bookings require an **active** zone covering the pickup.  
3. **External provider + live verification:** Paystack (test keys + webhook), Vynfy (API key, sender ID approval, handset delivery), FCM (project + service account + device receipt), Cloudflare R2 (bucket + signed URL).  
4. **Staging deployment:** dedicated DB/role, env file outside git, bind API to `127.0.0.1:3020`, new Nginx vhost + TLS for `cyrloride.eqostack.com`, single process (in-process workers).  

**No external service is marked verified** in this audit. Adapter presence ≠ live readiness.

---

## 2. Exact environment variable checklist

Source of truth: `backend/src/config/env.ts` + `backend/.env.example`. Names below are exact.

| Variable | Required? | Current validation | Staging value needed? | Notes |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Yes (effective) | enum `development` \| `test` \| `production`; default `development` | **Yes** → `production` for fail-closed staging boot | Staging should use production validation. **Confirmed in code** |
| `HOST` | Soft | string min 1; default `0.0.0.0` | **Yes** → prefer `127.0.0.1` behind Nginx | Default listens on all interfaces. **Confirmed in code** / **Requires operator decision** for bind address |
| `PORT` | Soft | positive int; default `3000` | **Yes** → `3020` | Align with Nginx upstream. **Requires operator decision** (port free on VPS) |
| `DATABASE_URL` | **Yes** | non-empty string | **Yes** | Staging DB only (`cyrlo_ride_app_staging` recommended). Never legacy Cirlo DBs. **Confirmed in code** |
| `CORS_ORIGINS` | Soft | comma-split list; default empty | **Likely** | Empty allows mobile (no Origin) and blocks unknown browser origins. Add Flutter web / admin origins if used. **Confirmed in code** |
| `JWT_ACCESS_SECRET` | **Yes** | min 32; ≠ refresh; prod rejects `change-me` / `development-only` | **Yes** (unique staging) | **Confirmed in code** |
| `JWT_REFRESH_SECRET` | **Yes** | min 32; ≠ access; prod placeholder reject | **Yes** | **Confirmed in code** |
| `JWT_ACCESS_TTL_SECONDS` | Soft | positive int; default `900` | Optional | **Confirmed in code** |
| `JWT_REFRESH_TTL_SECONDS` | Soft | positive int; default `2592000` | Optional | **Confirmed in code** |
| `JWT_ISSUER` | Soft | min 1; default `cyrlo-ride` | Optional | Must match token verify. **Confirmed in code** |
| `JWT_AUDIENCE` | Soft | min 1; default `cyrlo-ride-clients` | Optional | **Confirmed in code** |
| `OTP_TTL_SECONDS` | Soft | positive int; default `300` | Optional | **Confirmed in code** |
| `OTP_MAX_ATTEMPTS` | Soft | positive int; default `5` | Optional | **Confirmed in code** |
| `OTP_RESEND_COOLDOWN_SECONDS` | Soft | positive int; default `60` | Optional | **Confirmed in code** |
| `OTP_HASH_SECRET` | **Yes** | min 32; prod placeholder reject | **Yes** | **Confirmed in code** |
| `OTP_DEV_EXPOSE_CODE` | Soft | `true`/`false` → bool; default false | **Must be false** in staging | Ignored for exposure when `NODE_ENV=production`. **Confirmed in code** |
| `OTP_RATE_LIMIT_WINDOW_MS` | Soft | positive int; default `900000` | Optional | **Confirmed in code** |
| `OTP_RATE_LIMIT_MAX` | Soft | positive int; default `10` | Optional | **Confirmed in code** |
| `ADMIN_BOOTSTRAP_SECRET` | Conditional | default `""`; empty disables bootstrap; if set in prod must not be placeholder; runtime requires length ≥ 32 to accept bootstrap | **Operator decision** | Empty OK after Super Admin exists. **Confirmed in code** |
| `ADMIN_MFA_ENCRYPTION_KEY` | **Yes** | base64 → 32 bytes; prod rejects example/weak keys; must ≠ identity key | **Yes** (unique strong) | **Confirmed in code** |
| `IDENTITY_ENCRYPTION_KEY` | **Yes** | same as MFA key rules; must differ from MFA | **Yes** | **Confirmed in code** |
| `IDENTITY_ENCRYPTION_KEY_VERSION` | Soft | positive int; default `1` | Optional | **Confirmed in code** |
| `ADMIN_INVITE_TTL_SECONDS` | Soft | default `259200` | Optional | **Confirmed in code** |
| `ADMIN_MFA_PENDING_TTL_SECONDS` | Soft | default `600` | Optional | **Confirmed in code** |
| `ADMIN_RECENT_MFA_SECONDS` | Soft | default `900` | Optional | **Confirmed in code** |
| `TOTP_ISSUER` | Soft | default `Cyrlo Ride Admin` | Optional | **Confirmed in code** |
| `R2_ACCOUNT_ID` | Soft at boot | string default `""` | **Yes** for rider docs | Fail-closed on upload/download if incomplete. **Confirmed in code** |
| `R2_ACCESS_KEY_ID` | Soft at boot | default `""` | **Yes** for docs | **Confirmed in code** |
| `R2_SECRET_ACCESS_KEY` | Soft at boot | default `""` | **Yes** for docs | **Confirmed in code** |
| `R2_BUCKET` | Soft at boot | default `""` | **Yes** (prefer staging bucket) | **Confirmed in code** / **Requires external provider action** |
| `R2_SIGNED_URL_TTL_SECONDS` | Soft | positive int; default `60` | Optional | **Confirmed in code** |
| `RIDER_DOC_RETENTION_MONTHS_AFTER_CLOSURE` | Soft | positive int; default `12` | Optional | Policy constant for retention messaging. **Confirmed in code** |
| `PAYSTACK_SECRET_KEY` | **Yes in production** | non-empty required when `NODE_ENV=production` | **Yes** (test keys for staging) | Webhook HMAC + API client. **Confirmed in code** |
| `PAYSTACK_PUBLIC_KEY` | Soft | default `""`; **not referenced outside `env.ts`** | Optional for API; clients may need it | Documented in `.env.example`; unused by server logic today. **Confirmed in code** |
| `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` | **Yes in production**; required for dispatch always | optional positive int; empty → undefined; prod boot fails if unset; dispatch throws 503 if unset | **Yes** — product must choose | No default; not GPS 30s. **Confirmed in code** / **Requires operator decision** |
| `SMS_PROVIDER` | Soft / conditional | string; `vynfy` for production OTP | **Yes** → `vynfy` for real OTP | Empty → prod fail-closed on send. **Confirmed in code** |
| `SMS_API_KEY` | Soft | unused when `SMS_PROVIDER=vynfy` | No for Vynfy path | Legacy/generic placeholder. **Confirmed in code** |
| `SMS_SENDER_ID` | Soft | default `Cyrlo`; not used for Vynfy adapter credentials | Prefer `VYNFY_SENDER_ID` | **Confirmed in code** |
| `VYNFY_API_KEY` | **Yes if** `SMS_PROVIDER=vynfy` | required whenever provider is vynfy; prod rejects placeholder pattern | **Yes** | Never commit. **Confirmed in code** / **Requires external provider action** |
| `VYNFY_SENDER_ID` | **Yes if** `SMS_PROVIDER=vynfy` | required whenever provider is vynfy | **Yes** | May need NCA/provider approval. **Requires external provider action** |
| `PUSH_PROVIDER` | Soft | `fcm` \| `fcm-legacy` \| empty | **Yes** → `fcm` if push in pilot | Empty → prod fail-closed on push send. **Confirmed in code** |
| `PUSH_API_KEY` | Soft | legacy only with `fcm-legacy` | Avoid for staging | Deprecated path. **Confirmed in code** |
| `FCM_PROJECT_ID` | Soft / conditional | required for HTTP v1 adapter | **Yes** if push | **Confirmed in code** / **Requires external provider action** |
| `FCM_SERVICE_ACCOUNT_FILE` | Soft / conditional | filesystem path to JSON | **Yes** if push | Mount file; never commit. **Confirmed in code** |
| `NOTIFICATION_OUTBOX_MAX_ATTEMPTS` | Soft | default `5` | Optional | **Confirmed in code** |
| `NOTIFICATION_OUTBOX_POLL_MS` | Soft | default `3000` | Optional | **Confirmed in code** |
| `NOTIFICATION_STALE_PROCESSING_MS` | Soft | default `120000` | Optional | **Confirmed in code** |
| `MAPS_PROVIDER` | Soft | default `""` | Optional / TBD | Stub-oriented; not a pilot blocker for core booking if maps elsewhere. **Confirmed in code** |
| `MAPS_API_KEY` | Soft | default `""` | Optional / TBD | **Confirmed in code** |
| `LOG_LEVEL` | Soft | pino levels; default `info` | Optional | **Confirmed in code** |
| `TRUST_PROXY` | **Yes for staging behind Nginx** | `false` \| hop 1–5 \| CIDRs; bare `true` rejected | **Yes** → typically `1` after hop verify | Prod rejects bare `false` unless `TRUST_PROXY_DIRECT`. **Confirmed in code** / **Requires live verification** of hop count |
| `TRUST_PROXY_DIRECT` | Soft | `true`/`false`; default false | **No** for Nginx topology | Escape hatch only. **Confirmed in code** |
| `RATE_LIMIT_WINDOW_MS` | Soft | default `900000` | Optional | General API. **Confirmed in code** |
| `RATE_LIMIT_MAX` | Soft | default `300` | Optional | **Confirmed in code** |
| `PAYSTACK_WEBHOOK_RATE_LIMIT_WINDOW_MS` | Soft | default `60000` | Optional | Isolated bucket. **Confirmed in code** |
| `PAYSTACK_WEBHOOK_RATE_LIMIT_MAX` | Soft | default `120` | Optional | **Confirmed in code** |
| `RIDER_GPS_RATE_LIMIT_WINDOW_MS` | Soft | default `60000` | Optional | Per authenticated user. **Confirmed in code** |
| `RIDER_GPS_RATE_LIMIT_MAX` | Soft | default `120` | Optional | **Confirmed in code** |

### Opt-in live verify env (scripts only — not app boot)

| Variable | Purpose | Classification |
| --- | --- | --- |
| `VYNFY_LIVE_VERIFY` | Must be `1` to run `scripts/verify-vynfy-sms.ts` | **Requires live verification** |
| `VYNFY_LIVE_TO` | Dedicated `+233…` test MSISDN | **Requires operator decision** |
| `FCM_LIVE_VERIFY` | Must be `1` to run `scripts/verify-fcm-http-v1.ts` | **Requires live verification** |
| `FCM_LIVE_DEVICE_TOKEN` | Dedicated test device token | **Requires operator decision** |
| `FCM_LIVE_PLATFORM` | `ANDROID` \| `IOS` | **Requires operator decision** |

### Missing / undocumented relative to staging ops

| Item | Finding |
| --- | --- |
| Staging hostname in `.env.example` | Not present — hostname is Nginx/DNS only. **Confirmed in code** (app does not need public hostname in env) |
| `PAYSTACK_PUBLIC_KEY` server usage | Parsed but unused by server modules. Clients may still need it. |
| Polygon / zone env vars | **None** — zones are DB entities via admin API. |
| Separate worker process env | **None** — workers are in-process. |
| `HOST=127.0.0.1` recommendation | Not in `.env.example`; operators should set for VPS. |

---

## 3. Matching configuration findings

### `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS`

| Question | Finding | Classification |
| --- | --- | --- |
| Where read | `env.ts` schema; `matching/offer-timeout.ts` → `requireOfferResponseTimeoutSeconds`; used by `matching/module.service.ts` when creating offers (`offerExpiresAt`) | **Confirmed in code** |
| Mandatory? | **Production boot:** yes (superRefine). **Dispatch:** yes — missing/≤0 throws `503 SERVICE_UNAVAILABLE` with message that matching is disabled until configured. Non-production boot allows unset, but dispatch still fails closed. | **Confirmed in code** |
| Accepted range | Zod: coerce to **positive integer** (no explicit upper bound). `Math.trunc` applied at require-time. | **Confirmed in code** |
| Missing / invalid | Boot fail in production; runtime 503 on dispatch otherwise | **Confirmed in code** |
| Product value | **Not selected in this audit** | **Requires operator decision** |

### Other matching settings (constants — not env)

From `backend/src/config/constants.ts` (**Confirmed in code**):

| Constant | Value | Configurable via env? |
| --- | --- | --- |
| `MATCHING_RADIUS_METERS` | `5000` | **No** |
| `MATCHING_BATCH_SIZE` | `3` | **No** |
| `RIDER_LOCATION_MAX_AGE_MS` | `30000` | **No** (GPS freshness — must not be reused as offer timeout) |
| `LOCATION_CLOCK_SKEW_MS` | `2000` | **No** |
| `BOOKING_SEARCH_TIMEOUT_MS` | `5 * 60 * 1000` | **No** |
| `BOOKING_PAYMENT_TIMEOUT_MS` | `10 * 60 * 1000` | **No** |
| Matching worker interval | `5000` ms (hardcoded in `jobs/matching-workers.ts`) | **No** |

---

## 4. Zone configuration requirements

Source: `service-zones/zone-geometry.ts`, `module.schema.ts`, `module.service.ts`, `bookings/module.repository.ts`.

### GeoJSON structure (**Confirmed in code**)

- Types: **`Polygon`** or **`MultiPolygon`** only (Point/LineString rejected).  
- Positions: **`[longitude, latitude]`** (GeoJSON order).  
- Exterior ring: ≥ 4 positions, closed (first === last), ≥ 3 distinct vertices.  
- Holes: additional rings allowed; point-in-polygon treats holes as exterior exclusions.  
- Longitude ∈ [-180, 180]; latitude ∈ [-90, 90].  
- Bounding box computed from all rings for candidate filtering.

### Multipolygons

**Supported** — validated and stored. **Confirmed in code**.

### Overlapping zones

- **No create-time overlap rejection** in geometry or service layer.  
- Pickup resolution: load all **active** zones whose bbox contains the point; return the **first** polygon hit in iteration order.  
- Overlaps are therefore **allowed by code** but **ambiguous for product**.  
  **Confirmed in code** / **Requires operator decision** (keep pilot to a single active zone).

### Rider zone approval (**Confirmed in code**)

1. Admin assigns rider to an **active** zone → approval `PENDING`.  
2. Separate admin **approve** → `APPROVED` (cannot approve inactive zone; rider cannot self-approve).  
3. Reject / revoke with reason.  
4. Matching eligibility depends on approved zone membership + fresh GPS (see matching module).

### Pilot without an active zone?

**No.** Booking create calls `findActiveZoneCoveringPickup`; if none → `409` *“Pickup is outside the active service area”*.  
`assertPickupSupported` remains **not implemented** (throws not-implemented) — booking path uses repository geometry instead.  
**Confirmed in code**. Ahenema Kokoben coordinates are **not in repo** — **Requires operator decision** to supply verified GeoJSON; do not invent.

### Activation

- Create defaults to **inactive** unless `activate: true`.  
- Separate activate/deactivate endpoints; activate re-validates stored boundary.  
**Confirmed in code**.

---

## 5. External service verification checklist

### Paystack

| Aspect | Status |
| --- | --- |
| Code | HMAC webhook verify; initialize/charge/refund client; secret required in production boot | **Confirmed in code** |
| Config | `PAYSTACK_SECRET_KEY` (required prod); `PAYSTACK_PUBLIC_KEY` optional/unused server-side | **Confirmed in code** |
| Staging need | Paystack **test** secret; webhook URL `https://cyrloride.eqostack.com/api/v1/payments/paystack/webhook` | **Requires external provider action** |
| Live proof | Charge + webhook signature + duplicate delivery; refund path for authorized refunds | **Requires live verification** |
| Not verified | This audit did not call Paystack | — |

### Vynfy SMS

| Aspect | Status |
| --- | --- |
| Code | `VynfySmsProvider`; factory when `SMS_PROVIDER=vynfy`; readiness via `/health/ready` | **Confirmed in code** |
| Config | `VYNFY_API_KEY`, `VYNFY_SENDER_ID` | **Confirmed in code** |
| Opt-in script | `backend/scripts/verify-vynfy-sms.ts` (`VYNFY_LIVE_VERIFY=1`, `VYNFY_LIVE_TO`) — API acceptance ≠ handset delivery | **Confirmed in code** |
| Sender ID | May require Vynfy/NCA approval on Ghana networks | **Requires external provider action** |
| Live proof | Script success **and** handset receipt on MTN/Telecel/AT | **Requires live verification** |
| Not verified | Live send not executed in this audit | — |

### Firebase Cloud Messaging

| Aspect | Status |
| --- | --- |
| Code | FCM HTTP v1 via service account; iOS via FCM APNs bridge; legacy path deprecated | **Confirmed in code** |
| Config | `PUSH_PROVIDER=fcm`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_FILE` | **Confirmed in code** |
| Opt-in script | `backend/scripts/verify-fcm-http-v1.ts` | **Confirmed in code** |
| Live proof | Provider accept + device notification receipt | **Requires live verification** |
| Not verified | — | — |

### Cloudflare R2

| Aspect | Status |
| --- | --- |
| Code | S3-compatible client; incomplete config → fail-closed upload/download | **Confirmed in code** |
| Config | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, TTL | **Confirmed in code** |
| Upload limit | Multer memory: `MAX_DOCUMENT_BYTES` = **8 MiB**; MIME jpeg/png/webp/pdf; 1 file | **Confirmed in code** |
| Live proof | Presign + put + get for rider docs | **Requires live verification** / **Requires external provider action** (staging bucket) |

---

## 6. Staging deployment requirements

**Target (ops intent):** one API instance, Nginx TLS termination, upstream `127.0.0.1:3020`, host `cyrloride.eqostack.com`. Do not modify existing `cirlo` / `eqostack` / `homedecor` site files beyond adding a **new** vhost.

### Process model (**Confirmed in code**)

| Item | Requirement |
| --- | --- |
| Entry | `npm run start` → `node dist/server.js` (after `build` + `prisma migrate deploy` + `generate`) |
| Node | `engines.node` ≥ 20 |
| Workers | In-process timers: unpaid expiry **30s**, matching **5s**, refunds **10s**, notification outbox env-tuned (~3s) — **no separate worker binaries** |
| Instances | Prefer **single** instance initially (matching timers + in-memory rate limits) |
| Shutdown | `SIGINT`/`SIGTERM` → close HTTP → close Socket.IO → `prisma.$disconnect`; 10s force exit |

### Bind / proxy (**Confirmed in code** + **Requires operator decision**)

| Item | Requirement |
| --- | --- |
| `HOST` | Prefer `127.0.0.1` so only Nginx reaches the app |
| `PORT` | `3020` |
| `TRUST_PROXY` | Explicit hop (likely `1`) after confirming Nginx → Node hop count |
| JSON body | `1mb` limit; raw body retained for Paystack signature |
| Health | `GET /api/v1/health` — liveness (no DB) |
| Ready | `GET /api/v1/health/ready` — DB `SELECT 1` + SMS/push adapter **describe** (not live send) |
| Socket.IO | Same HTTP server; JWT in `handshake.auth.token`; CORS from `CORS_ORIGINS` |
| Docs upload | Memory multer; Nginx `client_max_body_size` must exceed document max |

### Database (**Confirmed in code** / prior VPS inventory)

| Item | Requirement |
| --- | --- |
| Name | Staging twin e.g. `cyrlo_ride_app_staging` |
| Role | Restricted non-superuser; no grants on Cirlo/EQO DBs |
| Migrations | `npx prisma migrate deploy` including `20261107150000_phase_13a_refund_authorization` |

### TLS / DNS

| Item | Status |
| --- | --- |
| DNS `cyrloride.eqostack.com` | Previously resolved to VPS — re-check at deploy time | **Requires live verification** |
| Certificate | None for this hostname at last inspection — Certbot issue needed | **Requires external provider action** / ops |
| Maps host `api.cyrlomap.eqostack.com` | Out of scope for Ride API; no Maps process found previously | Separate workstream |

---

## 7. Blockers and unresolved decisions

| # | Item | Classification | Blocks |
| --- | --- | --- | --- |
| 1 | Product value for `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` | **Requires operator decision** | Matching dispatch / production boot |
| 2 | Verified Ahenema Kokoben (or pilot) GeoJSON + activate zone | **Requires operator decision** | Real bookings in pilot area |
| 3 | Whether multiple overlapping active zones are allowed | **Requires operator decision** | Ambiguous pickup zone selection |
| 4 | Generate unique staging secrets (JWT, OTP hash, MFA, identity) | **Requires operator decision** | Secure staging boot |
| 5 | Vynfy account, API key, sender ID approval, credits | **Requires external provider action** | Real OTP |
| 6 | Vynfy live API + handset delivery on Ghana networks | **Requires live verification** | OTP pilot claim |
| 7 | Paystack test keys + webhook registration | **Requires external provider action** | Fee payment |
| 8 | Paystack charge/webhook/refund E2E | **Requires live verification** | Paid booking path |
| 9 | FCM project + service-account file mount | **Requires external provider action** | Push |
| 10 | FCM live device receipt | **Requires live verification** | Push pilot claim |
| 11 | R2 staging bucket + keys | **Requires external provider action** | Rider document upload |
| 12 | R2 upload/download proof | **Requires live verification** | Onboarding docs |
| 13 | Confirm `TRUST_PROXY` hop count on this VPS | **Requires live verification** | Correct client IP / rate limits |
| 14 | CORS origins for any browser admin/web clients | **Requires operator decision** | Browser clients |
| 15 | Single-instance policy vs future scale-out | **Requires operator decision** | Matching/rate-limit correctness |
| 16 | Phase 14D VPS create dir/DB/systemd/Nginx | Ops execution (out of this audit) | Staging traffic |

**Not blockers for “config audit complete” but still open product/ops items from Phase 12 docs:** polygon topology hardening (self-intersection), Paystack pending poll worker, etc. — track separately; do not invent policy in 13D.

---

## 8. Recommended implementation order

1. **Freeze operator decisions:** offer timeout seconds; single-zone pilot rule; CORS list; bind `127.0.0.1:3020`.  
2. **Provision staging secrets offline** (never commit): JWT pair, OTP hash, MFA + identity keys, Paystack test secret, Vynfy key/sender, R2, FCM file path.  
3. **Create staging Postgres DB + role**; migrate with `prisma migrate deploy` only against that URL.  
4. **Obtain / validate pilot GeoJSON** from ops GIS source; create zone via admin API **inactive**; peer-review geometry; **activate** only after review.  
5. **Assign and approve** pilot riders for that zone.  
6. **Wire Vynfy** → run opt-in verify script → confirm handset delivery → only then enable passenger OTP traffic.  
7. **Wire Paystack test** → point webhook at staging host → charge + duplicate webhook test.  
8. **Wire R2 staging bucket** → document upload/download smoke.  
9. **Wire FCM** (if push in pilot) → opt-in verify script + device receipt.  
10. **Deploy process** (Phase 14D): artifact at `/var/www/cyrlo-ride-api`, systemd unit, Nginx **new** server block, Certbot, health/ready checks, confirm Cirlo/EQO untouched.  
11. **Verify `TRUST_PROXY`** with a known client IP observation.  
12. **Pilot smoke:** OTP → create booking inside zone → pay → SEARCHING → offer → accept.

Do not mark SMS, Paystack, FCM, or R2 as “ready” until the corresponding **live verification** rows above pass.

---

## 9. Audit constraints (meta)

- No files outside this report were modified for Phase 13D.  
- No secrets generated, no migrations run, no VPS changes, no external API calls.  
- External integrations classified **unverified** despite code readiness.
