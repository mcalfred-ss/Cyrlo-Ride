# Cyrlo Ride — Phase 13B: Vynfy SMS Provider Integration

**Date:** 2026-11-07  
**Scope:** Wire Vynfy as the production SMS transport for the existing OTP authentication system.  
**Database:** no schema or migration changes.  
**Predecessor gap:** Phase 12 P12-A-001 (no SMS vendor adapter).

---

## 1. Existing architecture inspected

| Area | Location | Finding |
| --- | --- | --- |
| SMS interface | `infrastructure/sms/sms.provider.ts` | `SmsProvider.send({ to, body })`; factory fail-closed / development stubs |
| Unsupported adapter | `UnsupportedSmsProvider` | Credentials without a registered adapter → `ready=false`, send throws 503 |
| OTP ownership | `auth/module.service.ts` | Generates code, HMAC hash, create challenge, then `sms.send` |
| HMAC / expiry / attempts | `common/security/otp.ts`, auth repository/store | TTL 300s, max 5 attempts, resend cooldown 60s |
| Phone validation | `common/schemas/phone.ts` | E.164 `+233XXXXXXXXX` |
| Config | `config/env.ts` | `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` (generic) |
| Readiness | `common/routes/health.routes.ts` | Exposes adapter name + ready flag only (no secrets) |
| Logging | `config/logger.ts` | Redacts `*.otp` / `*.code` |

Cyrlo Ride continues to own OTP generation and verification. Vynfy is transport only — **not** Vynfy’s `/otp/v1/generate` API.

---

## 2. Vynfy API contract used

Verified from official developer docs: https://www.vynfy.com/developers

```
POST https://sms.vynfy.com/api/v1/send
Headers:
  X-API-Key: <api key>
  Content-Type: application/json
Body:
  {
    "sender": "<sender id>",
    "recipients": ["233XXXXXXXXX"],
    "message": "<text>"
  }
```

**Not used (and not assumed):**

- Vynfy OTP generate/verify endpoints
- Alternate marketing sample on `/products-bulk-sms` (`api.vynfy.com` + Bearer) — conflicts with the developers page; ignored
- Undocumented response field names, idempotency keys, or error codes
- Automatic delivery confirmation from HTTP 200

**Delivery reports:** marketing copy mentions webhooks / receipts (`sent`, `delivered`, `failed`, `pending`). No webhook request schema was published on the developers page at implementation time. Receipts should be integrated in a later milestone after Vynfy supplies a concrete contract — do not invent one.

---

## 3. Adapter implementation

| Piece | Path |
| --- | --- |
| Provider | `backend/src/infrastructure/sms/vynfy-sms.provider.ts` |
| Factory registration | `SUPPORTED_SMS_PROVIDERS = ['vynfy']` |
| Env mapping | `smsOptionsFromEnv()` → uses `VYNFY_*` when `SMS_PROVIDER=vynfy` |

Behaviour:

- HTTPS POST to the fixed documented endpoint
- `X-API-Key` header (never logged / never returned)
- Ghana numbers normalized `+233…` → `233…`
- Local validation of destination + message before HTTP
- 10s AbortController timeout
- Non-2xx → fail closed (`SERVICE_UNAVAILABLE` / `RATE_LIMITED`)
- Timeout / network → fail closed; timeout message states delivery is **ambiguous** (no blind retry in the adapter)
- 2xx → API **acceptance** only; logs `deliveryConfirmed: false`
- Malformed JSON on 2xx still treated as acceptance (response schema undocumented)

---

## 4. Configuration variables

| Variable | Role |
| --- | --- |
| `SMS_PROVIDER=vynfy` | Selects the Vynfy adapter (distinct from `PUSH_PROVIDER`) |
| `VYNFY_API_KEY` | API key — required when Vynfy selected; never commit |
| `VYNFY_SENDER_ID` | Sender / brand string — required when Vynfy selected |
| `SMS_API_KEY` / `SMS_SENDER_ID` | Retained for non-Vynfy / legacy placeholders; unused when provider is `vynfy` |

Startup validation (`loadEnv`): if `SMS_PROVIDER=vynfy`, both `VYNFY_API_KEY` and `VYNFY_SENDER_ID` must be non-empty. Production also rejects placeholder-pattern keys.

Local default remains empty `SMS_PROVIDER` → `DevelopmentSmsProvider` (safe no-op). Production without credentials → `UnconfiguredSmsProvider` (fail closed). Selecting `vynfy` never silently falls back to development.

---

## 5. Phone-number normalization

Auth already requires `+233` + 9 digits. The adapter:

1. Accepts E.164 `+233XXXXXXXXX`
2. Strips `+` for the documented `recipients` array form `233XXXXXXXXX`
3. Rejects non-Ghana / malformed numbers before any network call

---

## 6. Failure and retry handling

- OTP challenge is created **before** SMS send (existing behaviour). Failed send surfaces as an error to the client; resend cooldown still applies.
- Adapter does **not** retry HTTP calls (avoids duplicate SMS charges on ambiguous timeouts).
- Existing OTP resend cooldown (60s), attempt limit (5), expiry (300s), and replay prevention unchanged.
- Successful OTP verification remains the only path to session issuance.

---

## 7. Security considerations

- API key only in server env / secret store — never Flutter, never readiness payload, never exception messages
- OTP plaintext is not written to development send records, audit metadata, or adapter success logs (masked phone only)
- Logger redact paths extended for `x-api-key`, `apiKey`, `VYNFY_API_KEY`, `SMS_API_KEY`
- Cyrlo Ride HMAC OTP storage unchanged

---

## 8. Tests added

| File | Coverage |
| --- | --- |
| `vynfy-sms.provider.test.ts` | Success payload/headers, sender, normalization, invalid phone/message, missing key/sender, 401, rejection, 429, 5xx, timeout, malformed 2xx body, no secret/OTP leakage, factory wiring |
| `env.vynfy.test.ts` | Startup validation for Vynfy credentials |
| `sms.provider.test.ts` | `vynfy` in supported registry |
| `auth/module.test.ts` | OTP request/verify/replay still works with mocked Vynfy transport |

All automated tests mock HTTP. No live SMS in `npm test`.

---

## 9. Live verification instructions

Script: `backend/scripts/verify-vynfy-sms.ts`

```bat
cd backend
set VYNFY_LIVE_VERIFY=1
set VYNFY_LIVE_TO=+233XXXXXXXXX
npx tsx scripts/verify-vynfy-sms.ts
```

Requires `VYNFY_API_KEY` and `VYNFY_SENDER_ID` in `.env`. Prints masked destination only. States that credits will be consumed. Reports API acceptance, not handset delivery.

**Do not claim production SMS readiness until this script succeeds and handset receipt is confirmed on target networks.**

---

## 10. Sender ID prerequisites

Custom sender IDs on Ghanaian networks typically require provider/NCA registration/approval. This milestone does **not** assume `VYNFY_SENDER_ID` is approved. Operators must confirm approval status with Vynfy before production OTP traffic. Until approved, messages may be rejected or rewritten by the provider.

---

## 11. Remaining production limitations

| Item | Status |
| --- | --- |
| Live API acceptance | Not executed in this milestone (opt-in script only) |
| Handset delivery on MTN / Telecel / AT | **Unverified** |
| Sender ID approval | **Operator must confirm** |
| Account credit balance | Operator must confirm sufficiency |
| Delivery receipt webhooks | Documented as a product feature; **no public webhook schema used** |
| Documented rate limits | Not published on developers page; adapter maps HTTP 429 generically |
| Response JSON schema | Undocumented; success = HTTP 2xx only |
| Vynfy OTP API | Intentionally unused |

---

## 12. Verification results (automated)

| Command | Result |
| --- | --- |
| `npm test` | **Pass** — 36 files / 206 tests |
| `npm run typecheck` | **Pass** |
| `npm run prisma:validate` | **Pass** |
| `npm run build` | **Pass** |

No migration. No live SMS executed by the agent.
