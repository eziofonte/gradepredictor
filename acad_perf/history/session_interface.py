"""Fixed authenticated deadlines and update-only saves for loaded sessions.

The small storage override targets Flask-Session 0.8 (pinned in requirements).
In particular, an in-flight request must not reinsert a SID deleted by logout.
"""
from datetime import datetime, timezone
import math
import time

from flask_session.sqlalchemy import SqlAlchemySessionInterface
from flask_session._utils import retry_query


def session_deadline(session):
    value = session.get('expires_at')
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or not 0 < value < 253402300800:
        return None
    issued = session.get('issued_at')
    if issued is not None:
        if isinstance(issued, bool) or not isinstance(issued, (int, float)) or not math.isfinite(issued) or issued <= 0:
            return None
        # Apply the same eight-hour ceiling to sessions issued before this policy.
        value = min(value, issued + 28800)
    elif value > time.time() + 28800:
        return None
    return value


class FixedDeadlineSessionInterface(SqlAlchemySessionInterface):
    def open_session(self, app, request):
        state = super().open_session(app, request)
        state.loaded_authenticated_sid = state.sid if state.get('user_id') else None
        return state

    def get_expiration_time(self, app, session):
        if session.get('user_id'):
            deadline = session_deadline(session)
            return datetime.fromtimestamp(deadline, timezone.utc) if deadline else None
        return super().get_expiration_time(app, session)

    @retry_query()
    def _upsert_session(self, session_lifetime, session, store_id):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        deadline = session_deadline(session) if session.get('user_id') else None
        expiry = datetime.fromtimestamp(deadline, timezone.utc).replace(tzinfo=None) if deadline else now + session_lifetime
        data = self.serializer.encode(session)
        try:
            if getattr(session, 'loaded_authenticated_sid', None) == session.sid:
                # One atomic UPDATE cannot resurrect a concurrently deleted row.
                updated = self.client.session.query(self.sql_session_model).filter(
                    self.sql_session_model.session_id == store_id,
                    self.sql_session_model.expiry > now,
                ).update({'data': data, 'expiry': expiry}, synchronize_session=False)
                session.revoked_during_request = updated == 0
            else:
                record = self.sql_session_model.query.filter_by(session_id=store_id).first()
                if record:
                    record.data, record.expiry = data, expiry
                else:
                    self.client.session.add(self.sql_session_model(session_id=store_id, data=data, expiry=expiry))
            self.client.session.commit()
        except Exception:
            self.client.session.rollback()
            raise

    def save_session(self, app, session, response):
        if session.get('user_id'):
            deadline = session_deadline(session)
            if deadline is None or time.time() >= deadline:
                session.clear()
        super().save_session(app, session, response)
        if getattr(session, 'revoked_during_request', False):
            response.delete_cookie(self.get_cookie_name(app),
                                   domain=self.get_cookie_domain(app), path=self.get_cookie_path(app),
                                   secure=self.get_cookie_secure(app), httponly=self.get_cookie_httponly(app),
                                   samesite=self.get_cookie_samesite(app))
