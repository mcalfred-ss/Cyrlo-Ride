#!/usr/bin/env python3
"""Report encryption-key readiness without printing secret material."""

from __future__ import annotations

import base64
import re
from pathlib import Path


def load_env(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        data[key] = value
    return data


def inspect_key(name: str, value: str) -> dict:
    placeholder = bool(re.search(r"change-me|development-only|AAAAAAA|AgICAg", value, re.I))
    decoded_len = 0
    decoded_ok = False
    try:
        raw = base64.b64decode(value, validate=False)
        decoded_len = len(raw)
        decoded_ok = decoded_len == 32
    except Exception:
        pass
    return {
        "name": name,
        "present": bool(value),
        "placeholder_like": placeholder,
        "base64_32_bytes": decoded_ok,
        "decoded_len": decoded_len,
    }


def main() -> None:
    env: dict[str, str] = {}
    env.update(load_env(Path("/etc/cyrlo-ride/ride.env")))
    env.update(load_env(Path("/etc/cyrlo-ride/providers.env")))

    mfa = inspect_key("ADMIN_MFA_ENCRYPTION_KEY", env.get("ADMIN_MFA_ENCRYPTION_KEY", ""))
    identity = inspect_key("IDENTITY_ENCRYPTION_KEY", env.get("IDENTITY_ENCRYPTION_KEY", ""))
    same = bool(env.get("ADMIN_MFA_ENCRYPTION_KEY")) and (
        env.get("ADMIN_MFA_ENCRYPTION_KEY") == env.get("IDENTITY_ENCRYPTION_KEY")
    )
    version = env.get("IDENTITY_ENCRYPTION_KEY_VERSION", "")

    print("ADMIN_MFA_ENCRYPTION_KEY", mfa)
    print("IDENTITY_ENCRYPTION_KEY", identity)
    print("keys_are_identical", same)
    print("IDENTITY_ENCRYPTION_KEY_VERSION", version or "(missing)")

    ok = (
        mfa["present"]
        and identity["present"]
        and mfa["base64_32_bytes"]
        and identity["base64_32_bytes"]
        and not mfa["placeholder_like"]
        and not identity["placeholder_like"]
        and not same
        and version.isdigit()
        and int(version) >= 1
    )
    print("ITEM5_PASS", ok)


if __name__ == "__main__":
    main()
