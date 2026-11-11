import re
import time
from urllib.parse import parse_qs, urlparse

import pytest
from requests import ConnectionError

from tools.microsoft_signin_check import (
    DEFAULT_CLIENT_ID, DEFAULT_TENANT_ID, REDIRECT_URI,
    Settings, create_app, verified_identity,
)


@pytest.fixture
def settings():
    return Settings(DEFAULT_CLIENT_ID, DEFAULT_TENANT_ID, "test-secret-never-real")


@pytest.fixture
def claims(settings):
    return {
        "tid": settings.tenant_id,
        "oid": "11111111-2222-4333-8444-555555555555",
        "aud": settings.client_id,
        "iss": settings.authority + "/v2.0",
        "acct": 0,
        "exp": time.time() + 3600,
        "name": "Test Student",
    }


class MicrosoftStub:
    def __init__(self, claims):
        self.result = {"id_token_claims": claims, "access_token": "must-not-persist", "id_token": "must-not-persist"}
        self.failure = None
        self.calls = []

    def initiate_auth_code_flow(self, **kwargs):
        self.calls.append(kwargs)
        return {"auth_uri": "https://login.microsoftonline.com/authorize?state=test-state", "state": "test-state", "nonce": "test-nonce"}

    def acquire_token_by_auth_code_flow(self, flow, response):
        if self.failure:
            raise self.failure
        assert flow["nonce"] == "test-nonce"
        assert response["state"] == flow["state"]
        return self.result


@pytest.fixture
def setup(settings, claims):
    microsoft = MicrosoftStub(claims)
    app = create_app(settings, client_factory=lambda: microsoft)
    app.config["TESTING"] = True
    return app, app.test_client(), microsoft


def complete_login(client):
    assert client.get("/auth/login").status_code == 302
    return client.get("/auth/callback?state=test-state&code=test-code")


def test_redirects_to_microsoft_with_fixed_callback(setup):
    _, client, microsoft = setup
    response = client.get("/auth/login?next=https://untrusted.example")
    assert urlparse(response.location).hostname == "login.microsoftonline.com"
    assert parse_qs(urlparse(response.location).query)["state"] == ["test-state"]
    assert microsoft.calls[0]["redirect_uri"] == REDIRECT_URI
    assert microsoft.calls[0]["scopes"] == ["email"]
    assert response.headers["Cache-Control"] == "no-store"
    assert "HttpOnly" in response.headers["Set-Cookie"]
    assert "SameSite=Lax" in response.headers["Set-Cookie"]


def test_success_rotates_session_and_does_not_store_tokens(setup):
    _, client, _ = setup
    client.get("/auth/login")
    before = client.get_cookie("plm_signin_check").value
    response = client.get("/auth/callback?state=test-state&code=test-code")
    assert response.status_code == 302 and response.location == "/"
    assert client.get_cookie("plm_signin_check").value != before
    with client.session_transaction() as session:
        assert session["identity"]["tenant_id"] == DEFAULT_TENANT_ID
        assert "flow" not in session
        assert "must-not-persist" not in repr(dict(session))
    assert b"Microsoft sign-in verified" in client.get("/").data


@pytest.mark.parametrize("updates", [
    {"tid": "00000000-0000-4000-8000-000000000001"},
    {"tid": None}, {"oid": None}, {"oid": "not-an-id"},
    {"oid": "00000000-0000-0000-0000-000000000000"},
    {"aud": "another-app"}, {"iss": "https://untrusted.example"},
    {"acct": 1}, {"acct": "1"}, {"acct": None}, {"acct": False},
    {"exp": 0}, {"exp": None}, {"exp": float("nan")}, {"exp": float("inf")},
])
def test_rejects_ineligible_or_incomplete_identity(settings, claims, updates):
    claims.update(updates)
    with pytest.raises(ValueError):
        verified_identity(claims, settings)


def test_display_email_not_used_as_identity(settings, claims):
    claims["email"] = "old@plm.edu.ph"
    identity = verified_identity(claims, settings)
    claims["email"] = "new@plm.edu.ph"
    claims["acct"] = "0"
    assert verified_identity(claims, settings) == identity


@pytest.mark.parametrize("query", ["", "?state=wrong", "?state=test-state"])
def test_callback_without_flow_is_rejected(setup, query):
    _, client, _ = setup
    assert client.get("/auth/callback" + query).status_code == 400


def test_wrong_state_consumes_flow_and_replay_fails(setup):
    _, client, _ = setup
    client.get("/auth/login")
    assert client.get("/auth/callback?state=wrong&code=test").status_code == 400
    assert client.get("/auth/callback?state=test-state&code=test").status_code == 400


def test_expired_flow_is_rejected(setup):
    _, client, _ = setup
    client.get("/auth/login")
    with client.session_transaction() as session:
        session["flow_started"] = time.time() - 601
    assert client.get("/auth/callback?state=test-state&code=test").status_code == 400


def test_msal_validation_failure_is_rejected(setup):
    _, client, microsoft = setup
    microsoft.failure = ValueError("nonce mismatch with sensitive details")
    response = complete_login(client)
    assert response.status_code == 403
    assert b"sensitive details" not in response.data
    with client.session_transaction() as session:
        assert "identity" not in session


def test_network_failure_is_reported_without_details(setup):
    _, client, microsoft = setup
    microsoft.failure = ConnectionError("sensitive network details")
    response = complete_login(client)
    assert response.status_code == 503
    assert b"sensitive network details" not in response.data


def test_provider_denial_is_not_reflected(setup):
    _, client, microsoft = setup
    microsoft.result = {"error": "access_denied", "error_description": "private provider details"}
    response = complete_login(client)
    assert response.status_code == 400
    assert b"private provider details" not in response.data
    assert b"access_denied" in response.data


@pytest.mark.parametrize("result, expected", [
    ({"error": "invalid_client", "error_description": "AADSTS7000215: confidential details"}, b"AADSTS7000215"),
    ({"error": "access_denied", "error_codes": [65004]}, b"AADSTS65004"),
    ({"error": "<secret>", "error_description": "secret without code"}, b"without a diagnostic code"),
    ({"error": "invalid_client", "error_codes": [True, "7000215", -1]}, b"invalid_client"),
])
def test_only_safe_microsoft_error_identifiers_are_displayed(setup, result, expected):
    _, client, microsoft = setup
    microsoft.result = result
    response = complete_login(client)
    assert response.status_code == 400
    assert expected in response.data
    assert b"confidential details" not in response.data
    assert b"secret without code" not in response.data
    assert b"&lt;secret&gt;" not in response.data


def test_logout_requires_csrf_and_invalidates_cookie(setup):
    app, client, _ = setup
    complete_login(client)
    cookie = client.get_cookie("plm_signin_check").value
    assert client.post("/auth/logout").status_code == 400
    html = client.get("/").get_data(as_text=True)
    token = re.search(r'name="csrf_token" value="([^"]+)"', html).group(1)
    assert client.post("/auth/logout", data={"csrf_token": token}).status_code == 302
    replay = app.test_client()
    replay.set_cookie("plm_signin_check", cookie)
    assert b"Microsoft sign-in verified" not in replay.get("/").data


def test_identity_expires_and_name_is_escaped(setup):
    _, client, microsoft = setup
    microsoft.result["id_token_claims"]["name"] = "<script>alert(1)</script>"
    complete_login(client)
    html = client.get("/").data
    assert b"<script>alert(1)</script>" not in html
    assert b"&lt;script&gt;" in html
    with client.session_transaction() as session:
        session["expires_at"] = time.time() - 1
    assert b"Microsoft sign-in verified" not in client.get("/").data


def test_probe_does_not_expose_project_files_or_accept_foreign_hosts(setup):
    _, client, _ = setup
    for path in ("/config.py", "/app.py", "/.git/config", "/tools/microsoft_signin_check.py"):
        assert client.get(path).status_code == 404
    assert client.get("/", headers={"Host": "untrusted.example"}).status_code == 400


def test_settings_repr_hides_secret(settings):
    assert "test-secret-never-real" not in repr(settings)
