# Review and QA test accounts

Phone OTP normally requires SMS. For **internal QA** and **Apple App Store / Google Play** review, staging (and production when submitting) uses an allowlisted set of numbers with a **fixed OTP**. Those numbers never receive SMS.

## Fixed OTP

| Field | Value |
| --- | --- |
| OTP | `246810` |

Tap **Send code**, then enter `246810`. No SIM required.

## Accounts

| Use | Role | Phone (Ghana E.164) | App path |
| --- | --- | --- | --- |
| Internal QA | Passenger | `+233555010001` | Continue as Passenger |
| Internal QA | Rider (approved Pragya) | `+233555010002` | Continue as Rider |
| App Store / Play review | Passenger | `+233555010011` | Continue as Passenger |
| App Store / Play review | Rider (approved Pragya) | `+233555010012` | Continue as Rider |

Enter the local part in the Ghana phone field (drop `+233`), e.g. passenger review → `555010011`.

## App Store / Play review notes (copy)

Paste into **App Store Connect → App Review Information → Notes** (and reply in Resolution Center if asked). Attach a physical-device screen recording that shows launch → login → main flow → Account → Delete account.

```
APP PURPOSE
Cyrlo Ride is a Ghana-focused ride-hailing app for passengers and riders (Pragya / motorcycle taxis). Passengers request a pickup; nearby riders accept jobs. The app solves local last-mile transport booking with phone-based accounts, live map pickup, and in-app connection-fee payment when a rider accepts.

TARGET AUDIENCE
People in Ghana who need a ride, and approved Pragya riders who want jobs.

HOW TO SIGN IN (no SMS required for review accounts)
1. Open Cyrlo Ride
2. Tap Continue with phone number / Get started
3. Enter the Ghana phone number below (local digits are fine in the phone field)
4. Tap Send code
5. Enter OTP: 246810
6. Choose Passenger or Rider when asked

DEMO ACCOUNTS
Passenger
Phone: +233 555 010 011  (enter 555010011 in the Ghana field)
OTP: 246810

Rider (approved Pragya)
Phone: +233 555 010 012  (enter 555010012 in the Ghana field)
OTP: 246810

MAIN FEATURE PATHS FOR REVIEW
Passenger: Home → Book a Pragya / Map → set pickup (My location or map pin) → Book a Pragya → choose vehicle → searching/rides. Account shows profile, legal pages, sign out, and Delete account.
Rider: Jobs / Map for offered jobs after login as Rider. Account includes Delete account.

ACCOUNT DELETION
Account tab → Delete account → confirm. This removes the signed-in account from the service and returns the user to the welcome/sign-in flow.

USER-GENERATED CONTENT
Rides are operational bookings between passenger and rider (not a social feed). There is no public UGC feed, comments, or media posting. Support/contact is available from Account → Help / Support for disputes. No separate “report/block user” social graph is required for core ride booking.

PAID FEATURES
There are no Apple In-App Purchases. A GH₵1 connection fee may be charged via Paystack checkout in-app when a rider accepts a booking. Transport fare is agreed off-app with the rider. Reviewers can explore booking UI with the demo accounts; live payment may require a successful match in a live service zone.

EXTERNAL SERVICES
- Cyrlo Ride API / realtime: https://cyrloride.eqostack.com
- Phone OTP / SMS: Vynfy (Ghana)
- Push notifications: Firebase Cloud Messaging (FCM) + APNs
- Maps: Cyrlo Maps
- Payments: Paystack (connection fee checkout; not StoreKit IAP)
- Legal pages hosted on our eqostack domains (Terms / Privacy)

REGIONAL BEHAVIOR
Built for Ghana (Ghana phone numbers, local pickup, Pragya). Feature set is the same for all users of this build; service availability depends on active service zones and nearby riders. Not a multi-country product in this release.

REGULATORY / THIRD-PARTY CONTENT
Not a regulated banking or healthcare product. No protected third-party media catalog. Rider identity documents are used only for rider onboarding/verification.

SCREEN RECORDING
A screen recording on a physical iPhone (latest iOS) is attached / linked showing: app launch, passenger login with the demo OTP, main home/map booking UI, Account, and Delete account.
```

## Server setup

1. Seed users (idempotent):

```bash
cd /var/www/cyrlo-ride-api/app/backend
sudo -u cyrlo-ride env HOME=/var/www/cyrlo-ride-api \
  DATABASE_URL='…' npx tsx scripts/seed-review-accounts.ts
```

2. Set on the API host (e.g. `/etc/cyrlo-ride/ride.env`):

```bash
OTP_STATIC_LOGINS=+233555010001:246810,+233555010002:246810,+233555010011:246810,+233555010012:246810
```

3. Restart `cyrlo-ride-api`.

Only numbers on that list use the fixed code. All other phones still require real SMS OTP.
