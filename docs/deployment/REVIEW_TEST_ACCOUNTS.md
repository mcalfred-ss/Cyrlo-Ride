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

```
Demo accounts (no SMS — use the fixed OTP after requesting a code):

Passenger
Phone: +233 555 010 011
OTP: 246810

Rider (approved Pragya)
Phone: +233 555 010 012
OTP: 246810

Flow: open app → Get started → enter phone → Send code → enter 246810 → choose Passenger or Rider.
Rider is pre-approved for Pragya. Passenger can browse home / account / legal pages.
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
