# Business rules

These rules are the product behaviour the modules must implement. Booking transitions, refund decisions, GPS freshness, and zone geometry already have tested functions. Creating a ride, taking payment, and moving tokens are not implemented yet.

## Accounts

One phone number has one user and one role: passenger or rider. The passenger app path and the rider app path are two experiences in the same install. Verify OTP creates the user on first success and rejects the attempt when the phone already belongs to the other role. Admin users are not created from the mobile OTP flow.

OTP codes last 5 minutes, allow 5 attempts, and can be sent again after 60 seconds. Only a hash of the code is stored.

## Where rides can start

A pickup must fall inside an active service zone. The check uses the zone bounding box and then the GeoJSON polygon. Destinations can be stored outside the zone; the pickup is what must be supported.

## Who can be offered a ride

A rider is eligible only when all of these are true:

- verification status is `APPROVED`
- availability is `AVAILABLE`
- token balance is at least 1
- location sharing is on
- GPS `recordedAt` is no older than 30 seconds and is not in the future
- the rider is not already on an `ACCEPTED` booking

`BUSY` is assigned by the server when the rider accepts. The rider can set only `AVAILABLE` or `OFFLINE`. Offline stops precise location sharing.

## Booking

The passenger sends pickup and destination coordinates. The server checks the zone, confirms the GHS 1.00 booking fee from Paystack, then offers the request to eligible riders.

The fare for the motorcycle ride is agreed and paid between the passenger and the rider. Cyrlo does not collect that fare.

Riders accept or reject an offer. Rejecting does not close the passenger's request. The booking stays `REQUESTED` until a rider accepts, the passenger or an operator cancels it, or the system expires it.

Status changes are checked with `assertBookingTransition` and `assertOfferTransition`. The client cannot set an arbitrary status.

Both sides hear the result over Socket.IO on the user room, and on `booking:{bookingId}` once a rider is assigned. Location updates go only to that booking room.

## Booking fee

The passenger pays Cyrlo GHS 1.00 (`100` pesewas) through Paystack. The amount is fixed on the server.

The fee is kept when a rider has accepted. It is refunded when the passenger cancels before acceptance or the request expires with no acceptance. A failed or abandoned payment never creates an offer.

The Flutter app cannot mark the fee as paid. The Paystack webhook is verified with HMAC SHA-512 over the raw body. A bad signature is rejected.

## Rider tokens

Riders buy token packs through Paystack. The pack code is sent by the app. The token count and price come from the server.

One token is debited when the rider accepts, in the same transaction as the status change. The idempotency key is `token-debit:booking:{bookingId}`.

The token is refunded when an accepted booking is cancelled by the passenger, an admin, or the system before completion. The key is `token-refund:booking:{bookingId}`.

The token is not refunded when the ride completes or when the rider cancels after accepting. Rejecting an offer costs nothing.

The balance cannot go negative. Every change writes a ledger row with the resulting balance.

## Live location

Riders share location while online through an authenticated socket or the location route. Passengers receive the assigned rider's location only after acceptance. Readings older than 30 seconds are stale and are not shown as live. Offline riders are not shareable.
