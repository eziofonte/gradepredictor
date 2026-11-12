r"""Loopback-only Microsoft sign-in proof. No assessment or production DB access.

Run: venv\Scripts\python.exe -m tools.microsoft_signin_check --prompt
The secret is read without echo and held only in process memory.
"""

import argparse
from dataclasses import dataclass, field
from datetime import timedelta
import getpass
import logging
import os
import re
import secrets
import time
import warnings
from uuid import UUID

from cachelib import SimpleCache
from flask import Flask, redirect, render_template_string, request, session
from flask_session import Session
from flask_wtf import CSRFProtect
from flask_wtf.csrf import CSRFError
import msal
from requests import RequestException


# Public identifiers supplied by the project owner, not credentials.
DEFAULT_CLIENT_ID = "7e0805d7-286c-4e3f-afa5-e230be1a690a"
DEFAULT_TENANT_ID = "c83f55a7-7fe8-4934-b759-09926430aef0"
REDIRECT_URI = "http://localhost:5000/auth/callback"


def canonical_uuid(value):
    if not isinstance(value, str) or UUID(value).int == 0:
        raise ValueError("A nonempty UUID is required.")
    return str(UUID(value))


@dataclass(frozen=True)
class Settings:
    client_id: str
    tenant_id: str
    client_secret: str = field(repr=False)

    def __post_init__(self):
        object.__setattr__(self, "client_id", canonical_uuid(self.client_id))
        object.__setattr__(self, "tenant_id", canonical_uuid(self.tenant_id))
        if not isinstance(self.client_secret, str) or not self.client_secret.strip():
            raise ValueError("A client secret is required.")

    @property
    def authority(self):
        return f"https://login.microsoftonline.com/{self.tenant_id}"


def verified_identity(claims, settings):
    """Check eligibility AFTER MSAL redeems and validates the code flow.

    Never use this function to accept browser-provided or unverified JWT claims.
    Names/email are display fields only; tenant/object IDs define identity.
    """
    if not isinstance(claims, dict):
        raise ValueError("Missing identity claims.")
    if canonical_uuid(claims.get("tid")) != settings.tenant_id:
        raise ValueError("A PLM account is required.")
    object_id = canonical_uuid(claims.get("oid"))
    if claims.get("aud") != settings.client_id:
        raise ValueError("Wrong application audience.")
    if claims.get("iss") != f"{settings.authority}/v2.0":
        raise ValueError("Wrong identity issuer.")
    member_type = claims.get("acct")
    if type(member_type) not in (str, int) or str(member_type) != "0":
        raise ValueError("A PLM member account and the acct claim are required.")
    expires = claims.get("exp")
    if type(expires) not in (int, float) or not time.time() < expires < float("inf"):
        raise ValueError("Identity has expired.")
    return {
        "tenant_id": settings.tenant_id,
        "object_id": object_id,
        "name": str(claims.get("name") or "PLM Account")[:200],
    }


def safe_provider_error(result):
    """Return only a recognized OAuth error and Microsoft error code.

    Provider descriptions and callback parameters may contain sensitive data,
    so never return or log them verbatim.
    """
    recognized = {
        "access_denied", "invalid_client", "invalid_grant", "invalid_request",
        "unauthorized_client", "invalid_scope", "consent_required",
        "interaction_required", "temporarily_unavailable", "server_error",
    }
    error = result.get("error")
    pieces = []
    if isinstance(error, str) and error in recognized:
        pieces.append(error)
    description = result.get("error_description")
    if isinstance(description, str):
        match = re.search(r"\bAADSTS[0-9]{5,7}\b", description, re.IGNORECASE)
        if match:
            pieces.append(match.group().upper())
    if not any(part.startswith("AADSTS") for part in pieces):
        codes = result.get("error_codes")
        if isinstance(codes, list):
            for code in codes:
                if type(code) is int and 10000 <= code <= 9999999:
                    pieces.append(f"AADSTS{code}")
                    break
    if pieces:
        return "Microsoft sign-in failed. Error: " + ", ".join(pieces) + "."
    return "Microsoft sign-in failed without a diagnostic code. Please try again."


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PLM Microsoft sign-in check</title>
<style>
body{font:16px/1.6 system-ui,sans-serif;background:#f7f4ee;color:#282420;margin:0;padding:2rem}
main{max-width:38rem;margin:8vh auto;padding:2rem;background:white;border:1px solid #ded6c9;border-radius:12px}
h1{font-size:1.7rem;line-height:1.2}a,button{color:#70252b}
.button,button{display:inline-block;background:#70252b;color:white;border:0;border-radius:6px;padding:.8rem 1rem;font:inherit;text-decoration:none;cursor:pointer}
.error{border-left:4px solid #982f38;padding-left:1rem}.note{color:#655d54}
</style></head><body><main>
<p class="note">Academic Performance Estimator · Local integration check</p>
<h1>{{ 'Microsoft sign-in verified' if identity else 'Sign in with your PLM account' }}</h1>
{% if error %}<p class="error" role="alert">{{ error }}</p>{% endif %}
{% if identity %}
<p>Welcome, {{ identity.name }}. Microsoft returned the configured PLM tenant and a member account.</p>
<p>The live sign-in prerequisite passed for this account. Personal history has not been connected yet.</p>
<form action="/auth/logout" method="post"><input type="hidden" name="csrf_token" value="{{ csrf_token() }}"><button>Sign out of this check</button></form>
{% else %}
<p>Microsoft will handle your password and any account verification, then return you here.</p>
<a class="button" href="/auth/login">Sign in with Microsoft</a>
{% endif %}
<p class="note">This local check does not save assessments. Its temporary sessions disappear when it stops.</p>
</main></body></html>"""


def create_app(settings, client_factory=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=secrets.token_urlsafe(48),
        SESSION_TYPE="cachelib",
        SESSION_CACHELIB=SimpleCache(default_timeout=600),
        SESSION_COOKIE_NAME="plm_signin_check",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=False,  # Loopback HTTP only; never deploy this probe.
        SESSION_PERMANENT=False,
        SESSION_REFRESH_EACH_REQUEST=False,
        PERMANENT_SESSION_LIFETIME=timedelta(minutes=10),
        TRUSTED_HOSTS=["localhost", "127.0.0.1"],
        MAX_CONTENT_LENGTH=16 * 1024,
    )
    Session(app)
    CSRFProtect(app)

    def client():
        if client_factory:
            return client_factory()
        # New memory-only cache per request. No tokens survive the callback.
        return msal.ConfidentialClientApplication(
            settings.client_id,
            authority=settings.authority,
            client_credential=settings.client_secret,
            token_cache=msal.TokenCache(),
            exclude_scopes=["offline_access"],
            timeout=15,
        )

    def page(error=None, status=200):
        return render_template_string(PAGE, identity=session.get("identity"), error=error), status

    @app.after_request
    def private_response(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.before_request
    def expire_identity():
        if session.get("identity") and time.time() >= session.get("expires_at", 0):
            session.clear()

    @app.get("/")
    def index():
        return page()

    @app.get("/auth/login")
    def login():
        app.session_interface.regenerate(session)
        session.clear()
        try:
            flow = client().initiate_auth_code_flow(
                scopes=["email"],  # MSAL supplies openid/profile; no Graph scopes.
                redirect_uri=REDIRECT_URI,
                prompt="select_account",
                domain_hint="plm.edu.ph",  # UX hint, not an authorization check.
            )
        except (RequestException, ValueError):
            return page("Microsoft sign-in could not start. Check the registration and connection.", 503)
        if not flow.get("auth_uri") or not flow.get("state"):
            return page("Microsoft sign-in could not start. Check the registration.", 503)
        session["flow"] = flow
        session["flow_started"] = time.time()
        return redirect(flow["auth_uri"])

    @app.get("/auth/callback")
    def callback():
        flow = session.pop("flow", None)
        started = session.pop("flow_started", 0)
        state = request.args.get("state", "")
        if (not flow or time.time() - started > 600 or not state
                or not secrets.compare_digest(state, flow["state"])):
            return page("The sign-in request expired or could not be verified. Please try again.", 400)
        try:
            result = client().acquire_token_by_auth_code_flow(flow, request.args.to_dict())
            if result.get("error"):
                return page(safe_provider_error(result), 400)
            identity = verified_identity(result.get("id_token_claims"), settings)
        except RequestException:
            return page("Microsoft could not be reached. Please try signing in again.", 503)
        except (ValueError, TypeError, KeyError):
            return page("Sign-in could not be verified. Use a PLM member account and ensure the acct ID-token claim is configured.", 403)
        # Rotate while the session is nonempty (Flask-Session requires this).
        session.clear()
        session["identity"] = identity
        session["expires_at"] = time.time() + 600
        app.session_interface.regenerate(session)
        return redirect("/")

    @app.post("/auth/logout")
    def logout():
        session.clear()
        return redirect("/")

    @app.errorhandler(CSRFError)
    def csrf_error(error):
        return page("This page expired. Reload it before signing out.", 400)

    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt", action="store_true", help="Prompt securely for the client secret")
    args = parser.parse_args()
    if args.prompt:
        # Refuse getpass's echoing fallback in a noninteractive terminal.
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                secret = getpass.getpass("Replacement client secret VALUE (hidden, not saved): ")
        except (getpass.GetPassWarning, EOFError):
            parser.error("A terminal with hidden input is required. Run check-microsoft-signin.bat locally.")
    else:
        secret = os.environ.get("PLM_CLIENT_SECRET", "")
    try:
        settings = Settings(
            os.environ.get("PLM_CLIENT_ID", DEFAULT_CLIENT_ID),
            os.environ.get("PLM_TENANT_ID", DEFAULT_TENANT_ID),
            secret,
        )
    except ValueError:
        parser.error("Configure valid PLM_CLIENT_ID / PLM_TENANT_ID and use --prompt for the client secret.")
    logging.getLogger("werkzeug").setLevel(logging.ERROR)  # Never log callback codes/query strings.
    print("Open http://localhost:5000 in your browser. This check is local only.")
    create_app(settings).run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
