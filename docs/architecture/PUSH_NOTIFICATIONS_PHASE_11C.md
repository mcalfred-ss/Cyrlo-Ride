# Cyrlo Ride — Phase 11C: FCM HTTP v1 and Push Production Readiness

**Date:** 2026-11-07  
**Scope:** Migrate push delivery to FCM HTTP v1 with service-account OAuth; preserve Milestone 10 outbox, worker, device tokens, preferences, and Socket.IO.  
**Policy:** No new business notification events. No SMS vendor work. No Flutter screens. No VPS/Nginx/DNS changes.

---

## Existing push architecture discovered

| Piece | Finding |
| --- | --- |
| Transport | Single `PushProvider` used by the notification outbox worker |
| Prior adapter | Legacy FCM HTTP (`https://fcm.googleapis.com/fcm/send` + server key) |
| iOS path | **FCM → Firebase APNs** (Flutter iOS registration tokens). **No direct APNs provider** in this repository |
| Device tokens | `device_tokens` with `provider` default `FCM`; authenticated ownership; list APIs return `tokenPreview` only |
| Outbox | Milestone 10 claim/lock worker; per-channel `notification_deliveries`; push failure does not roll back business TX |
| Preferences | `pushEnabled` can cancel PUSH channel; cannot disable IN_APP / OTP |

**Decision:** Preserve FCM→APNs for iOS. Do not add a parallel direct APNs sender (would risk duplicate notifications).

---

## FCM HTTP v1 implementation

| Component | Location |
| --- | --- |
| Service-account loader | `backend/src/infrastructure/push/fcm-credentials.ts` |
| OAuth token provider | `backend/src/infrastructure/push/fcm-auth.ts` (`google-auth-library`, scope `firebase.messaging`) |
| HTTP v1 sender | `backend/src/infrastructure/push/fcm-http-v1.ts` |
| Factory / legacy bridge | `backend/src/infrastructure/push/push.provider.ts` |
| Live verify (opt-in) | `backend/scripts/verify-fcm-http-v1.ts` |

Endpoint: `POST https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send`  
Authorization: `Bearer <short-lived OAuth access token>`.

`outcome: 'sent'` means **FCM accepted the message for delivery**, not confirmed device receipt.

---

## Authentication and credential storage

- Credentials: Google **service account JSON file** mounted at `FCM_SERVICE_ACCOUNT_FILE`.
- Project: `FCM_PROJECT_ID` (used in the URL; mismatch with file `project_id` is logged, env wins for endpoint).
- Library: `google-auth-library` creates JWT assertions and exchanges them for access tokens.
- Scope: only `https://www.googleapis.com/auth/firebase.messaging`.
- Cache: in-memory token + expiry with refresh skew; concurrent callers share one in-flight refresh.
- Never stored in Postgres. Never sent to Flutter. Never committed to git.
- Private keys / OAuth tokens are not logged (auth errors sanitize PEM / `ya29.` prefixes).

Deprecated bridge: `PUSH_PROVIDER=fcm-legacy` + `PUSH_API_KEY` still constructs the old HTTP API. `PUSH_PROVIDER=fcm` **requires** HTTP v1 credentials and does not silently fall back to the server key.

---

## Android delivery

- Target: registration token only (`message.token`).
- Payload: `notification.title/body` + sanitized string `data` map from the outbox.
- `android.priority = HIGH`.
- Blocked data keys: OTP, Ghana Card, secrets, coordinates (aligned with outbox sanitizer).
- Preferences and outbox channel selection unchanged.

---

## iOS / APNs delivery path

- Same FCM HTTP v1 `messages:send` call.
- Message includes `apns.headers['apns-priority']=10` and `aps.alert` for Firebase’s APNs bridge.
- **Production readiness for iOS still requires** valid APNs key/certs configured in the Firebase console for the project. The API cannot verify that remotely without a live send.
- `THIRD_PARTY_AUTH_ERROR` is classified as a permanent operational failure (not device-token invalidation).

---

## Provider error classification

| Condition | Outcome | Token action |
| --- | --- | --- |
| `UNREGISTERED` / 404 / invalid registration token | `invalid_token` | Deactivate |
| `SENDER_ID_MISMATCH` | `invalid_token` | Deactivate |
| `QUOTA_EXCEEDED` / `RESOURCE_EXHAUSTED` / 429 | `retryable` | Keep |
| `UNAVAILABLE` / `INTERNAL` / 5xx / network / timeout | `retryable` | Keep |
| `UNAUTHENTICATED` / `PERMISSION_DENIED` / bad APNs (`THIRD_PARTY_AUTH_ERROR`) | `failed` | Keep (ops-visible) |
| Missing config | `failed` / `NOT_CONFIGURED` | N/A |

Worker behavior unchanged: only `invalid_token` deactivates; `retryable` uses existing outbox backoff; permanent failures do not retry indefinitely beyond existing attempt limits.

---

## Device-token lifecycle

Unchanged from Milestone 10:

- Authenticated register / refresh / deactivate / list (own user only).
- Platform `ANDROID` \| `IOS` \| `WEB`.
- Multiple devices per user; last-seen updated on successful provider acceptance.
- Full tokens never returned after registration (`tokenPreview` only).

---

## Outbox integration

- Provider calls remain outside business transactions (worker only).
- Push outage → IN_APP history + Socket path still complete; PUSH delivery marked failed/retryable.
- No second queue. No schema change required for Phase 11C.

---

## Required production configuration

| Variable | Purpose |
| --- | --- |
| `PUSH_PROVIDER=fcm` | Select HTTP v1 adapter |
| `FCM_PROJECT_ID` | Firebase project id |
| `FCM_SERVICE_ACCOUNT_FILE` | Path to mounted service-account JSON |
| `PUSH_API_KEY` | Deprecated; `fcm-legacy` only |

Readiness (`GET /ready`) exposes `push.configured`, `push.adapter`, `push.ready`, `push.projectId`, `push.iosPath` (no secrets).

---

## Live verification procedure

```bash
cd backend
FCM_LIVE_VERIFY=1 \
FCM_LIVE_DEVICE_TOKEN=<dedicated-test-token> \
FCM_LIVE_PLATFORM=ANDROID \
npx tsx scripts/verify-fcm-http-v1.ts
```

- Opt-in only (`FCM_LIVE_VERIFY=1`).
- Not part of `npm test`.
- Prints Firebase project id and `providerAcceptance` separately from `deviceReceiptConfirmed: false`.
- **Results:** Not run in this phase (no production/service-account credentials in the workspace).

---

## Files created and modified

### Created

- `backend/src/infrastructure/push/fcm-credentials.ts`
- `backend/src/infrastructure/push/fcm-auth.ts`
- `backend/src/infrastructure/push/fcm-http-v1.ts`
- `backend/src/infrastructure/push/fcm-http-v1.test.ts`
- `backend/scripts/verify-fcm-http-v1.ts`
- `docs/architecture/PUSH_NOTIFICATIONS_PHASE_11C.md`

### Modified

- `backend/src/infrastructure/push/push.provider.ts`
- `backend/src/config/env.ts`
- `backend/src/app.ts`
- `backend/src/common/routes/health.routes.ts`
- `backend/.env.example`, `backend/.env` (empty FCM placeholders)
- `backend/package.json` / lockfile (`google-auth-library`)
- `docs/architecture/PRODUCTION_DEPLOYMENT_CHECKLIST.md`

---

## Tests and typecheck

```bash
npm run typecheck
npm test
```

**Results (2026-11-07):** typecheck clean; **33 files / 164 tests passed**.

Contract coverage: service-account load, factory fail-closed, OAuth cache/coalesce, HTTP v1 Android payload + Bearer + project URL, iOS APNs block via FCM, invalid-token vs network vs auth classification, privacy stripping of OTP/coords. Existing Milestone 10 outbox/device-token tests remain intact.

---

## Migration status

**None.** Existing `device_tokens` / `notification_deliveries` models are sufficient. Applied only to `cyrlo_ride_app` if any future change is needed; legacy `cyrlo_ride` untouched.

---

## Remaining external setup

1. Create/download Firebase service account with FCM permission; mount file; set env vars.  
2. Configure APNs auth key in Firebase console for iOS.  
3. Run opt-in live verify against a dedicated test device.  
4. Remove any remaining reliance on legacy server keys (`fcm-legacy`).  
5. Confirm Flutter apps still obtain FCM registration tokens (unchanged client contract).

---

## Known limitations

- Device receipt / display is not observable from the API; only FCM acceptance.  
- iOS production readiness is blocked on Firebase APNs credential verification.  
- `PUSH_PROVIDER=fcm` without a readable service-account file fails closed on push send (in-app continues).  
- Legacy HTTP remains available only behind explicit `fcm-legacy` for emergency migration.
