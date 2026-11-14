"""Start the app for a temporary Cloudflare Quick Tunnel demo."""

import os
import re
import sys

from tools.run_local import main as run_local


def main():
    print("Paste the HTTPS address shown by Cloudflare Quick Tunnel.")
    address = input("Demo address: ").strip().rstrip("/")
    if not re.fullmatch(r"https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com", address):
        sys.exit("Enter the complete https://...trycloudflare.com address, without a path.")
    os.environ["APP_BASE_URL"] = address
    print("Register this exact Web redirect URI in Microsoft Entra:")
    print(address + "/auth/callback")
    print("Keep the tunnel window and this window open during the demo.")
    secret = input("Microsoft client secret Value (visible): ").strip()
    if not secret:
        sys.exit("The client secret is required for sign-in.")
    os.environ["PLM_CLIENT_SECRET"] = secret
    run_local()


if __name__ == "__main__":
    main()
