# Cyrlo Ride — Milestone 1: OTP authentication and refresh sessions

## Endpoints

Base path: `/api/v1` (see `API_PREFIX`).

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| POST | `/auth/otp` | public | `{ "phoneNumber": "+233244123456" }` |
| POST | `/auth/otp/verify` | public | `{ "phoneNumber", "code", "role": "PASSENGER" \| "RIDER" }` |
| POST | `/auth/refresh` | public | `{ "refreshToken": "..." }` |
| POST | `/auth/logout` | Bearer + active account | `{ "refreshToken": "..." }` |
| GET | `/users/me` | Bearer + active account | — |

### Request OTP

```http
POST /api/v1/auth/otp
Content-Type: application/json

{ "phoneNumber": "+233244123456" }
```

Success:

```json
{
  "success": true,
  "data": {
    "expiresIn": 300,
    "resendAfter": 60
  }
}
```

When `OTP_DEV_EXPOSE_CODE=true` and `NODE_ENV` is not `production`, `data.developmentCode` may also be present. Production never exposes the code.

### Verify OTP

```json
{
  "success": true,
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>",
    "expiresIn": 900,
    "user": {
      "id": "<uuid>",
      "phoneNumber": "+233244123456",
      "role": "PASSENGER",
      "status": "ACTIVE",
      "displayName": null
    }
  }
}
```

First success creates the user plus an empty passenger profile, or a rider profile in `DRAFT`. The same phone with the other role returns `409 CONFLICT`.

### Refresh

Returns a new `accessToken`, rotated `refreshToken`, and `expiresIn`. The previous refresh token is revoked. Reuse of a revoked token revokes the entire token family.

### Logout

Requires a valid access token. Revokes the presented refresh token for that user. Response: `{ "revoked": true }` (or `false` if already absent).

## OTP lifecycle

1. Client requests OTP for a Ghana E.164 phone (`+233` + 9 digits).
2. Server generates a 6-digit code with `crypto.randomInt`, stores only `HMAC-SHA256(code, OTP_HASH_SECRET)`, invalidates prior open challenges for that phone, and sends SMS.
3. TTL: `OTP_TTL_SECONDS` (default 300). Max attempts: 5. Resend cooldown: 60 seconds.
4. Verify compares HMAC with timing-safe equality, consumes the challenge in a serializable transaction, then creates/loads the user and issues tokens.
5. Replay, expiry, exhaustion, and concurrent verify races are rejected.

Anti-enumeration: OTP request does not reveal whether the phone already has an account.

## JWT claims and configuration

- Algorithm pinned to **HS256** (`algorithms: ['HS256']` on verify). Client `alg` is never trusted.
- Claims: `sub` (user id), `role` (server-assigned), `iss`, `aud`, `exp`, `iat`.
- Lifetime: `JWT_ACCESS_TTL_SECONDS` (default 900 = 15 minutes).
- Secrets: `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (must differ). Production rejects `change-me` / `development-only` placeholders.
- Issuer / audience: `JWT_ISSUER`, `JWT_AUDIENCE`.

## Refresh-token rotation

- Opaque 32-byte base64url token. Only `HMAC-SHA256(token, JWT_REFRESH_SECRET)` is stored.
- Lifetime: `JWT_REFRESH_TTL_SECONDS` (default 30 days).
- Each session belongs to a `family_id`. Rotation revokes the presented row and inserts a new hash in the same family inside one transaction (`SELECT … FOR UPDATE` + serializable isolation).
- Reuse of a revoked token revokes all active rows in that family.
- Hashes are never returned to clients.

## Session revocation

- Logout revokes the current refresh row for the authenticated user.
- Suspended accounts cannot refresh or call active-account routes.
- Access tokens are not server-revoked; short TTL bounds the window. Status is re-checked on protected routes via `requireActiveAccount`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `JWT_ACCESS_SECRET` | HS256 signing key for access tokens |
| `JWT_REFRESH_SECRET` | HMAC key for refresh-token hashes |
| `JWT_ACCESS_TTL_SECONDS` | Access TTL (default 900) |
| `JWT_REFRESH_TTL_SECONDS` | Refresh TTL (default 2592000) |
| `JWT_ISSUER` / `JWT_AUDIENCE` | JWT iss/aud |
| `OTP_HASH_SECRET` | HMAC key for OTP codes |
| `OTP_TTL_SECONDS` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN_SECONDS` | OTP policy |
| `OTP_DEV_EXPOSE_CODE` | Dev-only code echo (`false` in production effectively) |
| `OTP_RATE_LIMIT_WINDOW_MS` / `OTP_RATE_LIMIT_MAX` | Per-IP OTP route limiter |
| `SMS_PROVIDER` / `SMS_API_KEY` / `SMS_SENDER_ID` | SMS vendor (unset → dev no-op / prod fail-closed) |

## Local testing

1. Copy `backend/.env.example` to `backend/.env`.
2. For local OTP without SMS: leave `SMS_PROVIDER` empty and set `OTP_DEV_EXPOSE_CODE=true` (never in production).
3. Apply migrations: `npx prisma migrate deploy` (or `prisma migrate dev`).
4. Run API: `npm run dev`.
5. Run tests: `npm test` (auth unit tests use an in-memory store; no production credentials).

## Security assumptions

- Phone uniqueness is global; one phone is either passenger or rider, not both.
- Mobile OTP never creates `ADMIN` or future staff grants (`SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `SUPPORT_ADMIN`).
- Current Prisma `UserRole` still includes a single `ADMIN` enum value for compatibility. Staff RBAC is a **separate milestone**; do not treat `ADMIN` as the final authorization model.
- SMS vendor adapters are not implemented yet. Production OTP send fails until configured; development uses a no-op sender that never logs the OTP body.

## Remaining limitations

- No push notifications.
- No admin MFA or dashboard grants.
- No Ghana Card / rider onboarding beyond creating a `DRAFT` rider profile on first OTP verify.
- Named SMS providers are stubs (fail closed).
- Booking, payments, matching, wallet, and refunds are out of scope for this milestone.

## Flutter integration

1. Replace local OTP `123456` success paths with `POST /api/v1/auth/otp` and `POST /api/v1/auth/otp/verify`.
2. Persist `refreshToken` in platform secure storage; keep `accessToken` in memory (or short-lived secure storage).
3. Attach `Authorization: Bearer <accessToken>` to protected calls and Socket.IO `auth: { token }`.
4. On `401`, call `POST /auth/refresh` once; on reuse/revocation failure, return to signup/login.
5. Call `POST /auth/logout` with both Bearer access token and body refresh token on sign-out.
6. Use `GET /users/me` after verify to hydrate profile state.
7. Phone must already be normalized to `+233XXXXXXXXX` before the request.
