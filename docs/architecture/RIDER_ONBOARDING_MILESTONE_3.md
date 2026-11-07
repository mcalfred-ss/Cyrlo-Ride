# Cyrlo Ride — Milestone 3: Rider onboarding, vehicles, verification

## Endpoints (rider)

Base: `/api/v1/riders` — Bearer `PASSENGER` or `RIDER`, active account.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/onboarding` | Start/hydrate draft application + encrypt Ghana Card |
| PATCH | `/onboarding` | Update draft/rejected application fields |
| GET | `/onboarding` | Own application (no plaintext Ghana Card) |
| POST | `/onboarding/submit` | Submit when complete → `PENDING_REVIEW` |
| POST | `/vehicles` | Register TRICYCLE or CAR |
| PATCH | `/vehicles/:vehicleId` | Edit non-approved vehicle |
| POST | `/documents` | multipart `file` + `kind` (+ `vehicleId` when needed) |

## Endpoints (operations)

Base: `/api/v1/admin/riders` — staff MFA session + permissions.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/applications` | `ReviewRiders` |
| GET | `/applications/:riderId` | `ReviewRiders` (no plaintext Ghana Card) |
| POST | `/applications/:riderId/review` | `ReviewRiders` |
| POST | `/vehicles/:vehicleId/review` | `ReviewRiders` |
| GET | `/documents/:documentId/content` | `AccessIdentityDocuments` + recent MFA |
| GET | `/applications/:riderId/ghana-card` | `AccessIdentityDocuments` + recent MFA |

Finance/Support do not receive identity-document permissions.

## Document storage

- Provider: Cloudflare R2 via S3 API (`@aws-sdk/client-s3`).
- Private bucket only; server-side `PutObject`; short-lived signed `GetObject` URLs.
- Object keys are server-generated under `riders/{riderId}/...` — clients never supply paths.
- Allowed types: JPEG, PNG, WebP, PDF; max 8 MiB.
- Missing R2 env → fail closed (`503`), no public fallback. Tests use `MemoryObjectStorage`.

## Ghana Card encryption

- Legacy `rider_profiles.ghana_card_number` stays **null**.
- Ciphertext in `rider_identity_secrets` (purpose `GHANA_CARD_NUMBER`) using AES-256-GCM (`IDENTITY_ENCRYPTION_KEY`, separate from MFA key).
- Ordinary APIs return `hasEncryptedGhanaCard` only.
- Ops reveal is audited as `rider.identity.accessed` without storing the number in metadata.

### Key rotation / recovery

1. Introduce a new `IDENTITY_ENCRYPTION_KEY` version; set `IDENTITY_ENCRYPTION_KEY_VERSION`.
2. Re-encrypt rows offline or via a controlled admin job (not shipped in this milestone).
3. Keep prior key material offline until re-encryption completes.
4. Lost keys: ciphertext is unrecoverable; riders must re-enter Ghana Card on a DRAFT/REJECTED application.

## Approval rules (this milestone)

Eligible for later matching only when: active user, rider `APPROVED`, ≥1 vehicle `APPROVED`. Zone/token/GPS are later. Suspended users remain ineligible. Rejection requires a reason; rider may correct and resubmit. History in `rider_review_decisions`.

## Environment

| Variable | Purpose |
| --- | --- |
| `IDENTITY_ENCRYPTION_KEY` | 32-byte base64 AES key (≠ MFA key) |
| `IDENTITY_ENCRYPTION_KEY_VERSION` | Key version stored with ciphertext |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | R2 |
| `R2_SIGNED_URL_TTL_SECONDS` | Signed URL lifetime (default 60) |
| `RIDER_DOC_RETENTION_MONTHS_AFTER_CLOSURE` | Provisional retention metadata (12) |

## Flutter notes

1. Passenger or rider JWT can call onboarding.
2. Upload documents as multipart; never ask for storage keys.
3. Do not expect Ghana Card plaintext on GET onboarding.
4. After approval, refresh the session so `role` becomes `RIDER`.
5. Availability / matching endpoints remain unimplemented.
