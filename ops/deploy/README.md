# Cyrlo Ride — deploy & CI

**Deploy is always manual** (from this machine or the VPS). There is no GitHub Actions deploy and no SSH secrets to configure.

## Staging deploy (VPS)

Server layout:

| Item | Value |
| --- | --- |
| App checkout | `/var/www/cyrlo-ride-api/app` |
| Unit | `cyrlo-ride-api.service` |
| Env | `/etc/cyrlo-ride/ride.env` + `providers.env` |
| Health | `https://cyrloride.eqostack.com/api/v1/health` |

### From Windows (local) — preferred

```powershell
.\ops\deploy\deploy-staging.ps1
.\ops\deploy\deploy-staging.ps1 -Ref main -DryRun
.\ops\deploy\deploy-staging.ps1 -SmokeOnly
```

Uses `~/.ssh/id_ed25519_cirlo` → `root@188.166.155.199` by default.

### From the VPS

```bash
cd /var/www/cyrlo-ride-api/app
sudo -u cyrlo-ride git pull --ff-only
bash ops/deploy/deploy-staging.sh --skip-pull
bash ops/deploy/smoke-staging.sh
```

Or one shot (script pulls itself):

```bash
bash /var/www/cyrlo-ride-api/app/ops/deploy/deploy-staging.sh
```

Flags: `--skip-pull`, `--skip-migrate`, `--skip-build`, `--skip-restart`, `--force-dirty`, `--dry-run`.

The script refuses a dirty git tree by default (protects accidental local server edits).

### Legal pages only

```bash
bash ops/legal-site/deploy-eqostack-legal.sh
```

## CI (GitHub Actions)

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `CI` | push / PR to `main` | Backend: `npm ci`, Prisma validate/generate, typecheck, tests. Flutter: `pub get`, analyze, test. |

CI only checks the code. Shipping to staging is always `deploy-staging.ps1` / `deploy-staging.sh`.
