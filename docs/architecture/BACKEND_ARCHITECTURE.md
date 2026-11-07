# Backend architecture

The backend that already exists is the architecture to keep: one Node.js TypeScript process, one Express app, one HTTP server, one Socket.IO server, one Prisma client, one PostgreSQL database. Modules are folders, not services. This phase does not add a process.

Business routes are mounted as empty routers. GPS freshness, zone geometry, OTP hashing, JWT verify, and Paystack signature checks already exist and stay. Booking transitions in `booking-rules.ts` and the boolean refund helpers are current code. They still use `REQUESTED` and they do not implement the approved refund matrix. Replace those helpers when the target is built. Do not teach Flutter or controllers to reimplement them, and do not add flags to `shouldRefundBookingFee` or `shouldRefundToken`.

The four dashboard roles and the derived rider availability states are specified in `CYRLO_RIDE_MASTER_SPEC.md`. The code enum `ADMIN` and `RiderAvailability` (`OFFLINE`, `AVAILABLE`, `BUSY`) are not that model.

Cyrlo Maps is consumed by the Flutter app at commit `d299ede80fb63ccaa3f8d8b2135f757897317dfd`. `infrastructure/maps/maps.provider.ts` stays unwired. There is no Cyrlo Maps HTTP dependency.

## Process

```text
Nginx (later, TLS) -> Node HTTP :3000
                       |- Express /api/v1
                       |- Socket.IO (same port, JWT handshake)
                       |- Prisma -> PostgreSQL on localhost
```

PM2 `instances: 1` is the intended production shape because Socket.IO rooms are in memory. Clustering waits until a shared adapter is actually required. That deployment is out of scope for this phase. The code already assumes a single process: `server.ts` owns one `Server`.

## Module pattern

Each business module already has this shape:

```text
index.ts              public factory: service + router
module.routes.ts      HTTP. Currently returns an empty Router
module.controller.ts  empty class
module.schema.ts      Zod input. This is the contract source
module.service.ts     throws NOT_IMPLEMENTED
module.repository.ts  Prisma access, unused by HTTP
module.types.ts
module.test.ts        asserts NOT_IMPLEMENTED
```

`src/composition.ts` is the composition root. It constructs every module with `{ prisma }`.

Rule already stated in `docs/ARCHITECTURE.md` and matched by the folders: another module may depend on an exported service interface. It must not import another module's repository. Shared adapters live in `src/infrastructure` and do not call repositories.

Controllers stay thin: authenticate, validate with the module schema, call the service, map `AppError` to the JSON envelope. The error handler already does the last step. Business decisions stay in services and in the pure functions that already exist (`booking-rules.ts`, `location-freshness.ts`, `zone-geometry.ts`).

## Modules

| Module | Owns | Depends on | Status in source |
| --- | --- | --- | --- |
| `auth` | OTP challenge, access JWT, refresh-token hash, rotation, revocation | `users` only to create or load the account on verify. SMS adapter to send the code | Schema and token/OTP helpers exist. Service unimplemented. Router empty |
| `users` | `User`, `PassengerProfile` | own tables | `GET /users/me` and passenger rename specified. Unimplemented |
| `riders` | `RiderProfile`, documents, availability | `users`, `wallet` (wallet row created with the profile), `audit` | Onboarding and availability schemas exist. Vehicle type is not in the schema. Unimplemented |
| `service-zones` | Active polygons and pickup coverage | own table, `zone-geometry.ts` | Geometry helpers tested. Service unimplemented |
| `locations` | Latest rider GPS | `riders` (only a rider updates own row) | Freshness helper tested. Update schema exists. Unimplemented |
| `wallet` | Token balance and ledger | own tables, financial constraints | Idempotency key helpers exist. Service unimplemented |
| `payments` | Paystack initialize and webhook | `wallet` for token credit, `bookings` only to attach a fee. Signature helper tested | Schemas exist. Service unimplemented. No Paystack HTTP client yet |
| `matching` | Who is offered, accept, reject | `riders`, `locations`, `wallet`, `service-zones`, `bookings` | Offer transition rules tested. Accept/reject schema is `{ bookingId }`. Unimplemented |
| `bookings` | Create, cancel, complete, expiry | `matching`, `payments`, `service-zones`, `notifications`, `audit` | Transition and refund predicates tested. Create schema exists. Unimplemented |
| `notifications` | In-app rows, and calls to SMS/push adapters | adapters only | List/mark-read schema started. Adapters throw `NOT_IMPLEMENTED` |
| `audit` | Append-only `audit_logs` | none | Service unimplemented |
| `admin` | Review rider, suspend user, later zone edits and audit reads | other services, `requireRole('ADMIN')` | Review and suspend schemas exist. Unimplemented |

`notifications` and `audit` are leaves. `auth` and `users` do not call ride modules. `bookings` is the ride orchestrator. `admin` may call the others. That direction is the one already documented, and the current constructors do not violate it because no service calls another service yet. The first implementation must pass interfaces through the composition root rather than importing repositories across modules.

If two writes must commit together (accept offer, set booking `ACCEPTED`, set rider `BUSY`, debit one token), the bookings or matching service owns the Prisma transaction and calls the wallet service with the same transaction client. The idempotency keys in `IdempotencyKey` are the retry identity.

## Infrastructure adapters

| Adapter | File | Now | Later |
| --- | --- | --- | --- |
| Prisma | `infrastructure/database/prisma.ts` | Client exists | Used by repositories when features are implemented |
| SMS | `infrastructure/sms/sms.provider.ts` | Throws `NOT_IMPLEMENTED` | Vendor chosen in `OPEN_DECISIONS.md`. Auth depends on the interface, not a vendor SDK in the service |
| Push | `infrastructure/push/push.provider.ts` | Throws `NOT_IMPLEMENTED` | Same |
| Paystack | `infrastructure/payments/paystack.ts` | Signature verify only | Initialize, verify, and refund HTTP live beside the signature check |
| Maps | `infrastructure/maps/maps.provider.ts` | Throws `NOT_IMPLEMENTED` | Leave unused. Device `cyrlo_maps` draws routes. This is not a Cyrlo Maps API |
| Realtime | `infrastructure/realtime/socket.ts`, `events.ts` | Auth handshake, `user:{id}` room, payload types | Services emit after a successful transaction. They do not emit before commit |

`MAPS_PROVIDER` and `MAPS_API_KEY` in `.env.example` are unused. Do not point them at a hosted Cyrlo Maps deployment.

## School transportation boundary

Local ride is the only product in the schema. `Booking` has pickup, destination, a rider, and a fee. It does not have a school, a student, a guardian, or a route.

Keep it that way until school transport is specified. A later module (`school-transport` or equivalent) may share `auth`, `users`, `payments`, and `notifications`. It should not add nullable school columns to `bookings` as a shortcut, and it should not change token or fee rules for local rides. `cyrlo_maps` can parse a bundled school extract on the client without a backend. That parser is not a school-transport domain model.

No school tables, routes, or screens are added in the implementation that follows this plan until a separate approval says so.

## What not to build

- Microservices, or a second database per module.
- Supabase or Firebase as the system of record.
- A Cyrlo Maps service.
- Business rules inside Flutter that the server does not also enforce. The local OTP `123456` is a UI stand-in and must be removed when `auth` is real.
- A general-purpose status field the client can set. Transitions go through `assertBookingTransition` and `assertOfferTransition`.
