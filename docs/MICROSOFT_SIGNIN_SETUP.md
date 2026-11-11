# Microsoft sign-in: first milestone

Status: local integration check prepared. A real PLM sign-in still needs to pass
before implementing the remaining personal-history plan. Automated tests use a
mock Microsoft client; they do not establish school consent or live sign-in.

## Registration

The owner confirmed that **New registration** is available and supplied these
public identifiers:

- Application/client ID: `7e0805d7-286c-4e3f-afa5-e230be1a690a`
- Directory/tenant ID: `c83f55a7-7fe8-4934-b759-09926430aef0`

In the Microsoft Entra app registration:

1. Set supported accounts to **Accounts in this organizational directory only**.
2. Under **Authentication**, add the **Web** platform with redirect URI
   `http://localhost:5000/auth/callback`. Do not enable implicit grant or public
   client flows.
3. Under **Token configuration**, add the optional **ID** token claim `acct`.
   The application requires `acct=0` (directory member); guests are rejected.
4. Under **Certificates & secrets**, create a client secret. Use its **Value**,
   not its secret ID. Delete any credential previously shared in chat and use a
   fresh replacement. Record its expiry in your own secure credential manager.
5. Request sign-in identity only (`openid`, `profile`, `email`). The check does
   not need Microsoft Graph `User.Read`, mail, files, calendar, directory access,
   or `offline_access`. Remove unused default API permissions.

The availability of registration does not itself prove user consent is allowed.
If Microsoft shows **Need admin approval**, record the nonsecret error code and
keep this milestone pending. Do not loosen tenant/member checks to bypass it.

If the local check shows an error, restart it and try a fresh sign-in. Share only
the displayed OAuth identifier and `AADSTS` number, if any; do not share the
callback URL, provider error description, client secret, or tokens. The check
extracts these identifiers without displaying the full Microsoft response.

## Run the check locally

Stop the estimator first if it is already using port 5000. Double-click
`check-microsoft-signin.bat`, or run from the repository root:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements-signin-check.txt
.\venv\Scripts\python.exe tools\microsoft_signin_check.py --prompt
```

At the hidden prompt, paste the replacement client secret **Value** and press
Enter. It is held only in process memory, never written to a file or printed.
Open **http://localhost:5000** (use `localhost`, not `127.0.0.1`, so the browser
session matches the registered callback).

Click **Sign in with Microsoft**, sign in using the PLM account, and complete any
Microsoft verification. A successful callback shows **Microsoft sign-in verified**.
Report that outcome without copying tokens, callback URLs, or secrets into chat.
Press Ctrl+C in the terminal when finished.

This is a separate, loopback-only proof, not a production authentication server.
It uses temporary in-memory server sessions for ten minutes, has no database
connection, does not save assessments, and does not modify the existing app.
Production sessions will use MySQL and the eight-hour policy in the master plan.

Optional environment overrides are `PLM_CLIENT_ID`, `PLM_TENANT_ID`, and
`PLM_CLIENT_SECRET`. Prefer the hidden prompt for interactive testing rather than
typing credentials into shell history. Never place credentials in tracked files.

## Verification

```powershell
.\venv\Scripts\python.exe -m pytest tests/test_microsoft_signin_check.py -q
```

Tests check rejection of wrong tenants, external guests, missing claims, expired
identity/flows, wrong state, replay, and MSAL validation failures. They also check
session rotation, CSRF-protected logout, session invalidation, escaped display
names, private responses, safe error messages, and absence of persistent tokens.

Live acceptance requires the real Microsoft redirect and a verified PLM account.
After that, proceed with MySQL migrations, reusable production authentication,
owner-scoped history APIs, history UI, and the two-account/cross-device pilot.

## References

- [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [MSAL authorization-code flow](https://learn.microsoft.com/en-us/entra/msal/python/getting-started/acquiring-tokens)
- [Member/guest optional claim](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)
- [User consent policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
