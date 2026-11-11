# Admin

There is no separate admin SPA in this repository yet.

Admin behaviour belongs to modules inside the one Ride backend process. A future web UI should call `/api/v1` with staff JWTs (never Mapbox / Cyrlo Maps API keys).

Implemented backend surfaces include rider review, suspensions, payments, audit, **nationwide geo hierarchy** (`/admin/geo`), and **service-zone lifecycle** (`/admin/service-zones`).

Dashboard screens still to build against the API contract:

- Country → region → district → community browser (`GET /admin/geo/tree`)
- Community editor + verification
- Service-zone map preview (boundary GeoJSON) + verification queue
- Activate / lock / suspend controls (backend-enforced)
- Coverage overview + audit history
- Hierarchy CSV/JSON import preview + confirm

See `docs/architecture/NATIONWIDE_GEO_ADMIN_CONTRACT.md`.
