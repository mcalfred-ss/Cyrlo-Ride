# Cyrlo Ride — Phase 7 Implementation Report  
## Administration and Security

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**Baseline HEAD:** `f25bba1`

---

## Features implemented

### Administrators (`/admins`)
- Create invitation: `POST /admin/invitations` (`ManageAdmins`, Super-only enforced by backend for SUPER_ADMIN invites).
- One-time display of invitation `token` after create (dismissible); never persisted in localStorage.
- Revoke grant: `POST /admin/grants/revoke` with userId + reason.
- Explicit UI note: **no admin user directory API** — revoke requires known user UUID.

### Audit logs (`/audit`)
- `GET /admin/audit-logs` with pagination and filters (actorId, action, entityType, entityId, from, to).
- Metadata shown truncated/serialized; no OTP secrets, MFA seeds, recovery codes, or session tokens in UI fields.

### Existing security surfaces retained
- MFA enrollment/verify pages unchanged.
- Suspend/reinstate riders still via Phase 1C `admin-users` clients on rider profile (not duplicated here).

---

## Files

| Path | Change |
| --- | --- |
| `apps/cyrlo_admin/src/api/admin-staff.ts` | Added |
| `apps/cyrlo_admin/src/pages/AdminsPage.tsx` | Added |
| `apps/cyrlo_admin/src/pages/AuditLogsPage.tsx` | Added |
| Router/nav | Real pages replace placeholders |

---

## Deferred (missing / unsafe without contracts)

- Admin staff directory / detail (`GET /admin/admins` does not exist).
- In-UI permission matrix editor / self-grant controls.
- Session revocation browser beyond grant revoke.
- MFA device reset admin tool (no such admin endpoint beyond enroll flow).
- Platform settings (`ManagePlatformConfig` has no admin settings routes found).

---

## Security decisions

- Invitation token shown once only after create.
- Role mappings unchanged.
- Backend remains authority; SPA only hides unsupported controls.
- No password hashes / OTP / TOTP secrets in responses used by these pages.
