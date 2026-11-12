# API contract

The approved target lifecycle, staff roles, vehicles, packs, and trips are in `CYRLO_RIDE_MASTER_SPEC.md` section 14. Where this file says a new booking is `REQUESTED`, that a rider becomes `BUSY`, that any `ADMIN` may call a route, or that no token pack exists, it is describing the current Zod schemas. Those schemas are not mounted. They are not the approved target.

Base URL: `/api/v1`.

The shapes below follow the Zod schemas and `docs/API_DOCUMENTATION.md`. No business route returns them today.

Live routes are only:

- `GET /api/v1/health`
- `GET /api/v1/health/ready`
- `GET /api/docs` (OpenAPI for those two routes)

Every other path in this document is specified and unregistered. A call returns `404` with `NOT_FOUND`. It does not return `501`. `501 NOT_IMPLEMENTED` is what the in-process service throws.

## Envelope

Success:

```json
{ "success": true, "data": {}, "meta": {} }
```

`meta` is omitted except on lists.

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

`details` is omitted when there is no field list. `requestId` matches the `x-request-id` header.

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Zod rejection |
| `UNAUTHORIZED` | 401 | Missing or bad access token, or bad socket handshake |
| `FORBIDDEN` | 403 | Wrong role, wrong owner, or illegal actor for a transition |
| `NOT_FOUND` | 404 | Unknown id, or a route that is not registered yet |
| `CONFLICT` | 409 | Illegal status transition, duplicate financial effect |
| `RATE_LIMITED` | 429 | Over the limiter (default 300 requests per 15 minutes) |
| `NOT_IMPLEMENTED` | 501 | Service called before it is built |
| `PAYMENT_VERIFICATION_FAILED` | 400 | Paystack signature mismatch |
| `SERVICE_UNAVAILABLE` | 503 | Readiness check cannot reach Postgres |
| `INTERNAL_ERROR` | 500 | Unhandled failure |

## Conventions

- Bearer auth: `Authorization: Bearer <accessToken>`.
- Access token claims: `sub` (user id), `role` (`PASSENGER`, `RIDER`, `ADMIN`). Default lifetime 15 minutes.
- Refresh token: opaque, at least 20 characters, sent as JSON. Stored only as a hash. Default lifetime 30 days. Refresh rotates it.
- Phone: E.164 Ghana, `+233` and nine digits.
- Time: ISO-8601 UTC.
- Coordinates: `{ "latitude": number, "longitude": number }` in WGS84.
- Pagination query: `page` (default 1), `pageSize` (default 20, max 100).
- List meta: `{ "page", "pageSize", "total", "hasNextPage" }`.
- The client does not send a fare, a fee amount, or a token quantity.
- Public routes: health, `POST /auth/otp`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /payments/paystack/webhook`. The webhook is authorized by signature, not by a JWT.
- Socket.IO connects to the same origin as `SOCKET_URL` with `auth: { "token": "<accessToken>" }`.

## Authentication

### `POST /auth/otp`

Public. Body: `{ "phoneNumber": "+233244123456" }`.

`data`: `{ "expiresIn": 300, "resendAfter": 60 }`. The code is not in the response (except non-production when `OTP_DEV_EXPOSE_CODE=true`). SMS is sent by the server. The Flutter constant `123456` is not part of this contract. Implemented in Milestone 1.

### `POST /auth/otp/verify`

Public. Body:

```json
{ "phoneNumber": "+233244123456", "code": "123456", "role": "PASSENGER" }
```

`role` is `PASSENGER` or `RIDER`. `ADMIN` is not created here. Implemented in Milestone 1.

`data`:

```json
{
  "accessToken": "jwt",
  "refreshToken": "opaque",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "phoneNumber": "+233244123456",
    "role": "PASSENGER",
    "status": "ACTIVE",
    "displayName": null
  }
}
```

First success creates the user and an empty passenger profile, or a rider profile still in `DRAFT`. The same phone with the other role is `409 CONFLICT`.

### `POST /auth/refresh`

Public. Body: `{ "refreshToken": "..." }`. Implemented in Milestone 1.

`data`: a new access token, a new refresh token, and `expiresIn`. The previous refresh token is revoked. Reuse of a revoked token revokes the token family.

### `POST /auth/logout`

Bearer. Body: `{ "refreshToken": "..." }`. `data`: `{ "revoked": true }`. Implemented in Milestone 1.

## Users

### `GET /users/me`

Bearer. `data`: the user object plus `passengerProfile` or `riderProfile` for that role. Implemented in Milestone 1 (read-only).

### `PATCH /users/me`

Bearer, role `PASSENGER`. Body: `{ "fullName": "Ama Mensah" }` (2–120 characters).

Proposed `data`: `{ "fullName": "Ama Mensah" }`.

## Riders

### `POST /riders/onboarding`

Bearer, role `RIDER`. Body:

```json
{
  "fullName": "Kwame Boateng",
  "vehicleRegistration": "M-1234-25",
  "vehicleDescription": "Red motorcycle"
}
```

Proposed `data`: `{ "verificationStatus": "PENDING_REVIEW", "availability": "OFFLINE" }`.

Vehicle onboarding accepts category `OKADA` \| `PRAGYA` \| `ABOBOYAA`, registration, make, model, colour, capacity, and document keys. See `CYRLO_RIDE_MASTER_SPEC.md`.

### `POST /riders/availability`

Bearer, role `RIDER`. Body: `{ "availability": "AVAILABLE" }` or `"OFFLINE"`.

`BUSY` is rejected by schema. The server sets `BUSY` on accept.

Proposed `data`: `{ "availability": "AVAILABLE", "updatedAt": "2026-11-06T12:00:00.000Z" }`.

`AVAILABLE` is refused unless the rider is `APPROVED`, the wallet exists, and a fresh shared location is on file. Exact refusal code is an implementation detail of `403` or `409`; the condition is already in the business rules.

## Locations

### `POST /locations/rider`

Bearer, role `RIDER`. Body:

```json
{
  "latitude": 6.6885,
  "longitude": -1.6244,
  "accuracyMeters": 12,
  "heading": 90,
  "recordedAt": "2026-11-06T12:00:00.000Z"
}
```

`accuracyMeters` is optional, greater than 0 and at most 1000. `heading` is optional, from 0 inclusive to 360 exclusive. `recordedAt` is required.

Proposed `data`: `{ "sharingEnabled": true, "recordedAt": "..." }`.

The server stores the point and, if this rider is assigned, emits `rider.location.updated` to `booking:{bookingId}` only. A stale or future timestamp is stored only if the product wants the latest attempt; it must not be treated as fresh. Matching ignores it. The handler should answer `409 CONFLICT` when `recordedAt` is in the future so a bad clock is visible.

### `POST /locations/rider/stop`

Bearer, role `RIDER`. Empty body. Sets `sharingEnabled` false. Proposed `data`: `{ "sharingEnabled": false }`.

There is no "list nearby riders" HTTP route. Passengers learn about a rider through booking events after accept, not by polling every GPS row.

### `GET /matching/supply`

Bearer, role `PASSENGER`. Query: `vehicleCategory` (`OKADA` | `PRAGYA` | `ABOBOYAA`, default `PRAGYA`), `latitude`, `longitude`.

Returns a count-only probe using the same eligibility gates as dispatch (AVAILABLE, fresh location, matching radius, tokens, zone). No rider identities or coordinates.

Proposed `data`: `{ "available": true, "count": 2, "vehicleCategory": "PRAGYA" }`.

## Bookings

### `POST /bookings`

Bearer, role `PASSENGER`. Body (destination-free):

```json
{
  "pickup": { "latitude": 6.69, "longitude": -1.62 },
  "pickupLabel": "Kejetia",
  "vehicleCategory": "PRAGYA"
}
```

`destination` / `destinationLabel` are optional legacy fields and are not used for fare or routing. Labels are optional, 1–200 characters when present. No transport-fare field.

Successful create enters **`SEARCHING`** immediately (after ACTIVE service-zone validation). Cyrlo does **not** open Paystack at create. The fixed **GH₵1 connection fee** (`bookingFeePesewas: 100`) is initiated when a rider accepts.

Proposed `data`:

```json
{
  "id": "uuid",
  "status": "SEARCHING",
  "bookingFeePesewas": 100,
  "connectionFeePesewas": 100,
  "pickup": { "latitude": 6.69, "longitude": -1.62 },
  "destination": null,
  "pickupLabel": "Kejetia",
  "destinationLabel": null,
  "payment": null,
  "requestedAt": "2026-11-06T12:00:00.000Z"
}
```

Pickup outside every ACTIVE zone is `409 CONFLICT` (`Pickup is outside the active service area`). Matching dispatch runs after create (and via workers).

### `POST /bookings/{bookingId}/cancel`

Bearer. The passenger must own the booking, or an admin uses the admin path. Body optional: `{ "reason": "..." }` up to 200 characters. The existing cancel schema also requires `bookingId` in the validated object; the route param is the source.

Proposed `data`: `{ "id": "uuid", "status": "CANCELLED", "cancelledAt": "..." }`.

### `POST /bookings/{bookingId}/complete`

Bearer, assigned rider only. Empty body.

Proposed `data`: `{ "id": "uuid", "status": "COMPLETED", "completedAt": "..." }`.

List and get-by-id are not in the Zod modules. Clients will need them to restore a screen. They are proposed additions, not current schemas:

| Method | Path | Role | Proposed `data` |
| --- | --- | --- | --- |
| `GET` | `/bookings` | owner | Paginated bookings for the caller. Passenger sees own requests. Rider sees bookings assigned to them |
| `GET` | `/bookings/{bookingId}` | passenger owner, assigned rider, or admin | One booking, its status timestamps, and the assigned rider id if any |

Do not add these by changing the response of `POST /bookings`. Implement them as reads when the write path exists.

## Matching

### `POST /matching/offers/{bookingId}/accept`

Bearer, role `RIDER`. The offer must be `PENDING` for this rider. Empty body. Schema field is `bookingId`.

Proposed `data`: `{ "bookingId": "uuid", "status": "ACCEPTED", "acceptedAt": "..." }`.

Conflict if the booking is no longer `REQUESTED`, the rider is ineligible, or the token debit cannot be posted.

### `POST /matching/offers/{bookingId}/reject`

Bearer, role `RIDER`. Empty body.

Proposed `data`: `{ "bookingId": "uuid", "offerStatus": "REJECTED", "bookingStatus": "REQUESTED" }`.

**Target.** A reject leaves the booking in `SEARCHING` while the 5-minute search clock and further batches remain. It does not leave the booking in `REQUESTED`. The booking becomes `EXPIRED` only when the search clock ends with no winner. The Zod-era note below is current schema language, not the target.

A rider offer inbox is not a registered route. Proposed addition: `GET /matching/offers?status=PENDING`, rider only, paginated, returning booking pickup, destination, labels, and `offeredAt`. No other rider's identity.

## Wallet and payments

### `GET /wallet`

Bearer, role `RIDER`.

Proposed `data`:

```json
{ "tokenBalance": 12, "updatedAt": "2026-11-06T12:00:00.000Z" }
```

A paginated ledger is a proposed addition: `GET /wallet/ledger` with the list meta and rows `{ "id", "type", "tokenDelta", "balanceAfter", "reason", "bookingId", "createdAt" }`.

### `POST /payments/booking-fee`

Bearer, role `PASSENGER`. Body: `{ "bookingId": "uuid" }`.

Proposed `data`:

```json
{
  "paymentId": "uuid",
  "amountPesewas": 100,
  "currency": "GHS",
  "authorizationUrl": "https://checkout.paystack.com/...",
  "reference": "paystack-reference"
}
```

The amount is always 100. Repeating the call with the same booking returns the same pending payment when the idempotency key matches.

### `POST /payments/token-packs`

Bearer, role `RIDER`. Body: `{ "packCode": "pack_10" }`.

`packCode` is 1–40 characters in the current Zod schema. **Target catalog:** `STARTER`, `STANDARD`, and `PRO`. The server looks up tokens and pesewas. An unknown code is `404` or `VALIDATION_ERROR`. The client does not send a price or a token count.

Proposed `data`: `paymentId`, `amountPesewas`, `currency`, `tokenCount`, `authorizationUrl`, `reference`. `tokenCount` is server-owned.

### `POST /payments/paystack/webhook`

Public. Header `x-paystack-signature`. Raw body. No JWT.

Success response: `200` with `{ "success": true, "data": { "received": true } }` after the signature check, including duplicates. Bad signature: `400` `PAYMENT_VERIFICATION_FAILED`.

Handled effect for `charge.success`: mark the matching `provider_reference` as `SUCCESS`, then create offers for a booking fee or credit tokens for a pack. Other event names are acknowledged and recorded once a webhook-event store exists. They do not change balances.

## Notifications

### `GET /notifications`

Bearer. Paginated.

Proposed item: `{ "id", "channel", "title", "body", "data", "readAt", "createdAt" }`.

### `POST /notifications/{notificationId}/read`

Bearer, owner only. Schema is `{ "notificationId" }`. Proposed `data`: `{ "id", "readAt" }`.

## Admin

All admin routes: bearer and role `ADMIN`.

### `POST /admin/riders/{riderId}/review`

Body: `{ "decision": "APPROVED" | "REJECTED", "notes": "optional, max 500" }`. The schema also carries `riderId`.

Proposed `data`: `{ "riderId", "verificationStatus", "verificationNotes" }`.

### `POST /admin/users/{userId}/suspend`

Body: `{ "reason": "2 to 200 characters" }`. Proposed `data`: `{ "userId", "status": "SUSPENDED" }`.

Not in the schema, and not part of the first contract until the operations below are specified: unsuspend, service-zone create and update, audit log query. The tables can hold that data. The routes should not be invented in the client until `OPEN_DECISIONS.md` names them.

### Service zones

No public HTTP schema lists or edits zones. The service interface that exists is `assertPickupSupported`. Zone rows are admin data. A proposed later pair is `GET /admin/service-zones` and `POST /admin/service-zones` with name, active flag, GeoJSON polygon, and bounding box. It is not required for the mobile contract until an admin UI is built. Until then, zones are inserted by an operator with database access, which is an operational gap, not a mobile endpoint.

## Socket.IO

Handshake auth token is required. The server joins `user:{userId}`. After assignment it also uses `booking:{bookingId}` for the passenger and the assigned rider. Location is not emitted to `user:{passengerId}` for unrelated riders.

The server does not emit these yet. Names match Flutter `RealtimeEvents` and `RealtimeEvent`.

`booking.requested` to each offered rider's user room:

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

`booking.accepted` to the passenger user room and the booking room:

```json
{ "bookingId": "uuid", "riderId": "uuid", "acceptedAt": "2026-11-06T12:00:00.000Z" }
```

`booking.rejected` to the passenger user room:

```json
{
  "bookingId": "uuid",
  "riderId": "uuid",
  "rejectedAt": "2026-11-06T12:00:00.000Z",
  "bookingStatus": "REQUESTED"
}
```

`booking.cancelled`:

```json
{
  "bookingId": "uuid",
  "cancelledBy": "PASSENGER",
  "cancelledAt": "2026-11-06T12:00:00.000Z",
  "reason": "optional"
}
```

`cancelledBy` is `PASSENGER`, `RIDER`, `ADMIN`, or `SYSTEM`.

`booking.completed`:

```json
{ "bookingId": "uuid", "riderId": "uuid", "completedAt": "2026-11-06T12:00:00.000Z" }
```

`rider.location.updated` on the booking room only:

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

`rider.availability.updated`:

```json
{
  "riderId": "uuid",
  "availability": "AVAILABLE",
  "updatedAt": "2026-11-06T12:00:00.000Z"
}
```

`availability` is `OFFLINE`, `AVAILABLE`, or `BUSY`. Clients ignore GPS older than 30 seconds or timestamped in the future.

The server emits after the database transaction commits. Clients treat events as hints and refetch `GET /bookings/{id}` when that read exists.
