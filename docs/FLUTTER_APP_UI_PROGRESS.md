# Flutter app UI progress

Session notes for `apps/cyrlo_app` — passenger + rider flows built and polished in the local Flutter client. Auth is **phone + OTP only** (no password / forgot-password). Much of this is still demo/local state until backend APIs are wired.

**Test OTP:** `123456`

---

## Product decisions locked in

| Topic | Decision |
| --- | --- |
| Auth | Ghana phone → OTP verify → choose role. No password. |
| Trip model | Pickup-only. Destination / fare stay off-app (agreed in person). |
| Request fee | GHS 1 request fee before a live request. |
| Contact sharing | Passenger and rider numbers are shared only while a request is live. |
| Rider approval | Auto-approved after documents for local testing. |
| Tokens | Rider packs: Starter 20 / GHS 10, Standard 50 / GHS 20, Pro 150 / GHS 50 (demo wallet). |
| Theme | Dark is the default. User can switch Light / Dark / System on Account. |

---

## Shared / shell

- Yellow `#F5C400` + dark grey brand system; light and dark `ThemeData`.
- Role shell with bottom nav for passenger and rider.
- Shared account screen for both roles (profile, support placeholders, appearance, sign out, delete account with alerts).
- Flow scaffold with optional back control.
- Success check animation after OTP verify.
- Themed illustrations: light JPG originals + generated `*_dark.jpg` variants; dark mode fills the card cleanly.
- Windows desktop platform scaffolded (needs VS C++ workload to run).

---

## Auth & onboarding

1. Splash → onboarding → welcome  
2. Create account (Ghana phone)  
3. Verify OTP (test `123456`) → short “Number verified” check animation  
4. Select role (Passenger / Rider)  
5. **Passenger:** details (name, DOB, gender, location / use my location) → home  
6. **Rider:** vehicle type (Okada / Pragya; Aboboyaa coming soon) → details → documents (ID type, front photo, plate, selfie) → home (approval skipped for testing)  

Back navigation:

- Passenger details → role select  
- Driver type → role select (circle back under last card)  
- Rider details / documents → previous onboarding step  

---

## Passenger app

### Home

- Greeting + notification bell  
- Nearby rider cards: avatar, name, vehicle type label (e.g. Okada rider), ★ rating + review count, ETA, status  
- Tap **avatar** → rider detail (name, type, ratings & reviews, request CTA)  
- Tap **card** → request flow  
- Map button → preview rider on map  

### Request flow

1. Confirm request  
2. Contact: use signup number or type another Ghana number  
3. Pay GHS 1 fee (demo)  
4. Open map to set pickup; destination stays off-app  

While live: mutual contact card; cancel / complete; nearby rider marked busy when accepted.

### Map

- Set pickup pin for the rider  
- Focus selected nearby rider  
- Contact card while request shares numbers  

### Rides

- Pickup-only history cards (no fare amounts)  

### Account

- Profile header, personal details  
- Appearance: System / Light / Dark  
- Support placeholders  
- Sign out + delete account (confirmation alerts)  

### Notifications

- Bottom sheet with demo items  
- Tap dimmed area (or drag) to dismiss  

---

## Rider app

### Jobs

- Incoming pickup cards: passenger avatar, name, ETA, “Pickup request” badge  
- Map button → **preview** passenger pin before accept (no phone until accept)  
- Accept / Cancel with confirm dialogs  
- Accept → opens pickup map; passenger side shows rider busy  

### Map

- Preview mode: Back / Accept  
- Accepted mode: navigate to pickup + shared passenger number + mark done  

### Token

- Wallet balance card  
- Buy Starter / Standard / Pro (confirm + demo top-up)  
- Recent activity list  

### Account

- Same shared account UI as passenger, plus vehicle & documents summary  

---

## Theme & visuals

- Default theme preference: **Dark**  
- Account → Appearance picker  
- Yellow primary buttons always use **black** label text  
- Dark-mode contrast fixes for chips, links (“Use my location”), pills, icons  
- Dedicated dark illustrations for welcome, onboarding, roles, and vehicles  

---

## Key paths

| Area | Path |
| --- | --- |
| Router | `apps/cyrlo_app/lib/core/routing/` |
| Theme | `apps/cyrlo_app/lib/core/theme/` |
| Auth | `apps/cyrlo_app/lib/features/auth/` |
| Passenger | `apps/cyrlo_app/lib/passenger_app/` |
| Rider | `apps/cyrlo_app/lib/rider_app/` |
| Shared UI / session | `apps/cyrlo_app/lib/shared/` |
| Illustrations | `apps/cyrlo_app/assets/illustrations/` |

---

## Still demo / next

- Live SMS OTP, Paystack (request fee + token packs)  
- Real nearby supply, matching, and persistence (signup is in-memory)  
- Help / Privacy / Terms destinations  
- Rider approval gate for production (currently auto-approve)  
- Persist theme preference across app restarts  
- Run on Windows after installing VS “Desktop development with C++”  

---

## How to run

```bash
cd apps/cyrlo_app
flutter pub get
flutter run
```

Widget smoke tests:

```bash
cd apps/cyrlo_app
flutter test test/widget_test.dart
```
