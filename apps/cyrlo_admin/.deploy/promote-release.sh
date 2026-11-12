#!/usr/bin/env bash
# Promote a prepared Admin static release and retain prior releases for rollback.
# Usage (on VPS): bash promote-release.sh <release-id> [--retain N]
# Expects files already at: /var/www/cyrlorideadmin/releases/<release-id>/
set -euo pipefail

ROOT=/var/www/cyrlorideadmin
RETAIN=5
RELEASE="${1:-}"
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --retain)
      RETAIN="${2:?}"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$RELEASE" ]]; then
  echo "Usage: $0 <release-id> [--retain N]" >&2
  exit 2
fi

TARGET="$ROOT/releases/$RELEASE"
if [[ ! -f "$TARGET/index.html" ]]; then
  echo "Missing $TARGET/index.html — upload the build before promoting." >&2
  exit 1
fi
if [[ ! -d "$TARGET/assets" ]]; then
  echo "Missing $TARGET/assets — refuse incomplete release." >&2
  exit 1
fi

PREV=""
if [[ -L "$ROOT/current" ]]; then
  PREV="$(basename "$(readlink -f "$ROOT/current")")"
fi

ln -sfn "$TARGET" "$ROOT/current"
mkdir -p "$ROOT/shared"
printf '%s\n' "$RELEASE" > "$ROOT/shared/current-release.txt"
echo "promoted=$RELEASE"
echo "previous=${PREV:-none}"

# Retain newest RETAIN releases; never delete the active current target.
mapfile -t ALL < <(ls -1 "$ROOT/releases" | sort -r)
KEEP=0
for id in "${ALL[@]}"; do
  if [[ "$id" == "$RELEASE" ]]; then
    KEEP=$((KEEP + 1))
    continue
  fi
  if [[ $KEEP -lt $RETAIN ]]; then
    KEEP=$((KEEP + 1))
    continue
  fi
  echo "prune_release=$id"
  rm -rf "$ROOT/releases/$id"
done

echo "current=$(readlink -f "$ROOT/current")"
curl -sS -o /dev/null -w 'homepage:%{http_code}\n' https://cyrlorideadmin.eqostack.com/ || true
