#!/usr/bin/env python3
from pathlib import Path

path = Path("/etc/cyrlo-ride/ride.env")
backup = Path("/etc/cyrlo-ride/ride.env.bak-admin-cors-20261112")
if not backup.exists():
    backup.write_bytes(path.read_bytes())

text = path.read_text(encoding="utf-8")
needle = "CORS_ORIGINS="
target = "https://cyrlorideadmin.eqostack.com"
lines = text.splitlines(keepends=True)
out = []
found = False
for line in lines:
    if line.startswith(needle):
        found = True
        raw = line[len(needle) :].strip().strip('"').strip("'")
        origins = [o.strip() for o in raw.split(",") if o.strip()]
        if target not in origins:
            origins.append(target)
        new_val = ",".join(origins)
        line = f'{needle}"{new_val}"\n'
        print("CORS_ORIGINS_UPDATED")
        print(f"CORS_ORIGINS={new_val}")
    out.append(line)

if not found:
    raise SystemExit("CORS_ORIGINS not found")

path.write_text("".join(out), encoding="utf-8")
