# Cyrlo Ride — Phase 11B: Security and Operational Hardening

**Date:** 2026-11-07  
**Scope:** Remediation of outstanding Milestone 11 audit findings for SMS adapter (C-2), `TRUST_PROXY`, and admin suspend / passenger acknowledgement.  
**Policy:** No new payment, refund, matching, token, booking, or notification business policies. Do not invent SMS vendor contracts or reverse-proxy topology.

---

## Exact original audit findings addressed

| Audit item | Original meaning (traced) | Outcome |
| --- | --- | --- |
| **C-2 — SMS named vendor not implemented** | Production OTP cannot send; credentials alone still yield an unwired / fail-closed adapter (`UnconfiguredSmsProvider` / no live vendor client). | Adapter contract hardened; registry remains empty until the **existing** vendor API contract is supplied. Documented as a **deployment blocker**. |
| **H-5 — `TRUST_PROXY` default false + rate limit behind reverse proxy** | Blind or missing proxy trust can starve webhook/OTP behind a reverse proxy, or (if set to bare `true`) allow spoofed `X-Forwarded-For`. | Explicit parse of hop count / CIDR list; bare `true` rejected at startup; rate limit uses Express-resolved `req.ip`. |
| **Admin suspend/reinstate not mounted** | Spec requires Operations/Super Admin suspend/reinstate with reason + audit; routes/service were absent. | `POST /admin/users/suspend` and `POST /admin/users/reinstate` mounted with RBAC, audit, session revoke, intent offline; **does not** terminate active trips or alter tokens. |
| **Passenger acknowledgement API absent** | Master spec §6 / §14: `POST /bookings/{id}/acknowledge` records acknowledgement and **does not change status**. | Implemented via nullable `passenger_acknowledged_at` + passenger-only route. |

### Acknowledgement finding interpretation

The audit label “suspend/ack” combines two distinct items:

1. **Admin suspend/reinstate** (account status / ops).
2. **Passenger completion acknowledgement** (booking field, not a status).

No separate “rider acknowledgement” workflow exists in the master specification. Only passenger completion acknowledgement is implemented. Master-spec note that whether suspension aborts an assigned trip remains listed as unresolved in §8 is **not** used to invent auto-termination; Phase 11B preserves the approved operational rule: suspension blocks new offers / online availability and **does not** automatically terminate `ACCEPTED` / `IN_PROGRESS` trips. Operations may still intervene through existing booking/dispute authorization paths when required.

---

## SMS provider and integration status

| Item | Status |
| --- | --- |
| Existing vendor identity in repo / `.env` | **Not present** (`SMS_PROVIDER` / `SMS_API_KEY` empty; no SDK, endpoint, or payload documented) |
| Named adapters registered | **None** (`SUPPORTED_SMS_PROVIDERS = []`) |
| Production without credentials | `UnconfiguredSmsProvider` — send throws `503 SERVICE_UNAVAILABLE` (fail closed) |
| Credentials for unknown/unwired name | `UnsupportedSmsProvider` — configured but `ready=false`; send fails closed (never marks delivery success) |
| Non-production without credentials | `DevelopmentSmsProvider` — accepts send; stores body as `[redacted]`; never logs OTP |
| OTP storage | Unchanged HMAC-only (`hashOtpCode`) |
| OTP expiry / attempts / resend / replay / rate limits | Unchanged (Milestones 1 / 11) |
| OTP in responses | Production never returns codes; `OTP_DEV_EXPOSE_CODE` still hard-disabled in production |
| OTP in outbox / notification history | Auth OTP uses direct `SmsProvider.send`, not the notification outbox; outbox sanitize blocks `otp` / `code` keys |

### Required production secrets (values never committed)

- `SMS_PROVIDER` — vendor key matching a **wired** adapter once supplied  
- `SMS_API_KEY` — server-side credential  
- `SMS_SENDER_ID` — optional sender / from id (default `Cyrlo`)

### Deployment blocker

Wire the existing SMS vendor’s verified API contract into `sms.provider.ts` and register it in `SUPPORTED_SMS_PROVIDERS`. Until then, production OTP cannot deliver even if credentials are set.

---

## `TRUST_PROXY` configuration and behavior

| Value | Behavior |
| --- | --- |
| `false` / `0` / empty (default) | Do not trust `X-Forwarded-*`. Local/dev predictable. Spoofed headers ignored. |
| Integer `1`–`5` | Trust that many proxy hops (Express hop count). |
| Comma-separated IPs/CIDRs (`loopback`, `uniquelocal`, etc.) | Explicit trusted proxy list. |
| `true` | **Rejected at startup** — never maps to Express `trust proxy = true`. |

Rate limiting (`apiRateLimiter`, `otpRateLimiter`) keys on `req.ip` after Express resolution. Readiness exposes effective setting under `trustProxy` (no secrets).

### Verified vs unknown infrastructure

- **Verified in code:** parsing rules, startup validation, Express `req.ip` behavior with hop count vs off, rate-limit key generator.  
- **Not verified in this phase:** production VPS / Nginx / DNS topology. Do **not** invent hop counts for live deploy; set `TRUST_PROXY` only after ops confirms the reverse-proxy chain. This phase does not modify VPS, Nginx, or DNS.

---

## Suspension and active-trip behavior

| Rule | Enforcement |
| --- | --- |
| Suspended rider ineligible for new offers | Matching / accept eligibility require `userStatus === ACTIVE` |
| Cannot go online while suspended | Rider availability service already rejects suspended accounts |
| Cannot accept pending offer | `acceptOffer` re-evaluates matching eligibility |
| Suspension does not terminate active trip | Suspend sets `users.status=SUSPENDED`, forces rider intent `OFFLINE`, leaves `ACCEPTED`/`IN_PROGRESS` bookings unchanged |
| No token / historical booking rewrite | Wallet balance and booking rows untouched |
| RBAC | `Permission.SuspendReinstateRiders` — Operations Admin + Super Admin |
| Mandatory reason + audit | Body `reason` (2–200 chars); audit `admin.user.suspended` / `admin.user.reinstated` with actor id |
| Sessions | All refresh sessions revoked on suspend |
| Notify | In-app/push outbox enqueue (no OTP, no location) when Prisma is available |
| Admins | Cannot suspend admin users via this path (use grant revoke) |

Passenger acknowledge: `POST /bookings/:bookingId/acknowledge` — only `COMPLETED` bookings; sets `passengerAcknowledgedAt` once; status unchanged.

---

## RBAC and audit changes

- Routes: `POST /admin/users/suspend`, `POST /admin/users/reinstate` behind `authenticate` + `requireActiveAccount` + `requirePermission(SuspendReinstateRiders)`.  
- Audit actions: `admin.user.suspended`, `admin.user.reinstated`, `booking.passenger_acknowledged`.  
- No permission catalog additions (permission already existed).

---

## Files created and modified

### Created

- `backend/src/config/trust-proxy.ts` (earlier in phase) + `trust-proxy.test.ts`, `env.trust-proxy.test.ts`
- `backend/src/infrastructure/sms/sms.provider.test.ts`
- `backend/src/modules/admin/suspend.test.ts`, `suspend.db.test.ts`
- `backend/prisma/migrations/20261107140000_phase_11b_passenger_ack/migration.sql`
- `docs/architecture/SECURITY_OPERATIONS_PHASE_11B.md`

### Modified (representative)

- `backend/src/infrastructure/sms/sms.provider.ts` — fail-closed / unsupported / health describe  
- `backend/src/config/env.ts`, `backend/.env.example` — `TRUST_PROXY` parse + docs  
- `backend/src/app.ts`, `backend/src/common/middleware/rate-limit.ts`, `backend/src/common/routes/health.routes.ts`  
- `backend/src/modules/admin/*` — suspend/reinstate store, service, controller, routes  
- `backend/src/modules/bookings/*` — passenger acknowledge  
- `backend/prisma/schema.prisma` — `passenger_acknowledged_at`  
- `docs/architecture/PRODUCTION_DEPLOYMENT_CHECKLIST.md` — SMS blocker + TRUST_PROXY guidance  

---

## Tests and typecheck

Run from `backend/`:

```bash
npx prisma migrate deploy
npm run typecheck
npm test
```

**Results (2026-11-07):** `npx prisma migrate deploy` applied `20261107140000_phase_11b_passenger_ack`; `npm run typecheck` clean; `npm test` — **32 files / 154 tests passed**.

Coverage added for: SMS fail-closed / no OTP in send record; TRUST_PROXY parse + Express IP spoof/trust + startup rejection; suspend RBAC/audit/active-trip/token invariance (memory + Postgres); matching exclusion of suspended riders.

---

## Migration status

| Migration | Database | Purpose |
| --- | --- | --- |
| `20261107140000_phase_11b_passenger_ack` | `cyrlo_ride_app` only | Nullable `bookings.passenger_acknowledged_at` |

Never applied to legacy `cyrlo_ride`. No financial table changes.

---

## Remaining external configuration and production blockers

1. **SMS vendor adapter** — supply existing vendor HTTP contract; register adapter; set production secrets.  
2. **`TRUST_PROXY`** — set hop count or CIDRs only after reverse-proxy topology is verified by ops.  
3. Paystack live keys, R2, identity/MFA keys, offer timeout, zone polygons, Super Admin bootstrap (unchanged from M11 checklist).  
4. FCM HTTP v1 — explicitly **out of scope** for 11B.  
5. Automatic trip termination on suspension — **not implemented**; still a product-owner decision if master-spec §8 unresolved language is revisited.
