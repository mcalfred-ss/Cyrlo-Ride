#!/usr/bin/env python3
"""Transfer Cyrlo Maps client secret into Ride providers.env (secret only). Never prints secrets."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else "/root/cyrlo-maps-api-client.key")
TARGET = Path(sys.argv[2] if len(sys.argv) > 2 else "/etc/cyrlo-ride/providers.env")
BASE_URL = os.environ.get("CYRLO_MAPS_BASE_URL", "https://api.cyrlomap.eqostack.com")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def main() -> int:
    if not SOURCE.is_file():
        print("missing_source_key_file")
        return 1
    if not TARGET.is_file():
        print("missing_providers_env")
        return 1

    raw = SOURCE.read_text(encoding="utf-8").strip()
    secret = raw.split(":", 1)[1] if ":" in raw else raw
    if len(secret) < 16 or any(c.isspace() for c in secret):
        print("invalid_secret_shape")
        return 1

    lines = TARGET.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    seen_key = False
    seen_url = False
    for line in lines:
        if line.startswith("CYRLO_MAPS_API_KEY="):
            out.append(f"CYRLO_MAPS_API_KEY={shell_quote(secret)}")
            seen_key = True
        elif line.startswith("CYRLO_MAPS_BASE_URL="):
            out.append(f"CYRLO_MAPS_BASE_URL={shell_quote(BASE_URL)}")
            seen_url = True
        else:
            out.append(line)
    if not seen_url:
        out.append(f"CYRLO_MAPS_BASE_URL={shell_quote(BASE_URL)}")
    if not seen_key:
        out.append(f"CYRLO_MAPS_API_KEY={shell_quote(secret)}")

    content = "\n".join(out) + "\n"
    fd, tmp = tempfile.mkstemp(prefix="providers.env.", dir=str(TARGET.parent))
    os.close(fd)
    Path(tmp).write_text(content, encoding="utf-8")
    os.chmod(tmp, 0o640)
    os.system(f"chown root:cyrlo-ride {tmp}")
    os.replace(tmp, TARGET)
    os.system(f"chown root:cyrlo-ride {TARGET}")
    os.chmod(TARGET, 0o640)

    keys = [
        line.split("=", 1)[0]
        for line in TARGET.read_text(encoding="utf-8").splitlines()
        if line and not line.startswith("#") and "=" in line and line[0].isupper()
    ]
    print("synced CYRLO_MAPS_BASE_URL CYRLO_MAPS_API_KEY")
    print("keys=" + ",".join(sorted(keys)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
