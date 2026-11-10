# Flutter live API smoke (Steps 1–5)

Run against staging `https://cyrloride.eqostack.com` with a real OTP.

## Step 1 — Rider onboarding

1. New rider: OTP → choose **Tricycle** or **Car**.
2. Enter name, licence number, licence expiry, Ghana Card `GHA-XXXXXXXXX-X`.
3. Enter vehicle registration / make / model / colour / capacity.
4. Upload all 7 document kinds → **Submit for approval**.
5. Confirm Bunny receives files and `GET /riders/onboarding` is `PENDING_REVIEW`.
6. Ops approve via admin API; app approval screen should unlock to Jobs within ~15s (or pull **Check status**).

## Step 2 — Availability + offers

1. Approved rider: **Go online** (location permission required).
2. Confirm GPS posts and availability is `AVAILABLE`.
3. With a searching booking, offers appear on Jobs; accept/reject hit matching API.

## Step 3 — Booking + Paystack fee

1. Passenger home → **Request a ride** → Tricycle/Car.
2. Paystack webview opens for booking fee.
3. After pay, booking should move to `SEARCHING` (webhook). Map shows searching/active state.

## Step 4 — Lifecycle + history

1. Rider accept → start (auto on end if needed) → **End trip** calls complete.
2. Passenger **Rides** tab lists bookings from `GET /bookings`.

## Step 5 — Wallet

1. Rider Token tab loads packages/balance/ledger from API.
2. Buy pack opens Paystack; refresh balance after webhook.

## Known gaps

- No passenger nearby-supply endpoint yet (markers stay empty; matching is server-side).
- Destination picker is temporary (offset from pickup) until places UI lands.
- Socket booking events are not emitted by backend; offers/status use polling.
