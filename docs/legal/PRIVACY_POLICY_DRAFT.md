# Cyrlo Ride — Privacy Policy (draft)

**Draft for product / store listing prep.** Not formal legal advice. Have Ghana counsel review before production publication.  
Aligns with how the Cyrlo Ride app and API actually work.

**Live HTML (pilot):** https://eqostack.com/cyrlo/privacy  

**Operator:** [Legal entity name TBD]  
**Contact:** [privacy email TBD]

---

## 1. What we collect

| Category | Examples | Why |
| --- | --- | --- |
| Account | Phone number (E.164), role (passenger/rider), session tokens | Login (OTP), account security |
| Profile / rider onboarding | Name and details you submit; Ghana Card data (encrypted at rest); vehicle photos/docs in private object storage | Rider verification and safety |
| Location | Live GPS while you use rider availability / trip features; trip point logs for assigned trips | Matching, navigation context, dispute review |
| Bookings & payments | Pickup/destination, status history, Paystack references, token ledger | Fulfill trips and money movement |
| Device / push | Device tokens if you enable notifications | Ride alerts |
| Support | Messages and dispute content you send | Customer support |

We do **not** sell your personal data.

## 2. How we use data

- Provide OTP login and keep you signed in securely  
- Match passengers and riders inside active zones  
- Process payments and refunds via Paystack  
- Verify riders and store documents in private storage (Bunny.net)  
- Prevent fraud and abuse; secure the service  
- Meet legal and accounting obligations  

## 3. Legal bases (high level)

Performance of the contract (providing the ride service), legitimate interests (security, fraud prevention, service improvement), and consent where required (e.g. optional marketing — not used in pilot unless added later).

## 4. Sharing

We share data only with:

- **Paystack** — payments  
- **SMS provider (Vynfy)** — OTP and critical SMS  
- **Object storage (Bunny.net)** — private rider documents  
- **Maps providers** as configured for tiles/routing display  
- **Regulators / law enforcement** when required by law  

Processors act under our instructions. We do not put Ghana Card images on public URLs.

## 5. Retention

| Data | Retention (pilot baseline) |
| --- | --- |
| Account / phone | While account active; delete/anonymize on verified closure request subject to legal holds |
| Booking & payment records | Kept for financial and dispute needs (accounting retention) |
| Trip GPS points | Kept at least through the **24-hour** dispute window; longer retention TBD with counsel |
| Rider documents | Per ops retention after account closure (configured server-side) |
| OTP codes | Short-lived; stored hashed, not plaintext |

## 6. Security

- TLS in transit  
- Hashed OTPs; rotating refresh tokens  
- Separate encryption keys for MFA secrets and identity ciphertext  
- Private document bucket; short-lived signed download URLs for authorized staff  
- Role-based admin access with audit logs  

No method is 100% secure; report issues to [security email TBD].

## 7. Your choices

- Request access or correction of your profile data  
- Request account closure (some records may remain where law requires)  
- Disable location / notifications in OS settings (core ride features may stop working)  

## 8. Children

Cyrlo Ride is not directed at children under 18. Do not use the service if you are under 18.

## 9. International processing

Infrastructure may run on servers outside Ghana (e.g. VPS / CDN). We still apply this policy and contractual safeguards with processors.

## 10. Changes

We may update this policy. We will post the new version and effective date. Material changes will be highlighted in-app when practical.

## 11. Contact

[privacy email TBD]  
[Operator postal address TBD]

---

*Host a public HTTPS URL before Play / App Store submission. Fill all TBD fields.*
