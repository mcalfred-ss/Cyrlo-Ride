# API contract

Approved target behaviour is `docs/architecture/CYRLO_RIDE_MASTER_SPEC.md`. Status `REQUESTED`, availability `BUSY`, and a single `ADMIN` role in the tables below are the current unimplemented schema. They are not the approved lifecycle or the final staff model.

This is the integration contract between the Flutter app and the backend. Health routes, OpenAPI at `/api/docs`, auth (`/auth/*`), and `GET /users/me` are live as of Milestone 1. See `docs/architecture/AUTH_MILESTONE_1.md`. Other business routes below remain planned until their milestones land.

Base URL: `/api/v1`

## Response envelope

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

`meta` is omitted when there is nothing extra to say. Lists use `meta` for pagination.

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "body.phoneNumber", "message": "Invalid" }],
    "requestId": "uuid"
  }
}
```

`details` is omitted when there is no field breakdown. `requestId` matches the `x-request-id` response header.

Error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `NOT_IMPLEMENTED`, `PAYMENT_VERIFICATION_FAILED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`.

## Authentication

Protected routes require `Authorization: Bearer <accessToken>`.

The access token is a JWT signed with HS256. It expires in 15 minutes by default. Claims include `sub` (user id), `role` (server-assigned `PASSENGER`, `RIDER`, or legacy `ADMIN`), `iss`, and `aud`. Clients must not supply a role.

The refresh token is an opaque string, stored only as a hash, and expires in 30 days. The app sends it as JSON `{ "refreshToken": "..." }` to the refresh route. Refresh rotates the token and detects reuse against the token family. The mobile app keeps it in secure storage.

Socket.IO uses the same access token in the handshake: `auth: { token: "<accessToken>" }`. Connections without a valid token are rejected. The server joins `user:{userId}`. After a rider is assigned, ride updates use `booking:{bookingId}`.

Public routes: OTP request, OTP verify, refresh, health, and (when payments land) the Paystack webhook. Logout and `/users/me` require a Bearer access token. The webhook is authorized by its signature, not by a JWT.

## Naming, time, and location

- Paths are plural nouns under `/api/v1`: `/bookings`, `/riders`, `/service-zones`.
- Actions that are not CRUD use a verb suffix: `POST /bookings/{id}/cancel`.
- Timestamps are ISO-8601 UTC strings.
- Coordinates are WGS84 objects: `{ "latitude": 5.6037, "longitude": -0.187 }`.
- Phone numbers are E.164 Ghana numbers: `+233` plus nine digits.
- Pagination query: `page` (default 1) and `pageSize` (default 20, maximum 100).
- The response meta is `{ "page", "pageSize", "total", "hasNextPage" }`.
- Versioning is the `/api/v1` prefix. Breaking changes get a new prefix.

## Booking statuses

Booking status is one of `REQUESTED`, `ACCEPTED`, `CANCELLED`, `COMPLETED`, `EXPIRED`.

An offer to a rider is separate: `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`. `booking.rejected` means that rider declined the offer. The booking can stay `REQUESTED`.

Allowed booking moves:

| From | To | Actor |
| --- | --- | --- |
| REQUESTED | ACCEPTED | RIDER |
| REQUESTED | CANCELLED | PASSENGER, ADMIN, SYSTEM |
| REQUESTED | EXPIRED | SYSTEM |
| ACCEPTED | CANCELLED | PASSENGER, RIDER, ADMIN, SYSTEM |
| ACCEPTED | COMPLETED | RIDER |

`REJECTED`, `CANCELLED`, and `COMPLETED` offers or bookings do not move again. Acceptance of an offer and the booking move `REQUESTED -> ACCEPTED` commit in one transaction, with the token debit.

## Implemented auth routes (Milestone 1)

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| POST | `/auth/otp` | public | `{ "phoneNumber" }` |
| POST | `/auth/otp/verify` | public | `{ "phoneNumber", "code", "role" }` |
| POST | `/auth/refresh` | public | `{ "refreshToken" }` |
| POST | `/auth/logout` | bearer | `{ "refreshToken" }` |
| GET | `/users/me` | bearer | |

## Implemented admin RBAC routes (Milestone 2)

See `docs/architecture/ADMIN_RBAC_MILESTONE_2.md`.

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| POST | `/admin/bootstrap` | bootstrap secret | `{ "bootstrapSecret", "phoneNumber" }` |
| POST | `/admin/invitations` | SUPER_ADMIN + MFA | `{ "phoneNumber", "staffRole" }` |
| POST | `/admin/invitations/accept` | invite token | `{ "token" }` |
| POST | `/admin/auth/otp` | public | `{ "phoneNumber" }` |
| POST | `/admin/auth/otp/verify` | public | `{ "phoneNumber", "code" }` |
| POST | `/admin/auth/mfa/verify` | MFA pending | `{ "mfaToken", "code" \| "recoveryCode" }` |
| POST | `/admin/mfa/enroll/start` | enrollment Bearer | |
| POST | `/admin/mfa/enroll/confirm` | enrollment Bearer | `{ "code" }` |
| POST | `/admin/grants/revoke` | SUPER_ADMIN + MFA | `{ "userId", "reason" }` |
| GET | `/admin/me` | staff MFA | |

## Implemented rider onboarding (Milestone 3)

See `docs/architecture/RIDER_ONBOARDING_MILESTONE_3.md`.

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| POST/PATCH/GET | `/riders/onboarding` | PASSENGER or RIDER | Draft application; Ghana Card encrypted |
| POST | `/riders/onboarding/submit` | PASSENGER or RIDER | → `PENDING_REVIEW` |
| POST/PATCH | `/riders/vehicles` | PASSENGER or RIDER | `TRICYCLE` \| `CAR` only |
| POST | `/riders/documents` | PASSENGER or RIDER | multipart upload to private R2 |
| GET/POST | `/admin/riders/...` | Ops (+ MFA for identity) | Review / signed docs / Ghana Card reveal |

## Planned HTTP routes

These shapes are the contract. They are not mounted yet.

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| PATCH | `/users/me` | PASSENGER | `{ "fullName" }` |
| POST | `/riders/availability` | RIDER | `{ "availability": "OFFLINE" \| "AVAILABLE" }` |
| POST | `/bookings` | PASSENGER | pickup and destination coordinates only |
| POST | `/bookings/{id}/cancel` | owner | optional reason |
| POST | `/bookings/{id}/complete` | assigned RIDER | |
| POST | `/matching/offers/{bookingId}/accept` | RIDER | |
| POST | `/matching/offers/{bookingId}/reject` | RIDER | |
| POST | `/locations/rider` | RIDER | coordinates, optional heading and accuracy, `recordedAt` |
| POST | `/locations/rider/stop` | RIDER | |
| POST | `/payments/booking-fee` | PASSENGER | `{ "bookingId" }` only. The server sets GHS 1.00 |
| POST | `/payments/token-packs` | RIDER | `{ "packCode" }` only |
| POST | `/payments/paystack/webhook` | Paystack signature | raw body |
| GET | `/wallet` | RIDER | |
| GET | `/notifications` | bearer | pagination |
| POST | `/admin/riders/{id}/review` | ADMIN | decision and notes |

`BUSY` is set by the server when a rider accepts. The rider cannot set it.

The client must not send a fare, a booking-fee amount, or a token quantity. The server owns those numbers. Payment success reported by the app is ignored. Only a verified Paystack webhook can mark a payment successful.

## Socket.IO events

These names are reserved. The server does not emit them yet. Payloads use the same coordinate and timestamp rules.

`booking.requested`

```json
{
  "bookingId": "uuid",
  "passengerId": "uuid",
  "pickup": { "latitude": 0, "longitude": 0 },
  "destination": { "latitude": 0, "longitude": 0 },
  "bookingFeePesewas": 100,
  "requestedAt": "2026-11-06T12:00:00.000Z"
}
```

`booking.accepted`

```json
{ "bookingId": "uuid", "riderId": "uuid", "acceptedAt": "2026-11-06T12:00:00.000Z" }
```

`booking.rejected`

```json
{
  "bookingId": "uuid",
  "riderId": "uuid",
  "rejectedAt": "2026-11-06T12:00:00.000Z",
  "bookingStatus": "REQUESTED"
}
```

`bookingStatus` may be `EXPIRED` when no offer remains.

`booking.cancelled`

```json
{
  "bookingId": "uuid",
  "cancelledBy": "PASSENGER",
  "cancelledAt": "2026-11-06T12:00:00.000Z",
  "reason": "optional"
}
```

`cancelledBy` is `PASSENGER`, `RIDER`, `ADMIN`, or `SYSTEM`.

`booking.completed`

```json
{ "bookingId": "uuid", "riderId": "uuid", "completedAt": "2026-11-06T12:00:00.000Z" }
```

`rider.location.updated`

```json
{
  "riderId": "uuid",
  "bookingId": "uuid",
  "latitude": 0,
  "longitude": 0,
  "heading": 90,
  "accuracyMeters": 12,
  "recordedAt": "2026-11-06T12:00:00.000Z"
}
```

`bookingId` is present only on the assigned booking room. Location events are not broadcast to every passenger.

`rider.availability.updated`

```json
{
  "riderId": "uuid",
  "availability": "AVAILABLE",
  "updatedAt": "2026-11-06T12:00:00.000Z"
}
```

`availability` is `OFFLINE`, `AVAILABLE`, or `BUSY`.

Clients and the server ignore GPS readings older than 30 seconds or timestamped in the future. Going offline stops precise location sharing.
