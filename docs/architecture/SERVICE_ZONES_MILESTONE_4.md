# Cyrlo Ride — Milestone 4: Service zones and rider-zone approvals

## What was implemented

- Admin service-zone CRUD with GeoJSON Polygon/MultiPolygon validation.
- Zone activation and deactivation (new zones default inactive).
- Per-zone rider assignment / approve / reject / revoke with append-only decision history.
- Central `ManageServiceZones` permission (Super Admin + Operations Admin only).
- Audit events for zone and rider-zone lifecycle actions.
- Unit tests (memory repository) plus PostgreSQL constraint tests against `cyrlo_ride_app`.

Explicitly not implemented: matching, booking pickup checks, GPS, rider availability, tokens, payments, Flutter/admin UI. `assertPickupSupported` remains `NOT_IMPLEMENTED`.

## Geographic constraint

Pilot intent is Ahenema Kokoben (Atwima Kwanwoma District, Ashanti). **No verified operational boundary was supplied.** The system does **not** seed, invent, or approximate polygons. Authorized admins must supply verified GeoJSON later. The entire district is not treated as an operational zone by default.

## Files created and modified

### Created

| Path | Role |
| --- | --- |
| `backend/prisma/migrations/20261107060000_service_zones_rider_approvals/migration.sql` | Schema migration |
| `backend/src/modules/service-zones/memory-service-zones-repository.ts` | In-memory repo for unit tests |
| `backend/src/modules/service-zones/module.test.ts` | Unit / RBAC / geometry / lifecycle tests |
| `backend/src/modules/service-zones/module.db.test.ts` | Postgres unique + Restrict + deactivate tests |
| `docs/architecture/SERVICE_ZONES_MILESTONE_4.md` | This report |

### Modified (module rewritten / extended for M4)

| Path | Role |
| --- | --- |
| `backend/prisma/schema.prisma` | Zone metadata, `RiderZoneApproval`, `RiderZoneDecision` |
| `backend/src/modules/service-zones/zone-geometry.ts` | Validate/normalize GeoJSON boundaries |
| `backend/src/modules/service-zones/module.schema.ts` | Request schemas |
| `backend/src/modules/service-zones/module.repository.ts` | Prisma repository |
| `backend/src/modules/service-zones/module.service.ts` | Business rules + audit |
| `backend/src/modules/service-zones/module.controller.ts` | HTTP handlers |
| `backend/src/modules/service-zones/module.routes.ts` | Routes + permission middleware |
| `backend/src/modules/service-zones/index.ts` | Module composition |
| `backend/src/app.ts` | Mount `/service-zones` and rider zone admin routes |
| `backend/src/composition.ts` | Wire audit into service-zones module |
| `backend/src/common/authz/permissions.ts` | Existing `ManageServiceZones` (unchanged matrix) |

## Prisma models and migration

Migration: `20261107060000_service_zones_rider_approvals`  
Target database: **`cyrlo_ride_app` only** (legacy `cyrlo_ride` untouched).

### `ServiceZone` (`service_zones`)

- Existing: `id`, `name`, `isActive`, `boundary` (Json), bbox decimals, timestamps.
- Added: `description`, `createdById`, `updatedById` (SetNull on user delete).
- Default `is_active = false` for new inserts.
- Indexes: `isActive`, `name`.
- Bookings keep optional `serviceZoneId` with existing FK behavior (historical bookings preserved; zone delete Restricted by rider-zone FKs).

### `RiderZoneApproval` (`rider_zone_approvals`)

- One row per `(riderId, zoneId)` — unique constraint.
- Status enum: `PENDING | APPROVED | REJECTED | REVOKED`.
- `reason`, `decidedAt`, `decidedById`.
- Zone FK: `ON DELETE RESTRICT` (deactivation does not delete; hard delete of zone blocked while approvals exist).
- Rider FK: cascade with rider profile.

### `RiderZoneDecision` (`rider_zone_decisions`)

- Append-only history (assignment, approve, reject, revoke, reopen).
- Zone FK Restrict; actor FK Restrict; approval FK Cascade.

## API endpoints and permissions

All routes require authenticated active staff with `admin.manage_service_zones` (`ManageServiceZones`).

Base: `/api/v1/service-zones`

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/` | Create zone (`activate` optional, default inactive) |
| GET | `/` | List zones (`page`, `pageSize`, `isActive`, `q`) |
| GET | `/:zoneId` | Zone detail |
| PATCH | `/:zoneId` | Update name / description / boundary |
| POST | `/:zoneId/activate` | Activate (re-validates stored boundary) |
| POST | `/:zoneId/deactivate` | Deactivate (keeps approvals/history) |
| POST | `/:zoneId/rider-approvals` | Assign rider `{ riderId }` → `PENDING` |
| GET | `/:zoneId/rider-approvals` | List riders for zone |
| POST | `/rider-approvals/:approvalId/approve` | Approve pending |
| POST | `/rider-approvals/:approvalId/reject` | Reject pending `{ reason }` (min 5 chars) |
| POST | `/rider-approvals/:approvalId/revoke` | Revoke approved `{ reason }` (min 5 chars) |

Rider-centric views (same permission), base `/api/v1/admin/riders`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/:riderId/zone-approvals` | Current zone assignments |
| GET | `/:riderId/zone-approvals/history` | Append-only decision history |

### Role matrix

| Role | Manage zones / approvals |
| --- | --- |
| `SUPER_ADMIN` | Yes |
| `OPERATIONS_ADMIN` | Yes |
| `FINANCE_ADMIN` | No |
| `SUPPORT_ADMIN` | No |

### Validation and errors

- Invalid geometry → `400 VALIDATION_ERROR`.
- Missing zone/approval/rider → `404 NOT_FOUND`.
- Duplicate pending/approved assignment, inactive-zone assign/approve, wrong-status transitions → `409 CONFLICT`.
- Self-approve / self-reject / self-revoke / self-assign → `403 FORBIDDEN`.
- Missing/short reject/revoke reason → `400` via Zod.

Responses expose zone metadata, bbox, approval status, and non-sensitive rider fields (name, phone, verification status). No access tokens, Ghana Card numbers, or secrets.

## Geometry format and validation rules

- Format: GeoJSON **Polygon** or **MultiPolygon**.
- Coordinates: `[longitude, latitude]`.
- Longitude ∈ [-180, 180]; latitude ∈ [-90, 90].
- Each ring ≥ 4 positions; closed (first == last); ≥ 3 distinct vertices.
- Exterior ring required; holes allowed.
- Normalized boundary + derived bounding box stored.
- Malformed input is rejected (never silently accepted).
- Point-in-polygon helpers exist for later milestones; booking matching is not wired.

## Rider-zone approval lifecycle

```text
         assign (active zone only)
                  │
                  v
              PENDING ──approve──► APPROVED ──revoke(+reason)──► REVOKED
                  │                                              │
                  └──reject(+reason)──► REJECTED ────────────────┤
                                                                  │
                     re-assign on REJECTED/REVOKED (active zone) ─┘
                                  → PENDING (history retained)
```

Rules:

- Approvals are independent per zone; a rider may hold multiple.
- Cannot approve for an inactive zone; cannot assign to inactive zone.
- Duplicate `PENDING`/`APPROVED` for the same pair blocked (DB unique + service checks).
- Rejection/revocation require mandatory reason.
- Actor and timestamp recorded on each decision.
- Rider overall Ghana Card / verification status is never mutated by zone actions.
- Zone deactivation: blocks new operational assign/approve; preserves rows and history; no cascade delete of bookings or approvals.
- Reactivation does not rewrite history.

## Audit events

| Action | Entity |
| --- | --- |
| `service_zone.created` | `service_zone` |
| `service_zone.updated` | `service_zone` |
| `service_zone.boundary_changed` | `service_zone` |
| `service_zone.activated` | `service_zone` |
| `service_zone.deactivated` | `service_zone` |
| `rider_zone.assigned` | `rider_zone_approval` |
| `rider_zone.approved` | `rider_zone_approval` |
| `rider_zone.rejected` | `rider_zone_approval` |
| `rider_zone.revoked` | `rider_zone_approval` |

Metadata includes ids, names, geometry type, flags, and reject/revoke reasons — not tokens or identity secrets.

## Test results

- `npm test`: **81 passed** (16 files), including `service-zones` unit + Postgres constraint tests.
- `npm run typecheck`: **passed**.

Coverage includes authorized create/update/activate/deactivate, invalid geometry rejection, Polygon/MultiPolygon acceptance, Finance/Support permission denial, multi-zone assignment, duplicate prevention, inactive-zone rejection, mandatory reject/revoke reasons (schema), self-approval block, verification-status isolation, audit actions, unique `(riderId, zoneId)`, history preserved after deactivate, and zone delete Restricted while approvals exist.

## Migration application status

- Command: `npx prisma migrate deploy` with `DATABASE_URL=.../cyrlo_ride_app`.
- Applied: `20261107060000_service_zones_rider_approvals`.
- Status: **Database schema is up to date** (5 migrations on `cyrlo_ride_app`).
- Legacy database `cyrlo_ride` was not touched.

## Known limitations and remaining risks

- No verified Ahenema Kokoben polygon in repo; ops must supply one before activation for real coverage.
- `assertPickupSupported` / booking point-in-polygon not implemented (Milestone 5+).
- Rider self-service “apply to zone” is admin-assign only in this milestone.
- Finance/Support cannot view zone lists (same permission gate as manage); broader read-only ops monitoring remains later.
- Integration tests require a reachable local `cyrlo_ride_app` Postgres matching `DATABASE_URL`.
