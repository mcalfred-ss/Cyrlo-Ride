# Cyrlo Ride — Phase 13C: Security Configuration Hardening

**Date:** 2026-11-07  
**Scope:** Rate-limit isolation (Paystack webhook + rider GPS), production `TRUST_PROXY` requirements, production encryption-key validation.  
**Predecessor:** `PHASE_12_BACKEND_PRODUCTION_READINESS_AUDIT.md` findings P12-E-003, P12-F-003, P12-L-002, P12-C-002.  
**Not in scope:** VPS deploy, key rotation, OTP/Vynfy/refund/matching changes, Flutter.

---

## 1. Original Phase 12 findings (verified still present)

| ID | Finding | Pre-13C behaviour |
| --- | --- | --- |
| P12-F-003 | Paystack webhook behind global IP rate limiter | `app.ts` applied `apiRateLimiter` to all `/api/v1/*` except `/health` |
| P12-E-003 | Authenticated GPS under global IP rate limit | `POST /locations/rider` shared `RATE_LIMIT_MAX` (default 300 / 15 min) |
| P12-L-002 | `TRUST_PROXY` default `false` behind reverse proxy | Valid parse rejecting bare `true`, but production could boot with `false` → collapsed `req.ip` |
| P12-C-002 | Example MFA/identity keys accepted in production | `.env.example` all-zero / `0x02` keys; length check only |

---

## 2. Root causes

1. **Single shared bucket** — one Express rate limiter for all non-health API traffic.
2. **No production fail-closed for proxy trust** — local-safe default (`false`) was also a valid production boot value.
3. **Placeholder refine incomplete** — JWT/OTP placeholders rejected; AES example keys were not.

---

## 3. Changes made

### Rate limiting
- Skip general `apiRateLimiter` for `POST /payments/paystack/webhook` and `POST /locations/rider`.
- Mount `paystackWebhookRateLimiter` on the webhook route (IP-keyed; signature verification unchanged).
- Mount `riderGpsRateLimiter` **after** rider auth on GPS update (per `req.auth.sub`).
- New env knobs with independent windows/limits.

### TRUST_PROXY
- Preserve strict parser (reject bare `true`, hop 1–5, CIDRs).
- Production: require hop/CIDR unless `TRUST_PROXY_DIRECT=true` (intentional no-proxy).
- Local/dev: `TRUST_PROXY=false` remains default and safe.

### Encryption keys
- `encryption-keys.ts` rejects missing / bad base64 / wrong length always.
- Production also rejects published example keys and low-entropy material.
- MFA vs identity keys must remain distinct (existing rule).
- Error messages never include key material.
- No generation/rotation of production keys at startup.

---

## 4. Rate-limit architecture

| Limiter | Scope | Default | Key |
| --- | --- | --- | --- |
| `apiRateLimiter` | All `/api/v1/*` except health, webhook, GPS POST | 300 / 15 min | Resolved `req.ip` |
| `otpRateLimiter` | Auth/admin OTP routes (unchanged) | 10 / 15 min | Resolved `req.ip` |
| `paystackWebhookRateLimiter` | `POST /payments/paystack/webhook` | 120 / 60 s | Resolved `req.ip` |
| `riderGpsRateLimiter` | `POST /locations/rider` after auth | 120 / 60 s | `gps:user:<sub>` |

**Reasoning**
- Webhook bursts must not exhaust passenger/rider API budget (and vice versa).
- GPS is high-frequency; per-user key avoids carrier-NAT collisions; auth still required.
- Webhook remains public + HMAC; limiter only bounds abuse volume.

---

## 5. Production TRUST_PROXY requirements

| Environment | Expected |
| --- | --- |
| Local / test | `TRUST_PROXY=false` (ignore `X-Forwarded-For`) |
| Production behind reverse proxy | Explicit hop count (often `1`) **or** trusted proxy CIDRs — **confirm VPS Nginx hop count before setting** |
| Production direct exposure (rare) | `TRUST_PROXY=false` **and** `TRUST_PROXY_DIRECT=true` |

**Assumptions to confirm at VPS deploy (not guessed here)**
- Whether Nginx (or another proxy) terminates TLS in front of Node.
- Exact hop count from client → proxy → app (usually `1` for single Nginx).
- Whether additional CDN/load-balancer hops exist (would raise hop count or require CIDR allowlist).

Bare `TRUST_PROXY=true` remains rejected.

---

## 6. Encryption-key validation rules

| Rule | When |
| --- | --- |
| Required, base64, exactly 32 decoded bytes | Always |
| MFA key ≠ identity key | Always |
| Reject published `.env.example` keys | Production |
| Reject all-identical / very low-entropy material | Production |
| Do not auto-generate or rotate | Always |

Keys: `ADMIN_MFA_ENCRYPTION_KEY`, `IDENTITY_ENCRYPTION_KEY` (AES-256-GCM via `secret-box.ts`).

---

## 7. Environment variables

| Variable | Notes |
| --- | --- |
| `TRUST_PROXY` | `false` \| `1`–`5` \| CIDR list |
| `TRUST_PROXY_DIRECT` | `true` only to allow false in production |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | General API |
| `PAYSTACK_WEBHOOK_RATE_LIMIT_WINDOW_MS` / `_MAX` | Webhook bucket |
| `RIDER_GPS_RATE_LIMIT_WINDOW_MS` / `_MAX` | GPS bucket |
| `ADMIN_MFA_ENCRYPTION_KEY` | 32-byte base64; unique |
| `IDENTITY_ENCRYPTION_KEY` | 32-byte base64; unique from MFA |

---

## 8. Tests and verification

| Suite | Coverage |
| --- | --- |
| `rate-limit.isolation.test.ts` | Path isolation, webhook vs general, GPS vs general, auth gate, XFF spoofing on/off |
| `trust-proxy.test.ts` | Parser + Express IP resolution (existing, retained) |
| `env.security.test.ts` | Production TRUST_PROXY / DIRECT / encryption keys |
| `encryption-keys.test.ts` | Example/weak/length inspectors |

Commands (from `backend/`):

| Command | Result |
| --- | --- |
| `npm test` | **Pass** — 39 files / 229 tests |
| `npm run typecheck` | **Pass** |
| `npm run build` | **Pass** |
| `npm run prisma:validate` | **Pass** |

No migrations. No live payment/SMS/push.

---

## 9. Remaining VPS deployment assumptions

- Confirm reverse-proxy hop count / CIDRs before setting production `TRUST_PROXY`.
- Replace example encryption keys with unique random 32-byte values **before** any production ciphertext is written (rotation of existing ciphertext is a separate milestone).
- Tune webhook/GPS limits under real Paystack + rider client cadence.
- Unrelated Phase 12 items (MFA lockout, pending-charge poll, etc.) remain open.
