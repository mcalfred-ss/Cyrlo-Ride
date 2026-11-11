# Cyrlo Ride — FCM push setup (passenger + rider)

One Flutter binary; both roles register the same way after OTP login.

## 1. Firebase console (once)

Staging uses Firebase project **`cirlo-ebdf5`** (apps registered for package/bundle `com.cyrloride.app`).

1. Open [Firebase Console](https://console.firebase.google.com/) → project `cirlo-ebdf5` (or create/reuse).
2. Add **Android** app: package `com.cyrloride.app` → download `google-services.json` → place at  
   `apps/cyrlo_app/android/app/google-services.json` (gitignored).
3. Add **iOS** app: bundle `com.cyrloride.app` → download `GoogleService-Info.plist` → place at  
   `apps/cyrlo_app/ios/Runner/GoogleService-Info.plist` (gitignored).
4. **Project settings → Cloud Messaging → Apple app configuration** → upload APNs Auth Key (`.p8`) from Apple Developer (required for iOS delivery; Android FCM works without it).  
   Done for `com.cyrloride.app`: Key ID `DF6ZT77N8Y`, Team ID `AWM6AHNR8J` (dev + production).
5. **Project settings → Service accounts → Generate new private key** → save JSON privately (never commit).

## 1b. Codemagic (once)

`GoogleService-Info.plist` / `google-services.json` stay gitignored. Inject them in CI via secure group **`firebase_credentials`**:

```powershell
# From a machine that has the real files:
[Convert]::ToBase64String([IO.File]::ReadAllBytes(
  "apps\cyrlo_app\ios\Runner\GoogleService-Info.plist"))
[Convert]::ToBase64String([IO.File]::ReadAllBytes(
  "apps\cyrlo_app\android\app\google-services.json"))
```

In Codemagic → Application → Environment variables → group `firebase_credentials` (secure):

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_INFO_PLIST_BASE64` | iOS plist base64 |
| `GOOGLE_SERVICES_JSON_BASE64` | Android JSON base64 |

`ios-app-store` and `android-play-store` workflows already decode these before building.

## 2. Staging API (VPS)

Copy the service-account JSON to the host, then:

```bash
sudo install -d -m 750 -o root -g cyrlo-ride /etc/cyrlo-ride/secrets
sudo install -m 640 -o root -g cyrlo-ride ./cyrlo-ride-firebase-adminsdk.json \
  /etc/cyrlo-ride/secrets/firebase-adminsdk.json

# Append to /etc/cyrlo-ride/providers.env (or ride.env):
PUSH_PROVIDER=fcm
FCM_PROJECT_ID=<firebase-project-id>
FCM_SERVICE_ACCOUNT_FILE=/etc/cyrlo-ride/secrets/firebase-adminsdk.json

sudo systemctl restart cyrlo-ride-api cyrlo-ride-worker
```

Helper: `backend/scripts/setup-staging-fcm.sh` (run on the VPS after scp’ing the JSON).

## 3. App behaviour

After auth, Flutter:

1. Initializes Firebase (no-op if native config files missing)
2. Requests notification permission
3. `POST /api/v1/notifications/devices` with `{ token, platform: ANDROID|IOS, provider: FCM }`
4. Refreshes token via `onTokenRefresh`
5. Deactivates device on sign-out / delete-account

Existing outbox events (offers, booking updates, etc.) deliver PUSH to registered devices.

## 4. Smoke

```bash
# Device API (any signed-in user JWT):
curl -sS -X POST https://cyrloride.eqostack.com/api/v1/notifications/devices \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"smoke-test-token-abcdefgh","platform":"ANDROID","provider":"FCM"}'

# Live FCM (optional, needs real device token + staging FCM env):
cd backend
FCM_LIVE_VERIFY=1 FCM_LIVE_DEVICE_TOKEN=<token> FCM_LIVE_PLATFORM=ANDROID \
  npx tsx scripts/verify-fcm-http-v1.ts
```
