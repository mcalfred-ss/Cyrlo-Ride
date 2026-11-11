#!/usr/bin/env bash
# Mount Firebase service-account JSON and enable FCM HTTP v1 on staging.
# Usage (on VPS as root):
#   scp cyrlo-ride-firebase-adminsdk.json root@HOST:/tmp/
#   bash setup-staging-fcm.sh /tmp/cyrlo-ride-firebase-adminsdk.json [project-id]
set -euo pipefail

SRC="${1:-}"
PROJECT_ID="${2:-}"
SECRETS_DIR=/etc/cyrlo-ride/secrets
DEST="${SECRETS_DIR}/firebase-adminsdk.json"
ENV_FILE=/etc/cyrlo-ride/providers.env

if [[ -z "$SRC" || ! -f "$SRC" ]]; then
  echo "Usage: $0 /path/to/firebase-adminsdk.json [FCM_PROJECT_ID]" >&2
  exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(python3 - <<'PY' "$SRC"
import json,sys
print(json.load(open(sys.argv[1])).get("project_id",""))
PY
)"
fi

if [[ -z "$PROJECT_ID" ]]; then
  echo "Could not read project_id from JSON; pass it as arg 2." >&2
  exit 1
fi

install -d -m 750 -o root -g cyrlo-ride "$SECRETS_DIR"
install -m 640 -o root -g cyrlo-ride "$SRC" "$DEST"

touch "$ENV_FILE"
chmod 640 "$ENV_FILE"
chown root:cyrlo-ride "$ENV_FILE"

python3 - <<PY
from pathlib import Path
path = Path("$ENV_FILE")
text = path.read_text() if path.exists() else ""
lines = [ln for ln in text.splitlines() if not ln.startswith("PUSH_PROVIDER=")
         and not ln.startswith("FCM_PROJECT_ID=")
         and not ln.startswith("FCM_SERVICE_ACCOUNT_FILE=")]
lines += [
    "PUSH_PROVIDER=fcm",
    "FCM_PROJECT_ID=$PROJECT_ID",
    "FCM_SERVICE_ACCOUNT_FILE=$DEST",
]
path.write_text("\n".join(lines).rstrip() + "\n")
print(f"Updated {path}")
PY

# Outbox push worker runs in-process with the API.
systemctl restart cyrlo-ride-api
echo "FCM enabled for project_id=$PROJECT_ID file=$DEST"
