# Cyrlo Ride — Milestone 2: Admin RBAC and MFA

## Architecture changes

- `users.role = ADMIN` means “staff account”, not a permission.
- Staff authority lives in `admin_role_grants` (`StaffRole`).
- Privileged HTTP checks use centralized `Permission` + `requirePermission`.
- Admin login is separate from passenger/rider OTP (`/admin/auth/*`) and requires TOTP (or a recovery code) before an MFA-verified access token is issued.
- TOTP secrets are AES-256-GCM encrypted with `ADMIN_MFA_ENCRYPTION_KEY` (env only, not in Postgres plaintext).
- Bootstrap creates the first Super Admin once, then permanently locks via `admin_bootstrap_state`.

Passenger and rider Milestone 1 OTP/JWT/refresh flows are unchanged.

## Roles and permission matrix

| Permission | SUPER | OPS | FINANCE | SUPPORT |
| --- | --- | --- | --- | --- |
| View admin profile | ✓ | ✓ | ✓ | ✓ |
| Manage admins / invites | ✓ | | | |
| Manage platform config | ✓ | | | |
| Review riders / documents / suspend | ✓ | ✓ | | |
| Manage service zones / monitor ops | ✓ | ✓ | | |
| Access identity documents | ✓ | ✓ | | |
| View payments | ✓ | | ✓ | ✓ |
| Reconcile Paystack / token packages / ledgers / financial reports | ✓ | | ✓ | |
| Execute refunds | ✓ | | ✓ | |
| Recommend refunds / disputes / GPS evidence / support decisions | ✓ | | | ✓ |

Support cannot execute refunds. Operations cannot authorize finance. Nobody can grant `SUPER_ADMIN` to themselves (`granted_by <> user_id` check + service guard).

## Endpoints

Base: `/api/v1/admin`

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/bootstrap` | bootstrap secret |
| POST | `/invitations` | Super Admin MFA session |
| POST | `/invitations/accept` | invitation token |
| POST | `/auth/otp` | public |
| POST | `/auth/otp/verify` | public → MFA pending/enrollment token |
| POST | `/auth/mfa/verify` | MFA pending token + TOTP or recovery code |
| POST | `/mfa/enroll/start` | enrollment Bearer token |
| POST | `/mfa/enroll/confirm` | enrollment Bearer + first TOTP |
| POST | `/grants/revoke` | Super Admin MFA session |
| GET | `/me` | any staff MFA session |

## Prisma changes and migrations

Migration: `20261107043000_admin_rbac_mfa`

Adds: `StaffRole`, `ADMIN_LOGIN` OTP purpose, `admin_role_grants`, `admin_invitations`, `admin_bootstrap_state`, `admin_mfa_credentials`, `admin_recovery_codes`.

### Legacy `ADMIN` users

Existing `users.role = ADMIN` rows are **not** given grants. They cannot pass `requirePermission` until a Super Admin invites/assigns them. Manual review is required; do not bulk-promote to `SUPER_ADMIN`.

## Bootstrap procedure

1. Set a strong `ADMIN_BOOTSTRAP_SECRET` (≥32 chars) and `ADMIN_MFA_ENCRYPTION_KEY` (32-byte base64) in the environment.
2. Ensure no Super Admin grant exists and `admin_bootstrap_state.completed_at` is null.
3. `POST /api/v1/admin/bootstrap` with `{ bootstrapSecret, phoneNumber, displayName? }`.
4. Complete MFA enrollment with the returned `enrollmentToken` (`/mfa/enroll/start` → confirm).
5. Store recovery codes offline. Remove or rotate `ADMIN_BOOTSTRAP_SECRET` after success (endpoint stays locked by DB state even if the secret remains).

## TOTP enrollment and recovery

1. After bootstrap or invitation accept, client receives `enrollmentToken`.
2. `POST /mfa/enroll/start` returns `otpauthUrl` + QR PNG data URL (Google Authenticator compatible). Secret is shown only via otpauth URL at enrollment start; it is never returned again.
3. `POST /mfa/enroll/confirm` with the first TOTP enables MFA and returns recovery codes once.
4. Daily login: admin OTP → `MFA_REQUIRED` → TOTP (step replay rejected) or single-use hashed recovery code.
5. Role revoke clears grants and refresh sessions.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_BOOTSTRAP_SECRET` | One-time bootstrap; empty disables |
| `ADMIN_MFA_ENCRYPTION_KEY` | Base64 32-byte AES-GCM key |
| `ADMIN_INVITE_TTL_SECONDS` | Invitation lifetime (default 3 days) |
| `ADMIN_MFA_PENDING_TTL_SECONDS` | Pending/enrollment JWT TTL |
| `ADMIN_RECENT_MFA_SECONDS` | Fresh-MFA window for sensitive ops |
| `TOTP_ISSUER` | Authenticator issuer label |

## Audit events

| Action | When |
| --- | --- |
| `admin.bootstrap.completed` | First Super Admin created |
| `admin.invitation.created` | Invite issued |
| `admin.invitation.accepted` | Invite consumed + grant created |
| `admin.mfa.enrolled` | TOTP enabled |
| `admin.mfa.verified` | TOTP login |
| `admin.mfa.recovery_used` | Recovery code consumed |
| `admin.grant.revoked` | Staff grant revoked |

Never logs passwords, OTPs, recovery codes, TOTP secrets, or document contents.

## Remaining security risks

- Named SMS vendor still stubbed (dev no-op / prod fail-closed).
- Admin frontend not built; operators must call APIs carefully.
- WebAuthn not implemented (TOTP chosen for this milestone).
- `requireRecentMfa` is available but not yet attached to future refund/document routes.
- Legacy `ADMIN` rows need manual grant assignment.
- Encryption key loss makes TOTP secrets unrecoverable (by design); use recovery codes + re-invite.
