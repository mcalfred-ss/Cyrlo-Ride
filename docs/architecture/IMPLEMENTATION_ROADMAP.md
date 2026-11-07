# Implementation roadmap

This sequence starts from the repository as it is. It does not replace the Flutter design system, the module layout, the Prisma schema, or the tested domain functions. Each step is blocked until this architecture set is approved. Nothing in the list is authorization to start coding now.

School transportation is not a step.

## 0. Approve the plan

The product target is `CYRLO_RIDE_MASTER_SPEC.md`. Radius, search length, unpaid timeout, successive batches, launch vehicles, the starting token catalog, and the refund matrix are decided. Do not treat them as open. Remaining blockers are listed in that spec's section 18. SMS vendor still blocks real OTP. Per-offer batch timing still blocks the matcher loop. Polygon data still blocks the first live zone.

## 1. Keep the foundation

Keep `location-freshness.ts`, `zone-geometry.ts`, token hashing, Paystack signature verification, and the financial SQL constraints. Replace `booking-rules.ts` when the target statuses and refund matrix are implemented. Do not preserve `REQUESTED` or the boolean refund helpers as the product machine. Register routes on the existing empty routers. Call the services. Delete a file only if it is unused after a feature lands and a test covers the replacement.

Leave `infrastructure/maps/maps.provider.ts` unwired. Add `cyrlo_maps` as a git dependency pinned to `d299ede80fb63ccaa3f8d8b2135f757897317dfd` when the map screen is built. Do not copy the package into this repo.

## 2. Authentication and profiles

- Implement `auth` against `otp.ts` and `tokens.ts`.
- Send SMS through the existing provider interface.
- Persist refresh hashes and rotate them.
- Point `SignupController` at `POST /auth/otp` and `POST /auth/otp/verify`. Remove `123456` as a success condition.
- Store the refresh token in secure storage.
- `GET /users/me` and `PATCH /users/me` replace the local passenger name.
- Router redirect follows the server role and rider `verificationStatus`, not only the in-memory draft.

Exit: a restarted app restores the session, a wrong code fails, and a phone cannot hold both roles.

## 3. Rider onboarding and admin review

- `POST /riders/onboarding` writes the profile, an empty wallet, and the launch vehicle (`TRICYCLE` or `CAR`). Motorcycle is rejected. The current three-string schema is not the target.
- Document upload waits on the object-storage choice. Images do not go into PostgreSQL. The Ghana Card number is encrypted, never plaintext.
- `POST /admin/riders/{id}/review` and suspend, with audit rows.
- The approval screen leaves the waiting state because the API says `APPROVED`, not because a local method was called.

Exit: an unapproved rider cannot set `AVAILABLE`.

## 4. Payments and wallet

- Paystack initialize and webhook behind the signature helper.
- Booking fee fixed at 100 pesewas. Token credit from the approved pack catalog.
- Ledger writes use the existing idempotency keys.
- `GET /wallet` on the Token tab.

Exit: replayed webhooks do not double-credit. The database rejects a negative balance.

## 5. Zones, location, availability

- Insert at least one service zone through the operator path chosen in the open decisions.
- `POST /locations/rider` and stop.
- `POST /riders/availability` enforces approved, fresh GPS, and token balance.
- Flutter uses `cyrlo_maps` `DeviceLocationService` for the rider fix and sends it to the API.

Exit: a rider with a stale point is not eligible. Offline stops sharing.

## 6. Bookings and matching

- `POST /bookings` checks the zone and does not create offers.
- Webhook success creates offers.
- Accept and reject use `assertOfferTransition` and `assertBookingTransition`.
- Accept debits one token in the same transaction and sets `BUSY`.
- Cancel and complete apply `shouldRefundBookingFee` and `shouldRefundToken`.
- Emit socket events after commit.
- Replace passenger Home / Rides placeholders and rider Jobs with these calls.

Exit: two accepts cannot debit two tokens. A rejected offer leaves the booking `REQUESTED`.

## 7. Map and live tracking

- Passenger map is `CyrloMapView` with pickup and destination markers.
- Directions are a preview. Failure still allows submit of the two coordinates.
- After accept, `rider.location.updated` moves the marker with `MarkerMotion`.
- No geocoding calls until a provider exists. Labels stay optional text.

Exit: the passenger sees the assigned rider move. They do not see other riders' raw locations.

## 8. Hardening before any deployment plan

- OTP-specific rate limits.
- Refresh reuse detection.
- Webhook event identity for replays.
- Backup script scheduled only when a server exists, plus one restore drill.
- Production env refine for Paystack and SMS.
- Flutter and backend tests for the paths above. Domain tests stay green.

Deployment (Nginx, PM2, TLS, firewall) is a separate plan. Do not start it from this roadmap.

## Explicitly later

- School extracts, `SchoolCatalog`, and any school schema.
- Place search and geocoding providers.
- A fare field. Do not add one.
- Socket.IO clustering.
- A hosted Cyrlo Maps API.
