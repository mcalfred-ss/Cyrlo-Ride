# Cyrlo Ride master specification

Approved target for the local-ride pilot. This document is the product source of truth among the architecture docs. It is not a description of the running code.

**Current implementation** is called out where a reader could confuse it with the target. Business routes are not mounted. The Prisma booking enum is still `REQUESTED`, `ACCEPTED`, `CANCELLED`, `COMPLETED`, `EXPIRED`. The only staff role in code is `ADMIN`. The Flutter vehicle choices are okada, pragya, and aboboyaa. None of those are the approved target.

Nothing in this file authorizes a migration or a code change by itself.

## 1. Product scope

Cyrlo Ride is a local ride-hailing app for passengers and riders.

**Confirmed.**

- The passenger pays Cyrlo a booking fee of GH₵1.00, stored as 100 pesewas.
- The passenger pays the transport fare directly to the rider. Cyrlo does not collect or settle that fare. It has no column and no Paystack charge.
- Riders buy prepaid tokens. One token is deducted only when assignment succeeds. A rejected offer does not consume a token.
- School transport is a later product. It must not add school columns to a local booking.
- Cyrlo Maps is the Flutter package at `https://github.com/mcalfred-ss/cyrlo-map`, commit `d299ede80fb63ccaa3f8d8b2135f757897317dfd`. There is no hosted Cyrlo Maps HTTP API in this phase. Do not call `eqostack.cyrlomaps.com`. Do not wire `backend/src/infrastructure/maps/maps.provider.ts`.

## 2. System architecture

**Confirmed.** Preserve what the repository already is:

- One Flutter application, `apps/cyrlo_app`, with passenger and rider experiences in one install.
- One Node.js TypeScript process: Express, Socket.IO on that same HTTP server, Prisma, one PostgreSQL database.
- No Supabase or Firebase as the system of record.
- No microservices. Modules stay folders in `backend/src/modules`.
- Integer money in pesewas. Business rules stay in services, not in Flutter and not in controllers.

**Current implementation.** Health routes respond. Other routers are empty. Signup OTP `123456` is local to the app.

## 3. Actors and administrator permissions

Mobile actors are `PASSENGER` and `RIDER`. One phone number has one of those roles. OTP does not create staff.

**Confirmed** dashboard roles:

| Role | Scope |
| --- | --- |
| `SUPER_ADMIN` | Full platform administration, including the other three scopes, and granting or revoking staff roles |
| `OPERATIONS_ADMIN` | Rider application review, per-zone rider approval, suspension and reinstatement, service zones, operational monitoring |
| `FINANCE_ADMIN` | Payment reconciliation, token purchases, financial reports, and refunds that carry an explicit refund permission |
| `SUPPORT_ADMIN` | Booking complaints, disputes, and customer support. Read booking, status history, relevant GPS, and payment status |

**Confirmed.**

- Refund execution is its own permission. It is audited. Holding `SUPPORT_ADMIN` does not by itself execute a refund.
- Nobody can grant `SUPER_ADMIN` to themselves.
- Privileged staff sessions require MFA before the staff token is issued.
- Suspension and reinstatement require a reason and an audit entry. Only Operations Admin or Super Admin may do them.

**Current implementation.** `UserRole` is `PASSENGER`, `RIDER`, or `ADMIN`. The access token carries `sub` and `role`. `requireRole` is not mounted. There is no MFA and no four-way staff model.

**Proposed representation, not implemented.** Do not replace the mobile roles with the four staff roles in the same enum as the only change.

- Keep `PASSENGER` and `RIDER` as the only roles the mobile OTP flow can create.
- Staff accounts are created by a Super Admin, not by phone OTP.
- Store staff authority in `admin_role_grants` (`user_id`, `staff_role`, `granted_by`, `granted_at`, `revoked_at`). `granted_by` must differ from `user_id` when `staff_role` is `SUPER_ADMIN`.
- On each privileged request, load the grant from the database. Do not trust a stale token alone.
- The token may include `staffRole` so the client can choose a dashboard, but demotion, suspension, and MFA state are enforced from the database.
- Leave the existing `ADMIN` value only as a temporary label meaning "is staff" until grants exist. It is not the final permission model.

**Implemented in Milestone 2.** Staff MFA is TOTP (Google Authenticator compatible) with hashed recovery codes. WebAuthn remains optional future work. See `docs/architecture/ADMIN_RBAC_MILESTONE_2.md`.

## 4. Rider onboarding and verification

**Confirmed** flow:

1. The rider submits the application, vehicle facts, photographs, and the required verification documents.
2. Status becomes `PENDING_REVIEW`.
3. An Operations Admin or Super Admin reviews it.
4. The application becomes `APPROVED` or `REJECTED`.
5. Only an approved rider can go online.

Ghana Card verification is manual and mandatory.

**Confirmed** identity rules:

- The card number is never stored in plaintext. `rider_profiles.ghana_card_number` must stay empty and is not part of the target.
- The number is encrypted with a key that is not in the database and not in the Postgres dump.
- Images and document files live in private object storage. PostgreSQL stores a `storage_key` only.
- Ordinary rider and user APIs return verification status only. They do not return the number, ciphertext, storage key, or a document URL.
- Decrypt and document open are audited without copying the secret into the audit payload.

**Confirmed** launch vehicles:

| Category | Launch |
| --- | --- |
| Tricycle | Primary |
| Car | Supported |
| Motorcycle | Excluded |

The Flutter draft's okada, pragya, and aboboyaa choices are not the launch catalog. Aboboyaa is disabled in the current UI and is not the approved tricycle category. The target category codes are `TRICYCLE` and `CAR`.

**Confirmed** vehicle facts on the application: category, registration, make and model, colour, capacity, photographs, and the required vehicle documents.

**Current implementation.** Onboarding Zod fields are `fullName`, `vehicleRegistration`, and `vehicleDescription` only. The service throws `NOT_IMPLEMENTED`.

**Confirmed.** Object storage vendor is **Bunny.net** (Edge Storage uploads + CDN Advanced Token Authentication for short-lived download URLs). PostgreSQL still stores `storage_key` only.

**Unresolved.** The checklist of vehicle documents beyond photographs. Numeric limits for capacity. How long ciphertext and images are kept after rejection or account closure. Which key manager holds the encryption key.

## 5. Service zones

**Confirmed.**

- The administrative coverage area is Atwima Kwanwoma District, Ashanti Region.
- The district may be registered as that administrative area.
- Only operationally supported subareas are activated for the pilot.
- The initial pilot area is Ahenema Kokoben and selected areas that already have reliable rider coverage.
- Each zone or subarea has a geographic polygon and can be activated or deactivated on its own.
- A rider may be approved for more than one zone. Each zone has its own rider approval. Identity approval does not approve a zone.
- Matching uses only active zones and riders approved for the zone that contains the pickup.
- Deactivating a zone does not delete or rewrite historical bookings.
- Only Super Admin and Operations Admin may manage zones.
- Polygon coordinates are not in this specification. A boundary must be sourced and verified before that zone is activated. Do not invent coordinates.

**Current implementation.** `service_zones` stores a GeoJSON boundary, a bounding box, and `is_active`. There is no rider-to-zone approval table and no seed.

**Unresolved.** The sourced polygons, and which subareas besides Ahenema Kokoben are in the first activation.

## 6. Booking lifecycle

**Confirmed** statuses:

`AWAITING_PAYMENT`, `PAYMENT_FAILED`, `SEARCHING`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `EXPIRED`, `CANCELLED`.

`REQUESTED` is the current Prisma value. It is not the approved target.

**Confirmed** clocks:

- Unpaid timeout is 10 minutes from creation while the fee is not confirmed.
- The search timer is 5 minutes and starts only when the booking enters `SEARCHING` after the booking fee is confirmed. It does not start at creation.

**Confirmed** trip flow: `ACCEPTED → IN_PROGRESS → COMPLETED`. Only the assigned rider may start or complete the trip through the backend.

Passenger confirmation of completion is an acknowledgement. It does not change status unless a later decision says it does. That later decision does not exist.

**Target edges:**

| From | To | Who |
| --- | --- | --- |
| `AWAITING_PAYMENT` | `SEARCHING` | System, only after the fee payment is `SUCCESS` |
| `AWAITING_PAYMENT` | `PAYMENT_FAILED` | System, on provider failure, abandonment, or the 10-minute unpaid timeout |
| `AWAITING_PAYMENT` | `CANCELLED` | Passenger, or Operations / Super Admin |
| `SEARCHING` | `ACCEPTED` | The rider whose accept wins |
| `SEARCHING` | `EXPIRED` | System, when the 5-minute search ends with no winner |
| `SEARCHING` | `CANCELLED` | Passenger, or Operations / Super Admin |
| `ACCEPTED` | `IN_PROGRESS` | Assigned rider |
| `ACCEPTED` | `CANCELLED` | Passenger, assigned rider, or Operations / Super Admin |
| `IN_PROGRESS` | `COMPLETED` | Assigned rider |
| `IN_PROGRESS` | `CANCELLED` | Assigned rider when they cannot complete, or Operations / Super Admin |

A passenger cancel after `ACCEPTED` does not by itself move money. See section 10. Support records the request.

Every transition appends `booking_status_history` in the same transaction. History is immutable.

**Assumption, called out for approval.** The 10-minute unpaid timeout ends in `PAYMENT_FAILED`, not `EXPIRED`. `EXPIRED` is reserved for search expiry. The timeout duration is confirmed. The status name for that timeout was not given a separate label.

## 7. Matching algorithm

**Confirmed.**

- Radius is 5 km, straight line from the pickup to the rider's fresh GPS point. This is not a road route and not a fare.
- GPS must be no older than 30 seconds and not in the future. Sharing must be on.
- A batch contains at most 3 eligible riders.
- When a batch is exhausted, the next batch is sent. Batches continue until a rider is assigned or the 5-minute search ends.
- A rider who rejected an offer for this booking, or whose offer for this booking timed out, is not offered this booking again.
- The first valid acceptance wins inside one database transaction: lock the booking, update it only while `status = SEARCHING`, lock the wallet, re-check eligibility, insert the one token debit, mark the winning offer accepted, expire every other pending offer, append history, then commit.
- Search expiry expires every still-pending offer and sets the booking to `EXPIRED`.
- One booking has one accepted rider. Partial unique indexes are required: one `ACCEPTED` offer per booking, and one `ACCEPTED` or `IN_PROGRESS` booking per rider.

**Eligibility, all required:**

- Identity `APPROVED`, including Ghana Card verification.
- Approved for the active zone that contains the pickup.
- User is `ACTIVE`, not suspended.
- Online intent, fresh GPS, balance at least 1 token.
- Not the assigned rider of another `ACCEPTED` or `IN_PROGRESS` booking.
- Not previously rejected or timed out on this booking.
- Inside the 5 km radius.

**Confirmed.** Each offer stays open for **20 seconds**. If no rider in the batch accepts before that timeout (or all reject), those offers end and the next batch of up to 3 eligible riders may start. Search still ends at 5 minutes overall.

**Unresolved.** Which riders are chosen first when more than three are eligible (sort order only).

## 8. Rider availability

**Confirmed** product-facing states: `OFFLINE`, `ONLINE`, `OFFER_PENDING`, `ON_TRIP`, `SUSPENDED`.

Do not store all five as `RiderAvailability` values. The rider sets an intent. The server derives the rest.

**Recommended stored model.**

| Stored | Values | Who writes it |
| --- | --- | --- |
| Online intent | `OFFLINE` or `ONLINE` | Rider, except the trip rule below |
| Account status | existing `ACTIVE` or `SUSPENDED` | Operations Admin or Super Admin |
| Offers and bookings | `PENDING` offer, `ACCEPTED`, `IN_PROGRESS` | Matching and booking services |

**Recommended display.**

| Display | When |
| --- | --- |
| `SUSPENDED` | Account is suspended. This overrides the other displays |
| `ON_TRIP` | This rider is assigned to a booking in `ACCEPTED` or `IN_PROGRESS` |
| `OFFER_PENDING` | A `PENDING` offer exists and the rider is not on a trip |
| `ONLINE` | Intent is `ONLINE` and none of the rows above apply |
| `OFFLINE` | Intent is `OFFLINE` and the rider is not suspended and not on a trip |

**Current implementation.** The enum is `OFFLINE`, `AVAILABLE`, `BUSY`. `BUSY` is documented as server-set on accept. The target stops using `BUSY` as the trip state. `AVAILABLE` in current code corresponds to the `ONLINE` intent, not to the derived display `ONLINE`.

**Confirmed** rules:

- Offers go only to riders who are approved, active, approved for the pickup zone, fresh on GPS, and holding at least one token.
- The normal offline control does nothing while the rider is on an active trip (`ACCEPTED` or `IN_PROGRESS`).
- Stale GPS removes the rider from matching. It does not by itself cancel an assigned trip.
- Suspension immediately stops offers and online availability. It does not change the token balance.
- Only Operations Admin or Super Admin may suspend or reinstate, each time with a reason and an audit row.

**Unresolved.** Whether suspension aborts an assigned trip or only blocks new offers. Whether the rider may go offline while `OFFER_PENDING`, which would retire that offer.

## 9. Payment and token model

**Confirmed.**

- Booking fee: 100 pesewas, server-owned. Client does not send the amount.
- Paystack webhook signatures are HMAC-SHA512 over the raw body. The raw body is already retained on the request.
- Payment status moves only `PENDING → SUCCESS`, `PENDING → FAILED`, or `PENDING → ABANDONED`. `SUCCESS` is never rewritten to mean refunded.
- Each webhook delivery is its own row, unique on the provider event id. A replay is a no-op.
- Token catalog is server-owned. The client sends only a pack code.

**Provisional launch catalog.** Prices and quantities may change. They are the configured starting values, not a permanent tariff.

| Code | Tokens | Price |
| --- | --- | --- |
| `STARTER` | 20 | GH₵10 (1000 pesewas) |
| `STANDARD` | 50 | GH₵20 (2000 pesewas) |
| `PRO` | 150 | GH₵50 (5000 pesewas) |

**Confirmed** wallet rules:

- Lock the wallet row, then insert the ledger row, then set `token_balance` from the locked balance plus the delta.
- Purchases, debits, and refunds are idempotent.
- A debit uses `token-debit:booking:{bookingId}` and happens in the winning assignment transaction, not when an offer is sent and not when `IN_PROGRESS` starts.
- A token refund is a new `REFUND` row with `reverses_entry_id` pointing at that debit. The debit row is not updated or deleted.
- A fee refund is a new `payment_refunds` row in `REQUESTED`, `PROCESSING`, `SUCCEEDED`, or `FAILED`. The original payment stays `SUCCESS`.
- Balance cannot go negative. Those checks already exist in the first migration and must not be dropped.

**Current implementation.** `shouldRefundBookingFee` and `shouldRefundToken` are booleans. They do not encode the approved matrix. Do not add more flags to them. Replace them with a policy function that takes the situation in section 10 and returns two independent decisions: fee refund, token refund. The current functions stay until that replacement is written. They are not the target.

## 10. Cancellation and refund matrix

**Confirmed.** Fee refunds and token refunds are separate compensating records. Original payments and ledger entries stay immutable.

| Situation | Booking fee | Rider token |
| --- | --- | --- |
| No rider accepts before search expiry | Refund | No deduction |
| Passenger cancels during search | Refund | No deduction |
| Rider cancels after acceptance | Refund | Refund |
| Passenger cancels after acceptance | Support review. No automatic refund | No automatic refund |
| Rider cannot complete the trip | Refund | Refund |
| Trip completed | No refund | No refund |

Unpaid timeout and provider failure capture nothing, so there is no fee refund and no token debit.

`shouldRefundToken` currently refuses a refund when the rider cancels. The approved row refunds that token. That is a policy change, not a tweak to the boolean.

A passenger cancel after acceptance does not automatically return the fee or the token. Support may review it. Any money that is later returned is still a new refund record, executed only with the finance refund permission.

**Unresolved.** The criteria a reviewer uses to grant or refuse that post-acceptance passenger refund. Whether a dispute after `COMPLETED` can override the "no refund" row. The approved text says refunds follow this matrix, so an override is not granted here.

## 11. Trip completion and disputes

**Confirmed.**

- The assigned rider starts the trip (`IN_PROGRESS`) and completes it (`COMPLETED`).
- The passenger may record completion as an acknowledgement, or report a problem. The acknowledgement does not change status.
- The passenger or the rider may open a dispute within 24 hours after `COMPLETED` or `CANCELLED`.
- Support reviews status history, the GPS records kept for that trip, and the payment records.
- A dispute does not edit original financial rows. A refund, if the matrix allows one, is a compensating transaction.

**Current implementation.** There is no `IN_PROGRESS`, no acknowledgement column, no dispute table, and `rider_locations` keeps only the latest point. The latest point is not a reviewable trail.

The target therefore needs an append-only trip location log written while the rider is assigned, so support can review the trip. How long those points are kept after the 24-hour window is **unresolved**.

## 12. Notifications

**Confirmed.**

- Push is the primary channel.
- In-app notifications are persistent.
- SMS is used for OTP and for critical fallback.
- Sending a notification must not run inside the booking or payment transaction. A failed push or SMS does not roll back assignment, capture, or a ledger write. Deliver after commit.

**Current implementation.** The notification service and the push and SMS adapters throw `NOT_IMPLEMENTED`. In-app rows exist only as a table.

**Unresolved.** Which events count as critical SMS fallback, other than OTP. The push vendor.

## 13. Database requirements

The current migration is `20261106170000_init`. Do not treat this section as a migration. Objects the target needs and the database does not have:

| Object | Purpose |
| --- | --- |
| Statuses `AWAITING_PAYMENT`, `PAYMENT_FAILED`, `SEARCHING`, `IN_PROGRESS` | Approved lifecycle. Retire `REQUESTED` for new rows |
| `bookings.search_expires_at`, `bookings.payment_expires_at` | 5-minute search and 10-minute unpaid timeout |
| `booking_status_history` | Immutable transition log |
| `payment_webhook_events` | One row per provider event id |
| `payment_refunds` | Fee refund lifecycle, linked to the original payment |
| `token_ledger_entries.reverses_entry_id` | Token refund points at the debit |
| Foreign key from ledger `payment_id` to `payments` | Purchase credits cannot name a missing payment |
| `rider_identity_secrets` | Ciphertext, nonce, key version. No plaintext card number |
| Vehicle columns or a `rider_vehicles` row | Category `TRICYCLE` or `CAR`, registration, make and model, colour, capacity |
| Vehicle photographs and documents | `storage_key` rows, bytes outside Postgres |
| `rider_zone_approvals` | Separate approval per rider per zone |
| Zone kind or parent | Administrative district versus activated subarea |
| `trip_location_points` | Append-only GPS for the assigned trip, for disputes |
| `disputes` | Opened by passenger or rider, 24-hour limit, support outcome |
| `passenger_completion_acks` or a nullable acknowledgement time | Not a status |
| `admin_role_grants` | Four staff roles, grantor, no self-grant of Super Admin |
| `token_packs` | `STARTER`, `STANDARD`, `PRO` as configurable rows |
| Partial unique indexes | One accepted offer per booking. One active assigned booking per rider |
| `ON DELETE RESTRICT` on financial booking foreign keys | Deactivation and deletes must not null out fees or ledger rows |

Keep the existing non-negative balance checks and the one-successful-fee, one-debit, and one-refund partial indexes. Prisma does not model them. A later diff must not drop them.

## 14. API and Socket.IO requirements

**Current contract** in `API_CONTRACT.md` and `docs/API_DOCUMENTATION.md` matches the Zod files: booking status `REQUESTED`, availability `BUSY`, a single `ADMIN` role, and no pack catalog. That is the shape of unimplemented schemas. The target below replaces it where they differ. Paths that are not listed stay as in `API_CONTRACT.md` until a later contract revision. Live HTTP is still only health.

**Target changes:**

- Create booking returns `AWAITING_PAYMENT` and `paymentExpiresAt` (10 minutes). It does not return `REQUESTED`.
- Fee `SUCCESS` is the only transition into `SEARCHING`, with `searchExpiresAt`.
- Accept conflicts unless status is `SEARCHING`.
- Reject leaves the booking in `SEARCHING` while time and further batches remain. It does not leave the booking in `REQUESTED`.
- `POST /bookings/{id}/start` and `POST /bookings/{id}/complete` are assigned-rider only.
- `POST /bookings/{id}/acknowledge` records passenger acknowledgement and does not change status.
- `POST /bookings/{id}/disputes` is allowed for the passenger or the assigned rider for 24 hours after `COMPLETED` or `CANCELLED`.
- Availability body is intent `OFFLINE` or `ONLINE`. The response includes the derived display state. Clients do not send `BUSY`, `ON_TRIP`, or `SUSPENDED`.
- Onboarding accepts vehicle category, registration, make and model, colour, capacity, and document storage keys after upload. Category `MOTORCYCLE` is rejected.
- Token purchase accepts only `STARTER`, `STANDARD`, or `PRO` until the catalog rows change.
- Staff routes require a database grant, not merely `role === ADMIN`.
- Zone writes require Super Admin or Operations Admin.
- Refund execution requires the explicit finance permission.

Socket event names already shared by the app and `events.ts` stay. Payloads gain the target status values. `booking.accepted` is assignment. A later `booking.started` event is required for `IN_PROGRESS` and is not in the current event list. Location events on `booking:{id}` continue after accept. They are also appended to the trip location log.

## 15. Security and audit requirements

**Confirmed**, including controls already sketched in `SECURITY_AND_OPERATIONS.md`:

- OTP stored as HMAC, 5-minute lifetime, 5 attempts, 60-second resend. No fixed test code on the server.
- Access JWT pinned to `HS256`, 15-minute default. Refresh tokens are random, stored as hashes, rotated, and revocable.
- After verify, the user row must be `ACTIVE`.
- Role check plus ownership check on every business action. Unknown resources that are not the caller's return `404`.
- Paystack raw-body HMAC-SHA512. Amounts come from the stored row.
- Append-only audit for review, zone changes, suspension, reinstatement, refund execution, dispute outcome, and identity decrypt.
- Wallet and booking locks as in sections 7 and 9.
- Ghana Card rules in section 4.
- MFA for privileged staff. No self-promotion to Super Admin.

## 16. Pilot launch scope

**Confirmed.**

- Geography: Atwima Kwanwoma District as the administrative area. Operations start in Ahenema Kokoben and selected covered subareas. Polygons are not yet sourced.
- Recruitment target: 20 verified tricycle riders. Cars may also be approved. Motorcycles are out.
- Audience: a closed set of selected passengers before any public launch.
- Tokens: the provisional catalog in section 9.
- Fee: GH₵1.00. Transport fare remains off-platform.

**Not in the pilot.** School transport, motorcycle onboarding, a public district-wide launch, and invented zone coordinates.

## 17. Implementation phases

These phases order future work. They do not start it.

1. Replace booking and refund policy in services. Do not extend `shouldRefundBookingFee` or `shouldRefundToken`. Add the target statuses only when a migration is separately approved.
2. Staff grants, MFA, and audited suspend and review.
3. Encrypted identity, private documents, vehicle categories, per-zone approval.
4. Paystack fee and token purchase, webhook event rows, immutable refunds, locked wallet.
5. Search batches, single-winner accept, unpaid 10-minute timeout, search 5-minute timeout.
6. `IN_PROGRESS`, completion, acknowledgement, trip GPS log, 24-hour disputes.
7. Flutter: remove local OTP `123456`, replace okada/pragya/aboboyaa with tricycle and car, consume `cyrlo_maps` at the pinned commit, and follow server status and derived availability.
8. Notifications after commit: push, in-app, SMS for OTP.

Zone polygons are an operational input to phase 5, not a guess in the repository.

## 18. Remaining unresolved decisions

- Sort order when more than three riders are inside 5 km.
- Whether suspension cancels an assigned trip.
- Whether a rider may go offline during `OFFER_PENDING`.
- Criteria for a reviewed passenger-cancel refund after acceptance.
- Whether a dispute after `COMPLETED` can ever refund.
- MFA method.
- Encryption key manager, identity retention period.
- Vehicle document checklist beyond photographs, and capacity limits.
- Which SMS messages are critical besides OTP. Push vendor.
- Sourced and verified polygons, and the subarea list besides Ahenema Kokoben.
- How long trip GPS points are kept after the dispute window.

Resolved by this specification and no longer open: unpaid timeout (10 minutes), successive batches, per-offer response timeout (20 seconds), launch vehicles, token pack starting prices, four staff roles, `IN_PROGRESS`, passenger acknowledgement not changing status, dispute window (24 hours), and the refund matrix in section 10.
