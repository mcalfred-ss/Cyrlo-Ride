# Cyrlo Ride — Milestone 10: Notifications and communication delivery

## What was implemented

- Transactional notification outbox with claim/lock, retries, stale reclaim, dead-letter.
- Background worker delivering IN_APP history, FCM push, and optional SMS (never OTP via outbox).
- Device-token registration/refresh/deactivation (authenticated ownership).
- In-app notification list/get/read/unread-count APIs.
- Basic preferences (`pushEnabled`, `optionalSmsEnabled`) that cannot disable OTP or mandatory in-app history.
- Socket.IO `notification.created` emit after durable in-app persist (outage-safe via history).
- Existing `enqueueInAppNotification` now schedules outbox (async); `scheduleNotificationInTx` for same-TX writes.

## Existing infrastructure reused

| Piece | Status |
| --- | --- |
| `notifications` table | Extended (eventType, category, entity, outboxId) |
| `enqueueInAppNotification` | Reworked to outbox scheduler |
| SMS adapter (`createSmsProvider`) | Unchanged OTP path; worker uses same adapter for optional SMS |
| Push adapter | Expanded Memory/FCM HTTP + unconfigured fail-closed |
| Socket.IO auth + `user:{id}` rooms | Reused; added notification publish helper |
| Matching/unpaid workers pattern | Same interval/unref style for outbox worker |

## Event catalogue

Producers remain the Milestone 1–9 business modules. Outbox event types are inferred or passed through titles/metadata; worker does not invent lifecycle transitions.

| Area | Examples already emitted by producers |
| --- | --- |
| Booking/payment | awaiting payment, paid/searching, failed, expired, cancelled, refund queued/submitted/completed/failed |
| Matching | new offer, offer timed out/invalidated, rider assigned, search expired |
| Trip | started, completed, rider cancelled, unable to complete, passenger cancel request, dispute updates |
| Wallet | purchase initialized/success/failed, tokens credited |
| Auth OTP | **Direct SMS adapter only** — never written to outbox/history/logs |

## Architecture

1. Business TX (preferred): `scheduleNotificationInTx(tx, …)`  
2. After-commit helpers: `enqueueInAppNotification` → outbox insert (never throws; never sends push/SMS inline)  
3. Worker claims `PENDING` with `FOR UPDATE SKIP LOCKED`  
4. Per channel `notification_deliveries` status  
5. IN_APP upsert by `outboxId` (dedupe) → optional Socket emit  
6. PUSH to active device tokens; invalidate only on provider unregistered/invalid  
7. Optional SMS only if preference enabled (not OTP)

### Retry policy (configurable)

| Setting | Default |
| --- | --- |
| `NOTIFICATION_OUTBOX_MAX_ATTEMPTS` | 5 |
| Base backoff | 5s exponential, cap 300s, +jitter |
| `NOTIFICATION_OUTBOX_POLL_MS` | 3000 |
| `NOTIFICATION_STALE_PROCESSING_MS` | 120000 |

## APIs

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/notifications` | User |
| GET | `/api/v1/notifications/unread-count` | User |
| POST | `/api/v1/notifications/read-all` | User |
| GET | `/api/v1/notifications/:id` | User |
| POST | `/api/v1/notifications/:id/read` | User |
| GET/POST/PATCH/DELETE | `/api/v1/notifications/devices…` | User (own tokens) |
| GET/PATCH | `/api/v1/notifications/preferences` | User |

## Production environment

| Variable | Purpose |
| --- | --- |
| `SMS_PROVIDER` / `SMS_API_KEY` / `SMS_SENDER_ID` | OTP + optional SMS (prod fails closed if unset) |
| `PUSH_PROVIDER=fcm` / `PUSH_API_KEY` | FCM server key (Flutter iOS typically via FCM) |
| `NOTIFICATION_OUTBOX_*` | Worker tuning |

### Worker operation

Started from `createApp()` when `NODE_ENV !== 'test'` alongside matching/unpaid workers. Deploy the API process with DB access; no Redis required. Monitor outbox counts via `getNotificationOutboxStats`.

## SMS provider status

Named vendor adapters remain stubs when credentials are set without a wired vendor (same as M1). Development uses no-op sender that never logs OTP bodies. OTP stays on auth’s direct `SmsProvider.send`.

## Security / privacy

- Own-user notification and device scoping only.
- Metadata sanitizer strips OTP/coords/secrets keys.
- Push payloads are string maps of IDs/safe fields.
- No Ghana Card / payment secrets in outbox.

## Test / typecheck / migration status

| Check | Result |
| --- | --- |
| `npx prisma migrate deploy` | Applied `20261107120000_notifications_outbox` to **`cyrlo_ride_app`** |
| `npm run typecheck` | Passed |
| `npm test` | **24 files / 119 tests passed** |

Postgres coverage includes transactional outbox + dedupe, worker idempotent delivery, invalid-token deactivation, and ownership isolation.

## Known limitations

- Existing producers mostly schedule outbox after commit (legacy helper); prefer `scheduleNotificationInTx` for new TX-critical paths.
- Critical SMS event set beyond OTP remains unresolved (preferences gate optional SMS only).
- FCM HTTP legacy API used when configured; APNs certificates stay in Firebase for Flutter iOS.
- No admin outbox UI; operational stats helper only.
- Time-sensitive offer staleness filtering is best-effort via business state; worker does not re-validate every offer deadline before push.
