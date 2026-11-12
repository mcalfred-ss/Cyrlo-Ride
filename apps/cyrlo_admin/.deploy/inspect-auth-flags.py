#!/usr/bin/env python3
"""Read-only: print presence/shape of auth-related env keys. Never print secrets or OTP codes."""
from pathlib import Path

text = Path("/etc/cyrlo-ride/ride.env").read_text(encoding="utf-8")
keys: dict[str, str] = {}
for line in text.splitlines():
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    keys[k] = v

for k in (
    "NODE_ENV",
    "OTP_DEV_EXPOSE_CODE",
    "OTP_STATIC_LOGINS",
    "SMS_PROVIDER",
    "ADMIN_BOOTSTRAP_SECRET",
    "CORS_ORIGINS",
):
    if k not in keys:
        print(f"{k}=ABSENT")
        continue
    raw = keys[k].strip().strip('"').strip("'")
    if k == "OTP_STATIC_LOGINS":
        pairs = [p for p in raw.split(",") if p.strip()]
        print(f"OTP_STATIC_LOGINS=PRESENT entry_count={len(pairs)}")
    elif k == "ADMIN_BOOTSTRAP_SECRET":
        print("ADMIN_BOOTSTRAP_SECRET=PRESENT" if raw else "ADMIN_BOOTSTRAP_SECRET=EMPTY")
    elif k in ("NODE_ENV", "SMS_PROVIDER", "OTP_DEV_EXPOSE_CODE", "CORS_ORIGINS"):
        print(f"{k}={raw}")
    else:
        print(f"{k}=PRESENT")
