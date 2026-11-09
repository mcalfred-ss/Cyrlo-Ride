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

Current launcher icons are Flutter defaults — **replace with Cyrlo brand** before submit.

### Android signing (Play upload key)

```bash
cd apps/cyrlo_app/android
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cp key.properties.example key.properties
# fill storePassword / keyPassword / paths
```

Build:

```bash
cd apps/cyrlo_app
flutter build appbundle --release
# output: build/app/outputs/bundle/release/app-release.aab
```

### iOS (App Store)

1. Create App ID `com.cyrloride.app` in Apple Developer
2. In Xcode: open `ios/Runner.xcworkspace`, set Team, signing
3. Confirm `PrivacyInfo.xcprivacy` is in the Runner target (Copy Bundle Resources)
4. Archive → Upload

```bash
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

- [ ] Replace default app icons with brand  
- [ ] Upload keystore created + backed up offline  
- [ ] Ghana counsel review of Terms/Privacy (still drafts for counsel)  
- [ ] Test OTP on release builds against staging/production API  
- [ ] Confirm Paystack live vs test for store build  
- [ ] FCM later for push (optional for v1; in-app notifications already work)  

## Build dart-defines (optional production)

```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://cyrloride.eqostack.com/api/v1 \
  --dart-define=SOCKET_URL=https://cyrloride.eqostack.com
```

Defaults already point at staging; keep the same host until a dedicated production API exists.
