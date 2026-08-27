#!/usr/bin/env python3
"""One-shot promotion of a target user to admin + password set, against
production over HTTPS. Uses an existing admin (Erin) to authorize.

Usage
-----
    export PROD_ADMIN_EMAIL='erinboroughs@gmail.com'
    export PROD_ADMIN_PASSWORD='...'
    export TARGET_EMAIL='luvtowork247@yahoo.com'
    export TARGET_PASSWORD='...'
    python3 /app/scripts/promote_admin_via_api.py
"""
from __future__ import annotations

import os
import sys

try:
    import requests
except ImportError:
    print("pip install requests", file=sys.stderr)
    sys.exit(1)


PROD_URL = os.environ.get("PROD_URL", "https://stompin-yuma-app.emergent.host")


def login(base: str, email: str, password: str) -> str:
    r = requests.post(
        f"{base}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    if r.status_code >= 400:
        raise SystemExit(f"✖ Login failed ({r.status_code}): {r.text[:200]}")
    return r.json()["token"]


def main() -> int:
    admin_email = os.environ.get("PROD_ADMIN_EMAIL", "erinboroughs@gmail.com")
    admin_password = os.environ.get("PROD_ADMIN_PASSWORD")
    target_email = os.environ.get("TARGET_EMAIL")
    target_password = os.environ.get("TARGET_PASSWORD")

    if not (admin_password and target_email and target_password):
        print(
            "Missing env: PROD_ADMIN_PASSWORD / TARGET_EMAIL / "
            "TARGET_PASSWORD required."
        )
        return 2

    base = PROD_URL
    print(f"→ Logging in to {base} as admin {admin_email}")
    token = login(base, admin_email, admin_password)
    print(f"    got admin token (len={len(token)})")

    headers = {"Authorization": f"Bearer {token}"}

    print(f"→ Promoting {target_email} to admin + instructor")
    r = requests.post(
        f"{base}/api/admin/users/promote",
        headers=headers,
        json={"email": target_email, "is_admin": True, "is_instructor": True},
        timeout=30,
    )
    if r.status_code >= 400:
        print(f"  ✖ promote failed ({r.status_code}): {r.text[:300]}")
        return 1
    print(f"    ✓ {r.json()}")

    print(f"→ Setting password on {target_email}")
    r = requests.post(
        f"{base}/api/admin/users/set-password",
        headers=headers,
        json={"email": target_email, "new_password": target_password},
        timeout=30,
    )
    if r.status_code >= 400:
        print(f"  ✖ set-password failed ({r.status_code}): {r.text[:300]}")
        return 1
    print(f"    ✓ {r.json()}")

    print(f"→ Verifying: log in as {target_email} with the new password")
    r = requests.post(
        f"{base}/api/auth/login",
        json={"email": target_email, "password": target_password},
        timeout=30,
    )
    if r.status_code >= 400:
        print(f"  ✖ verify login failed ({r.status_code}): {r.text[:300]}")
        return 1
    user = r.json().get("user", {})
    print(
        f"    ✓ login ok — user_id={user.get('user_id')} "
        f"is_admin={user.get('is_admin')} "
        f"is_instructor={user.get('is_instructor')}"
    )
    if not user.get("is_admin"):
        print("  ⚠  logged in but is_admin=False — check ADMIN_EMAILS in prod.")
        return 1
    print("\nAll done. luvtowork247 can now sign in with email/password AND")
    print("Apple — both hit the same account with admin + instructor flags.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
