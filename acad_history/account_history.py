"Microsoft authentication and owner-scoped assessment history."

from datetime import date, datetime, time as day_time, timedelta, timezone
from functools import wraps
import hashlib
import json
import os
import time
import uuid

from flask import Blueprint, current_app, jsonify, redirect, request, session
from flask_session import Session
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect
from flask_wtf.csrf import CSRFError, generate_csrf
import msal
from mysql.connector import Error, IntegrityError
from requests import RequestException
from sqlalchemy.engine import URL

from acad_history.database import connect, mysql_settings
from tools.microsoft_signin_check import (
    Settings,
    verified_identity,
    DEFAULT_CLIENT_ID,
    DEFAULT_TENANT_ID,
    safe_provider_error,
)

bp = Blueprint("accounts", __name__)
MANILA = timezone(timedelta(hours=8))
EIGHT_HOURS = 8 * 60 * 60
PUBLIC_RETURNS = {
    "/": "/",
    "/#assessment": "/#assessment",
    "/index.html": "/",
    "/history.html": "/history.html",
    "/assessment.html": "/assessment.html",
    "/hiw.html": "/hiw.html",
}


def setup(app, overrides=None):
    overrides = overrides or {}
    db = mysql_settings()
    url = URL.create(
        "mysql+mysqlconnector",
        username=db["user"],
        password=db["password"],
        host=db["host"],
        port=db["port"],
        database=db["database"],
    )
    base_url = os.environ.get("APP_BASE_URL", "http://localhost:5000").rstrip("/")
    secret = os.environ.get("APP_SECRET_KEY")
    if not secret and not overrides.get("TESTING"):
        raise RuntimeError("Set APP_SECRET_KEY before starting the application.")
    if base_url != "http://localhost:5000" and not base_url.startswith("https://"):
        raise RuntimeError("APP_BASE_URL must use HTTPS outside local development.")
    app.config.update(
        SECRET_KEY=secret,
        SQLALCHEMY_DATABASE_URI=url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_TYPE="sqlalchemy",
        SESSION_PERMANENT=True,
        PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=base_url.startswith("https://"),
        SESSION_REFRESH_EACH_REQUEST=False,
        SESSION_CLEANUP_N_REQUESTS=1000,
        WTF_CSRF_TIME_LIMIT=EIGHT_HOURS,
        PLM_CLIENT_ID=os.environ.get("PLM_CLIENT_ID", DEFAULT_CLIENT_ID),
        PLM_TENANT_ID=os.environ.get("PLM_TENANT_ID", DEFAULT_TENANT_ID),
        PLM_CLIENT_SECRET=os.environ.get("PLM_CLIENT_SECRET", ""),
        APP_BASE_URL=base_url,
    )
    app.config.update(overrides)
    db_session = SQLAlchemy(app)
    app.config["SESSION_SQLALCHEMY"] = db_session
    Session(app)

    @app.cli.command("purge-expired-sessions")
    def purge_expired_sessions():
        """Remove expired database-backed sessions (also run periodically on requests)."""
        app.session_interface._delete_expired_sessions()
        print("Expired sessions removed.")

    @app.before_request
    def enforce_session_lifetime():
        if session.get("user_id") and time.time() >= session.get("expires_at", 0):
            session.clear()
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                return jsonify(error="Your session expired. Please sign in again."), 401

    CSRFProtect(app)

    @app.errorhandler(CSRFError)
    def csrf_error(error):
        return (
            jsonify(
                error="Your session changed or expired. Reload the page and try again."
            ),
            400,
        )

    @app.after_request
    def privacy_headers(response):
        if request.path.startswith(("/auth/", "/results", "/predict")):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Referrer-Policy"] = "no-referrer"
        return response

    app.register_blueprint(bp)


def identity_settings():
    return Settings(
        current_app.config["PLM_CLIENT_ID"],
        current_app.config["PLM_TENANT_ID"],
        current_app.config["PLM_CLIENT_SECRET"],
    )


def msal_client(settings):
    factory = current_app.config.get("MSAL_CLIENT_FACTORY")
    if factory:
        return factory()
    return msal.ConfidentialClientApplication(
        settings.client_id,
        authority=settings.authority,
        client_credential=settings.client_secret,
        token_cache=msal.TokenCache(),
        exclude_scopes=["offline_access"],
        timeout=15,
    )


def require_user(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify(error="Please sign in to view your history."), 401
        expected = request.headers.get("X-Expected-User")
        if expected is not None and expected != str(session["user_id"]):
            return (
                jsonify(error="The signed-in account changed. Reload this page."),
                409,
            )
        return fn(*args, **kwargs)

    return wrapped


@bp.get("/auth/session")
def session_info():
    return jsonify(
        authenticated=bool(session.get("user_id")),
        user=(
            {"id": session["user_id"], "name": session["name"]}
            if session.get("user_id")
            else None
        ),
        csrf_token=generate_csrf(),
    )


@bp.get("/auth/login")
def login():
    target = PUBLIC_RETURNS.get(request.args.get("next", "/"), "/")
    # A missing secret is the most common cause of a local app showing this
    # error after the separate sign-in proof succeeded. Give a safe, actionable
    # message without exposing whether the secret itself is valid.
    if not current_app.config.get("PLM_CLIENT_SECRET", "").strip():
        current_app.logger.warning("Microsoft sign-in is not configured: client secret is missing")
        return (
            jsonify(
                error=(
                    "Microsoft sign-in is not configured on this server. "
                    "Restart with dev-server.bat and enter the client secret Value when prompted."
                )
            ),
            503,
        )
    try:
        settings = identity_settings()
        flow = msal_client(settings).initiate_auth_code_flow(
            scopes=["email"],
            redirect_uri=current_app.config["APP_BASE_URL"] + "/auth/callback",
            prompt="select_account",
            domain_hint="plm.edu.ph",
        )
        if not flow.get("state") or not flow.get("auth_uri"):
            raise ValueError("Invalid sign-in flow")
    except (ValueError, RequestException):
        current_app.logger.warning("Microsoft sign-in could not start")
        return (
            jsonify(
                error="Microsoft sign-in is unavailable. Check the app configuration."
            ),
            503,
        )
    current_app.session_interface.regenerate(session)
    session.clear()
    session["flow"] = flow
    session["flow_started"] = time.time()
    session["return_to"] = target
    return redirect(flow["auth_uri"])


@bp.get("/auth/callback")
def callback():
    import secrets

    flow = session.pop("flow", None)
    started = session.pop("flow_started", 0)
    target = session.pop("return_to", "/")
    state = request.args.get("state", "")
    reason = None
    if not isinstance(flow, dict):
        reason = "no sign-in session"
    elif not state or not isinstance(flow.get("state"), str):
        reason = "missing sign-in state"
    elif not isinstance(started, (int, float)) or time.time() - started > 600:
        reason = "sign-in request expired"
    elif not secrets.compare_digest(state, flow["state"]):
        reason = "sign-in state mismatch"
    if reason:
        current_app.logger.warning("Microsoft callback rejected: %s", reason)
        return (
            jsonify(error="The sign-in request expired or could not be verified. Return to the home page and start sign-in again."),
            400,
        )
    try:
        settings = identity_settings()
        result = msal_client(settings).acquire_token_by_auth_code_flow(
            flow, request.args.to_dict()
        )
        if result.get("error"):
            return jsonify(error=safe_provider_error(result)), 400
        claims = result.get("id_token_claims")
        identity = verified_identity(claims, settings)
        conn = connect()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO users (tenant_id, object_id, display_name, email, last_login_at)\n                VALUES (%s,%s,%s,%s,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE\n                id=LAST_INSERT_ID(id), display_name=VALUES(display_name), email=VALUES(email),\n                last_login_at=UTC_TIMESTAMP()",
                (
                    identity["tenant_id"],
                    identity["object_id"],
                    identity["name"],
                    str(claims.get("email") or "")[:255] or None,
                ),
            )
            user_id = cur.lastrowid
            conn.commit()
            cur.close()
        finally:
            conn.close()
    except (ValueError, TypeError, KeyError):
        return (
            jsonify(error="Sign-in could not be verified for a PLM member account."),
            403,
        )
    except (RequestException, Error):
        current_app.logger.warning("Microsoft login or database connection failed")
        return (
            jsonify(error="Sign-in is temporarily unavailable. Please try again."),
            503,
        )
    session.clear()
    session["user_id"] = user_id
    session["name"] = identity["name"]
    session["expires_at"] = time.time() + EIGHT_HOURS
    current_app.session_interface.regenerate(session)
    return redirect(PUBLIC_RETURNS.get(target, "/"))


@bp.post("/auth/logout")
def logout():
    expected = request.headers.get("X-Expected-User")
    if expected and expected != str(session.get("user_id", "")):
        return jsonify(error="The signed-in account changed. Reload this page."), 409
    session.clear()
    return jsonify(ok=True)


def input_hash(data):
    keys = (
        "screenTime",
        "academicPhoneUse",
        "socialPhoneUse",
        "studyHours",
        "studyDays",
        "yearLevel",
        "program",
        "academicTerm",
    )
    normalized = {key: data.get(key) for key in keys}
    for key in keys[:5]:
        normalized[key] = float(normalized[key])
    return hashlib.sha256(
        json.dumps(
            normalized, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def save_prediction(data, predicted_gwa, category):
    "Return the original result for an idempotent authenticated retry."
    try:
        submission_id = str(uuid.UUID(str(data.get("submission_id", ""))))
        digest = input_hash(data)
    except (ValueError, TypeError):
        return {"error": "A valid submission ID and inputs are required."}, 400
    conn = None
    try:
        conn = connect()
        cur = conn.cursor(dictionary=True)
        values = (
            session["user_id"],
            submission_id,
            digest,
            data["screenTime"],
            data["academicPhoneUse"],
            data["socialPhoneUse"],
            data["studyHours"],
            data["studyDays"],
            predicted_gwa,
            category,
            data.get("yearLevel"),
            data.get("program"),
            data["academicTerm"],
        )
        try:
            cur.execute(
                "INSERT INTO assessments\n                (user_id, submission_id, request_hash, daily_screen_time_hrs, academic_app_usage_hrs,\n                 social_media_hrs, study_hours_per_day, study_frequency_per_week, predicted_gwa,\n                 performance_category, year_level, program, academic_term)\n                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                values,
            )
            assessment_id = cur.lastrowid
            conn.commit()
        except IntegrityError as error:
            conn.rollback()
            if error.errno != 1062:
                raise
            cur.execute(
                "SELECT id, request_hash, predicted_gwa, performance_category FROM assessments WHERE user_id=%s AND submission_id=%s",
                (session["user_id"], submission_id),
            )
            existing = cur.fetchone()
            if not existing or existing["request_hash"] != digest:
                return {
                    "error": "This submission ID was already used for different inputs."
                }, 409
            assessment_id = existing["id"]
            predicted_gwa, category = (
                existing["predicted_gwa"],
                existing["performance_category"],
            )
        return {
            "assessment_id": assessment_id,
            "saved": True,
            "save_error": None,
            "predicted_gwa": predicted_gwa,
            "performance_category": category,
        }, 200
    except Error:
        current_app.logger.warning("Assessment could not be saved")
        return {
            "assessment_id": None,
            "saved": False,
            "save_error": "Your result could not be saved. Please try again.",
        }, 200
    finally:
        if conn:
            conn.close()


def filters_from_request():
    clauses, params = ["user_id=%s"], [session["user_id"]]
    for key, column in (
        ("year_level", "year_level"),
        ("academic_term", "academic_term"),
    ):
        value = request.args.get(key, "")
        if value:
            clauses.append(column + "=%s")
            params.append(value)
    start, end = request.args.get("date_from", ""), request.args.get("date_to", "")
    try:
        start_date = date.fromisoformat(start) if start else None
        end_date = date.fromisoformat(end) if end else None
        if start_date and end_date and start_date > end_date:
            raise ValueError()
        if start_date:
            clauses.append("created_at >= %s")
            params.append(
                datetime.combine(start_date, day_time.min, MANILA)
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
        if end_date:
            clauses.append("created_at < %s")
            params.append(
                datetime.combine(end_date + timedelta(days=1), day_time.min, MANILA)
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
    except (ValueError, OverflowError):
        raise ValueError("Enter a valid date range.")
    return " AND ".join(clauses), params


@bp.get("/results")
@require_user
def results():
    try:
        limit = int(request.args.get("limit", 25))
        offset = int(request.args.get("offset", 0))
        if not 1 <= limit <= 100 or offset < 0:
            raise ValueError("Invalid pagination.")
        where, params = filters_from_request()
        conn = connect()
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(
                "SELECT COUNT(*) AS total FROM assessments WHERE " + where, params
            )
            total = cur.fetchone()["total"]
            cur.execute(
                "SELECT id, daily_screen_time_hrs, academic_app_usage_hrs, social_media_hrs, study_hours_per_day, study_frequency_per_week, predicted_gwa, performance_category, year_level, program, academic_term, created_at FROM assessments WHERE "
                + where
                + " ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
                params + [limit, offset],
            )
            records = cur.fetchall()
            for row in records:
                row["created_at"] = (
                    row["created_at"]
                    .replace(tzinfo=timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z")
                )
            cur.close()
        finally:
            conn.close()
        return jsonify(
            results=records,
            pagination={
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total,
            },
        )
    except ValueError as error:
        return jsonify(error=str(error)), 400
    except Error:
        current_app.logger.warning("History query failed")
        return jsonify(error="History is temporarily unavailable."), 503


@bp.get("/results/summary")
@require_user
def summary():
    try:
        where, params = filters_from_request()
        conn = connect()
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(
                "SELECT COUNT(*) AS total_assessments, AVG(predicted_gwa) AS avg_gwa, MIN(predicted_gwa) AS min_gwa, MAX(predicted_gwa) AS max_gwa FROM assessments WHERE "
                + where,
                params,
            )
            result = cur.fetchone()
            cur.execute(
                "SELECT performance_category, COUNT(*) AS count FROM assessments WHERE "
                + where
                + " GROUP BY performance_category",
                params,
            )
            counts = {
                row["performance_category"]: row["count"] for row in cur.fetchall()
            }
            total = result["total_assessments"]
            result["band_distribution"] = {
                name.lower(): {
                    "count": counts.get(name, 0),
                    "percentage": (
                        round(100 * counts.get(name, 0) / total, 1) if total else 0
                    ),
                }
                for name in ("Excellent", "Good", "Satisfactory", "Failing")
            }
            for key in ("avg_gwa", "min_gwa", "max_gwa"):
                result[key] = (
                    round(float(result[key]), 2) if result[key] is not None else 0
                )
            cur.close()
        finally:
            conn.close()
        return jsonify(result)
    except ValueError as error:
        return jsonify(error=str(error)), 400
    except Error:
        current_app.logger.warning("History summary failed")
        return jsonify(error="History is temporarily unavailable."), 503


@bp.delete("/results")
@bp.delete("/results/<int:assessment_id>")
@require_user
def delete_results(assessment_id=None):
    try:
        conn = connect()
        try:
            cur = conn.cursor()
            if assessment_id is None:
                cur.execute(
                    "DELETE FROM assessments WHERE user_id=%s", (session["user_id"],)
                )
            else:
                cur.execute(
                    "DELETE FROM assessments WHERE user_id=%s AND id=%s",
                    (session["user_id"], assessment_id),
                )
            deleted = cur.rowcount
            conn.commit()
            cur.close()
        finally:
            conn.close()
        if assessment_id is not None and not deleted:
            return jsonify(error="Record not found."), 404
        return jsonify(deleted=deleted)
    except Error:
        current_app.logger.warning("History deletion failed")
        return jsonify(error="History is temporarily unavailable."), 503
