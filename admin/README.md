# Admin

The staff admin SPA lives at **`apps/cyrlo_admin`** (Phase 1A authentication shell).

```bash
cd apps/cyrlo_admin
cp .env.example .env   # set VITE_API_BASE_URL
npm install
npm run dev
```

Call `/api/v1` with MFA staff JWTs. Never put Mapbox / Cyrlo Maps API keys in the admin app.

Backend surfaces (geo, zones, Phase 0 console APIs, etc.) remain in the Ride API. Dashboard business screens after auth ship in later phases.
