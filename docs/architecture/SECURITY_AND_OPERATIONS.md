# Security and operations

This is the control set for the modular monolith. It describes mechanisms that already exist in source and the ones still required before production. It does not configure a VPS, Nginx, PM2, TLS, or a live Paystack account.

## Phone OTP

Milestone 1 is implemented. Details: `docs/architecture/AUTH_MILESTONE_1.md`.

- Code lifetime 5 minutes (`OTP_TTL_SECONDS`).
- 5 attempts (`OTP_MAX_ATTEMPTS`). `canAttemptOtp` is false at the limit.
- Resend cooldown 60 seconds (enforced in `AuthRepository.createOtpChallenge`).
- Store `hashOtpCode` (HMAC-SHA256 with `OTP_HASH_SECRET`), never the raw code.
- Compare with `secretsMatch` (timing-safe).
- OTP rows are not a user foreign key, so challenges can exist before signup.
- Per-IP OTP limiter: `OTP_RATE_LIMIT_*` on `/auth/otp` and `/auth/otp/verify`.
- No fixed server test code. Non-production may echo `developmentCode` only when `OTP_DEV_EXPOSE_CODE=true` (hard-disabled in production).
- SMS: development/test uses a no-op sender that never logs the OTP body. Production without credentials fails closed. Named vendor adapters are still undecided.
- Admin accounts are not issued by this OTP flow.

## Sessions

Milestone 1 is implemented.

- Access token: JWT HS256 only (`algorithms: ['HS256']`), claims `sub`, `role`, `iss`, `aud`, default 15 minutes.
- Refresh token: 32 random bytes, base64url. Only the HMAC hash is stored on `refresh_tokens`, with `family_id` for reuse detection.
- Access and refresh secrets must differ. Production boot rejects secrets containing `change-me` or `development-only`.
- `authenticate` + `requireActiveAccount` are mounted on `/auth/logout` and `/users/me`. Other business routers still empty.
- Socket.IO middleware verifies the same access token (HS256 + iss/aud) and joins `user:{userId}`.
- Refresh rotates in a serializable transaction with row lock. Reuse of a revoked token revokes the token family.
- Logout sets `revoked_at`.
- Access tokens are not stored server-side. Short TTL is the revocation delay. Suspended users fail `requireActiveAccount` and refresh even if the access token has not expired.
- The mobile app should store the refresh token in platform secure storage (Flutter dependency still outstanding).

## Authorization

**Confirmed.** Every business route mounts `authenticate` and `requireRole`, then the service checks ownership. A valid role is not enough. `requireRole` exists and is not mounted. That is current code, not a waiver.

Roles on the user row today: `PASSENGER`, `RIDER`, `ADMIN`. That single `ADMIN` value is not the approved staff model.

**Implemented in Milestone 2.** Dashboard grants are `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, and `SUPPORT_ADMIN` in `admin_role_grants`, loaded on each privileged request via `requirePermission`. Refund execution is an explicit finance permission (`ExecuteRefunds`); Support can only recommend. A person cannot grant `SUPER_ADMIN` to themselves. TOTP MFA is required before a privileged staff token is issued. Mobile OTP still cannot create these grants. Details: `docs/architecture/ADMIN_RBAC_MILESTONE_2.md`.

After the signature check, the service loads `users.status` and rejects anything other than `ACTIVE`. The access token alone must not keep a suspended rider available or a suspended passenger able to book. **Confirmed:** access tokens are signed and verified only with `HS256`.

`requireRole` is necessary and not sufficient. Services also check ownership:

| Action | Check |
| --- | --- |
| Cancel booking | Passenger on the row, or Operations Admin or Super Admin |
| Start or complete a trip | Assigned rider only |
| Accept or reject offer | A `PENDING` offer exists for this rider and booking |
| Update location | `rider_locations.rider_id` is the caller |
| Read wallet | Caller is that rider |
| Read notification | `notifications.user_id` is the caller |
| Admin review and suspend | Operations Admin or Super Admin, with a reason and an audit row. Not a generic `ADMIN` token by itself |
| Execute a refund | Explicit finance permission. Support Admin does not receive it automatically |
| Read or decrypt a Ghana Card | Operations Admin or Super Admin, and only inside an identity-review case. Not `GET /users/me` or the rider availability routes |

A passenger access token must not read another passenger's booking, even if the UUID is known. Return `404` when the row exists but is not theirs, so the id cannot be probed. Return `403` when the resource is theirs but the role cannot perform the action.

Ordinary rider and user responses return `verificationStatus` and availability only. They do not return a card number, a lookup hash, ciphertext, a storage key, or a signed document URL.

## Ghana Card storage

**Current code.** `rider_profiles.ghana_card_number` is plaintext. It is a security risk if it is ever filled. Document image bytes are not in Postgres. `rider_documents.storage_key` is the intended pointer and has no storage client.

**Confirmed.**

- A rider cannot go online until Ghana Card verification is approved.
- Administrative status (`verification_status`, notes, approve or reject) is separate from the secret and from the file.
- Images and card numbers are not columns a normal query returns, and images are not PostgreSQL bytea.
- Every decrypt or document open writes an audit row. The metadata names the actor and the rider id. It does not contain the number, the image, or the ciphertext.

**Proposed** storage:

- Stop using `ghana_card_number`. A later migration drops it after confirming it is empty.
- `rider_identity_secrets` holds AES-256-GCM ciphertext, nonce, and key version for the card number. The data key is not in the database and not in `backup-postgres.sh` output. Which key manager holds it is **unresolved**.
- A separate HMAC of the normalized number may be stored to stop the same card on two rider accounts. The HMAC pepper is not the data key. This uniqueness hash is proposed, not confirmed.
- Images go to a private object bucket. The database keeps `storage_key` only. The bucket encrypts objects at rest. Admin review receives a short-lived signed URL. The URL is not logged.
- `verification_notes` must not quote the card number.
- Retention of ciphertext and images: keep them while the rider account is active. The period after closure or rejection is **unresolved**. When that period ends, delete the secret and the objects. Keep the audit row that says they were deleted. Do not keep the secret inside the audit payload.
- Backups of Postgres will still contain ciphertext. They must not contain the data key. Restore drills must not copy the key into the dump directory.

Access to the secret table is limited to the database role used by the identity-review path, not to every query the API runs. If a single database role is all the process has, the application still refuses the query except from the admin review service, and the audit row is mandatory. A separate database role is preferred and is **unresolved** until deployment is designed.

## Rate limiting

`apiRateLimiter` is mounted for everything under `/api/v1` except `/health`. Defaults: 15 minutes, 300 requests. The handler returns `429` `RATE_LIMITED`. `TRUST_PROXY` defaults false. Turn it on only behind the Nginx that sets the real client IP, otherwise the limiter buckets everyone as the proxy.

OTP and webhook routes need their own limits when they are registered. The webhook limit must not block Paystack retries so hard that a payment stays `PENDING`; signature verification is the authorization control.

## Paystack

- Verify `x-paystack-signature` with `verifyPaystackSignature` over `req.rawBody` and `PAYSTACK_SECRET_KEY`.
- Reject a missing secret, a missing signature, or a length mismatch. The helper already returns false in those cases.
- Do not trust amount, pack size, or booking id from the client for the captured value. Load the `payments` row by `provider_reference` and use the stored pesewas.
- Idempotency keys and unique indexes are the duplicate protection. See `FINANCIAL_ARCHITECTURE.md`.
- `PAYSTACK_PUBLIC_KEY` may be shown to the app if the Paystack client SDK needs it. The secret stays on the server.

## GPS freshness

`isFreshLocation` is true only when `0 <= now - recordedAt <= 30_000` ms. Matching and live display use it. A future timestamp is stale. Offline riders have `sharing_enabled = false` and are not eligible. Passengers receive the assigned rider's points on the booking room after accept, not a feed of every online rider.

## Audit

`audit_logs` stores actor, action, entity type, entity id, JSON metadata, and IP. The service throws `NOT_IMPLEMENTED`.

Write a row in the same transaction for: rider approve and reject, every Ghana Card decrypt or document open, user suspend, zone create and update, wallet adjustment, dispute decisions, and admin cancel. Do not log OTP codes, refresh tokens, Paystack secrets, Ghana Card numbers, ciphertext, or images. Phone numbers in metadata should be avoided where the user id is enough.

## Database backup and recovery

Full runbook: [`docs/deployment/database-backups.md`](../deployment/database-backups.md).

`backend/scripts/backup-postgres.sh` requires `DATABASE_URL`, writes a custom-format `pg_dump` under `/var/backups/cyrlo-ride` (override with `BACKUP_DIR`), and uploads to Bunny Storage under `db-backups/` when `BUNNY_STORAGE_*` is set. Modes: `hourly` (~48h retention local + Bunny) and `daily` (30d). Cron via `/etc/cron.d/cyrlo-ride-backup` and wrapper `/usr/local/sbin/cyrlo-ride-backup.sh`. Postgres is intended to listen on localhost only. The API is the only application client.

Still not covered:

- Point-in-time recovery (WAL / managed Postgres). Recovery point is the last successful dump (~1 hour RPO with hourly + Bunny).
- Whole-droplet snapshots (enable separately in the VPS provider UI).

## Process controls already in the app

- Helmet, CORS allow-list, `x-powered-by` disabled.
- JSON body limit 1 MB.
- Pino request logs with the request id.
- Graceful shutdown closes HTTP, Socket.IO, and Prisma.
- Readiness runs `SELECT 1`.

## Production boot checklist (later)

When deployment is approved, production `NODE_ENV` must fail closed on placeholder JWT and OTP secrets. Paystack, SMS, and the database URL are still required for real traffic even though empty Paystack and SMS strings pass the current schema. Add a production refine for those before go-live. Do not start that work in this documentation phase.
