# Cyrlo Ride — App Store & Play Store setup

Repo prep is done for store registration. Use this when you open **App Store Connect** and **Google Play Console**.

## Locked identifiers (do not change after first upload)

| Platform | Value |
| --- | --- |
| App display name | `Cyrlo Ride` |
| Android `applicationId` | `com.cyrloride.app` |
| iOS bundle ID | `com.cyrloride.app` |
| Version | `1.0.0+1` in `apps/cyrlo_app/pubspec.yaml` |
| Privacy | https://eqostack.com/cyrlo/privacy |
| Terms | https://eqostack.com/cyrlo/terms |
| Support email | `eqostack@gmail.com` |

## What we prepared in the repo

- Unified package / bundle ID: `com.cyrloride.app`
- Android release signing reads `android/key.properties` when present (see `key.properties.example`)
- Cleartext HTTP disabled on Android
- Manifest / Info.plist queries for https, mailto, tel, WhatsApp
- iOS usage strings for location, camera, photos
- `ios/Runner/PrivacyInfo.xcprivacy` (phone, location, name, photos; no tracking)
- Portrait-only on iPhone

## Still needed outside the repo (Sharp / you)

### Accounts

1. **Apple Developer** (paid) — organization preferred for Ghana company/Eqostack
2. **Google Play Console** developer account
3. D‑U‑N‑S / legal entity details if registering as org

### Branding assets (create before listing)

| Asset | Spec |
| --- | --- |
| App icon | 1024×1024 PNG, no alpha (iOS); adaptive icon for Android |
| Feature graphic (Play) | 1024×500 |
| Screenshots | Phone: at least 2–8 per platform; 6.7" + 6.1" iPhone recommended |
| Short description | ≤80 chars (Play) |
| Full description | Store copy + pilot city (Kokobin) |
| Privacy policy URL | already live |

Launcher icons are generated from `apps/cyrlo_app/assets/branding/app_icon.png` via `flutter_launcher_icons`. To refresh after replacing that file:

```bash
cd apps/cyrlo_app
dart run flutter_launcher_icons
```

### Android (local AAB — not Codemagic)

Upload keystore lives only on this machine (gitignored):

- `apps/cyrlo_app/android/upload-keystore.jks`
- `apps/cyrlo_app/android/key.properties`
- password backup: `apps/cyrlo_app/android/upload-keystore.credentials.txt` (offline backup required)
- **Bunny off-site copy:** storage zone `cyrloride` → `android-signing/YYYY-MM-DD/upload-keystore.jks` (+ `upload-keystore.credentials.txt`). Download via Bunny dashboard or Storage API with the zone AccessKey — do not put this on the public CDN.

Because the folder name has a space, build from the **D:** junction and keep caches on **D:**:

```powershell
$env:GRADLE_USER_HOME = "D:\DevCaches\gradle"
$env:PUB_CACHE = "D:\DevCaches\pub-cache"
cd D:\Projects\CyrloRide2\apps\cyrlo_app
flutter build appbundle --release
```

AAB output:

`D:\Projects\CyrloRide2\apps\cyrlo_app\build\app\outputs\bundle\release\app-release.aab`

Upload that file in Play Console → Cyrlo Ride → Production/Internal testing → Create release.

### iOS (App Store) — Codemagic upload

Repo config: root `codemagic.yaml` (workflow `ios-app-store`).

**In Codemagic (once):**

1. [codemagic.io](https://codemagic.io) → add GitHub repo `Cyrlo-Ride`
2. Application settings → use **codemagic.yaml**
3. **Team integrations → Developer Portal**
   - Connect Apple Developer team
   - Add App Store Connect API key (reuse existing **Codemagic** key — do not create another unless `.p8` is lost)
   - Integration name must match `codemagic.yaml` (`Cyrlo` — already connected)
4. Code signing identities: **App Store** distribution cert + provisioning profile for `com.cyrloride.app` (not `online.cyrlo.app`)
5. App Store Connect must already have an iOS app record for `com.cyrloride.app` (first version can be incomplete; Codemagic uploads the IPA / TestFlight build)
6. Run workflow **Cyrlo Ride iOS (App Store)** → IPA goes to **TestFlight**

**CI notes (avoid re-fails):**

- This app uses **Flutter Swift Package Manager** (no `Podfile`). Do not add a CocoaPods install step.
- `APP_STORE_APPLE_ID` in Codemagic must be the **numeric** Apple ID from App Store Connect → App Information — never the bundle ID.
- Build numbers come from Codemagic `PROJECT_BUILD_NUMBER` so TestFlight won’t reject duplicate `CFBundleVersion`.
- 1024 app icon is RGB (no alpha). Export compliance is declared in `Info.plist` (`ITSAppUsesNonExemptEncryption=false`).

**In App Store Connect after a green build:**

1. Open version `1.0` → select the new build
2. Finish compliance / privacy questions if prompted
3. Submit for Review when listing + screenshots are ready

Local Archive is optional; Codemagic is the upload path.

```bash
# Local smoke only (optional)
cd apps/cyrlo_app
flutter build ipa --release
```

### Store questionnaire answers (pilot)

- **Category:** Travel / Maps & Navigation  
- **Age:** 18+ (Terms say 18+)  
- **Login:** Phone OTP required  
- **Location:** Yes, in-app only (pickup / nearby)  
- **Payments:** In-app booking fee via Paystack (disclose in Play Data safety / Apple privacy labels)  
- **Content rights:** Eqostack owns Cyrlo Ride  

### Data safety / privacy labels (map to live Privacy Policy)

Collect for app functionality (not tracking):

- Phone number  
- Name  
- Precise location (while using)  
- Photos / docs (rider verification)  
- Device IDs / diagnostics as applicable  

### Before first review

- [x] App launcher icons set from branding source  

- [ ] Upload keystore created + backed up offline  
- [ ] Ghana counsel review of Terms/Privacy (still drafts for counsel)  
- [ ] Test OTP on release builds against staging/production API  
- [ ] Confirm Paystack live vs test for store build  
- [ ] Drop Firebase `google-services.json` / `GoogleService-Info.plist` into the app (see [`FCM_PUSH_SETUP.md`](./FCM_PUSH_SETUP.md))
- [x] Enable staging `PUSH_PROVIDER=fcm` + service-account mount (`cirlo-ebdf5`)
- [x] Upload APNs Auth Key to Firebase Cloud Messaging (iOS) — Key ID `DF6ZT77N8Y`, Team `AWM6AHNR8J`

## Build dart-defines (optional production)

```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://cyrloride.eqostack.com/api/v1 \
  --dart-define=SOCKET_URL=https://cyrloride.eqostack.com
```

Defaults already point at staging; keep the same host until a dedicated production API exists.
