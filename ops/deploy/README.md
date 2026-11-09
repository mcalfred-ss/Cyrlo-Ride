# Cyrlo Ride — deploy & CI

## Staging deploy (VPS)

Server layout:

| Item | Value |
| --- | --- |
| App checkout | `/var/www/cyrlo-ride-api/app` |
| Unit | `cyrlo-ride-api.service` |
| Env | `/etc/cyrlo-ride/ride.env` + `providers.env` |
| Health | `https://cyrloride.eqostack.com/api/v1/health` |

### From the VPS

```bash
bash /var/www/cyrlo-ride-api/app/ops/deploy/deploy-staging.sh
# or
bash ops/deploy/deploy-staging.sh --ref main
bash ops/deploy/smoke-staging.sh
```

Flags: `--skip-pull`, `--skip-migrate`, `--skip-build`, `--skip-restart`, `--force-dirty`, `--dry-run`.

The script refuses a dirty git tree by default (protects accidental local server edits).

### From Windows (local)

```powershell
.\ops\deploy\deploy-staging.ps1
.\ops\deploy\deploy-staging.ps1 -Ref main -DryRun
.\ops\deploy\deploy-staging.ps1 -SmokeOnly
```

Uses `~/.ssh/id_ed25519_cirlo` → `root@188.166.155.199` by default.

### Legal pages only

```bash
bash ops/legal-site/deploy-eqostack-legal.sh
```

## CI / CD (GitHub Actions)

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `CI` | push / PR to `main` | Backend: `npm ci`, Prisma validate/generate, typecheck, tests. Flutter: `pub get`, analyze, test. |
| `Deploy staging` | **manual** (`workflow_dispatch`) | SSH to VPS → `deploy-staging.sh` for a chosen ref |

### Required GitHub secrets (for Deploy staging)

| Secret | Example |
| --- | --- |
| `STAGING_SSH_HOST` | `188.166.155.199` |
| `STAGING_SSH_USER` | `root` |
| `STAGING_SSH_KEY` | private key PEM contents (ed25519) |
| `STAGING_SSH_PORT` | `22` (optional) |

Optional: create a GitHub Environment named `staging` and attach these secrets there (recommended for approval gates).

### First-time enablement

1. Push `ops/deploy/` + `.github/workflows/` to `main`.
2. On the VPS once: `cd /var/www/cyrlo-ride-api/app && sudo -u cyrlo-ride git pull --ff-only` (so the deploy script exists).
3. Add the SSH secrets in the GitHub repo.
4. Actions → **Deploy staging** → Run workflow → ref `main`.

Deploy is **manual on purpose** (payments + single matching writer). Turn on auto-deploy later only if you want `push` to `main` to ship without a human click.
