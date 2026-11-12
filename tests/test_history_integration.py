"""Integration tests use a new, disposable MySQL database, never the app database."""
import os
import time
import uuid

import mysql.connector
import pytest

from acad_perf.history.database import mysql_settings
from acad_perf.history.migrate import migrate
from app import create_app
from datetime import timezone
from types import SimpleNamespace


@pytest.fixture(scope='module')
def database():
    original = os.environ.get('MYSQL_DATABASE')
    name = 'acad_perf_test_' + uuid.uuid4().hex[:12]
    settings = mysql_settings()
    settings.pop('database')
    try:
        admin = mysql.connector.connect(**settings)
        cursor = admin.cursor()
        cursor.execute(f'CREATE DATABASE `{name}`')
        cursor.close()
    except mysql.connector.Error as error:
        pytest.skip(f'Disposable MySQL database unavailable (error {error.errno})')
    os.environ['MYSQL_DATABASE'] = name
    try:
        conn = mysql.connector.connect(**mysql_settings())
        cur = conn.cursor()
        cur.execute('CREATE TABLE assessments (id INT AUTO_INCREMENT PRIMARY KEY, daily_screen_time_hrs FLOAT, academic_app_usage_hrs FLOAT, social_media_hrs FLOAT, study_hours_per_day FLOAT, study_frequency_per_week FLOAT, predicted_gwa FLOAT, performance_category VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB')
        cur.execute("INSERT INTO assessments (predicted_gwa, performance_category) VALUES (2.0, 'Good')")
        conn.commit(); cur.close(); conn.close()
        migrate()
        migrate()
        yield name
    finally:
        if original is None:
            os.environ.pop('MYSQL_DATABASE', None)
        else:
            os.environ['MYSQL_DATABASE'] = original
        cursor = admin.cursor()
        cursor.execute(f'DROP DATABASE `{name}`')
        cursor.close(); admin.close()


class Provider:
    def __init__(self, claims):
        self.claims = claims

    def initiate_auth_code_flow(self, **kwargs):
        return {'state': 'test-state', 'nonce': 'test-nonce', 'auth_uri': 'https://login.microsoftonline.com/test'}

    def acquire_token_by_auth_code_flow(self, flow, response):
        return {'id_token_claims': self.claims}


@pytest.fixture
def app(database):
    app = create_app({'TESTING': True, 'SECRET_KEY': 'integration-test-only',
                      'PLM_CLIENT_SECRET': 'test-only', 'WTF_CSRF_ENABLED': True})
    yield app
    with app.app_context():
        app.extensions['sqlalchemy'].engine.dispose()


@pytest.fixture
def users(app):
    clients = []
    for name in ('Alice', 'Bob'):
        claims = {'tid': app.config['PLM_TENANT_ID'], 'oid': str(uuid.uuid4()),
                  'aud': app.config['PLM_CLIENT_ID'],
                  'iss': 'https://login.microsoftonline.com/' + app.config['PLM_TENANT_ID'] + '/v2.0',
                  'acct': 0, 'exp': time.time() + 3600, 'name': name}
        app.config['MSAL_CLIENT_FACTORY'] = lambda c=claims: Provider(c)
        client = app.test_client()
        assert client.get('/auth/login').status_code == 302
        assert client.get('/auth/callback?state=test-state&code=test-code').status_code == 302
        auth = client.get('/auth/session').get_json()
        assert auth['authenticated']
        clients.append((client, auth))
    return clients


def headers(auth):
    return {'X-CSRFToken': auth['csrf_token'], 'X-Expected-User': str(auth['user']['id']) if auth['user'] else 'guest'}


def prediction(**changes):
    data = {'screenTime': 4, 'academicPhoneUse': 1, 'socialPhoneUse': 2,
            'studyHours': 3, 'studyDays': 5, 'yearLevel': '1st Year',
            'program': 'BSIT', 'academicTerm': '1st Sem', 'save_to_history': True,
            'submission_id': str(uuid.uuid4())}
    data.update(changes)
    return data


def signin(app, **query):
    claims = {'tid': app.config['PLM_TENANT_ID'], 'oid': str(uuid.uuid4()),
              'aud': app.config['PLM_CLIENT_ID'],
              'iss': 'https://login.microsoftonline.com/' + app.config['PLM_TENANT_ID'] + '/v2.0',
              'acct': 0, 'exp': time.time() + 3600, 'name': 'Session Test'}
    app.config['MSAL_CLIENT_FACTORY'] = lambda: Provider(claims)
    client = app.test_client()
    assert client.get('/auth/login', query_string={'next': '/assessment.html', **query}).status_code == 302
    callback = client.get('/auth/callback?state=test-state&code=x')
    assert callback.status_code == 302
    return client, callback


def test_fixed_eight_hour_cookie_and_database_deadlines(app, monkeypatch):
    import acad_perf.history.account_history as history
    client, callback = signin(app)
    with client.session_transaction() as state:
        issued, expires = state['issued_at'], state['expires_at']
        assert expires - issued == 28800
    cookie = client.get_cookie(app.config['SESSION_COOKIE_NAME'])
    assert cookie.expires.timestamp() == expires
    assert cookie.http_only and cookie.same_site == 'Lax'
    assert callback.location.endswith('/assessment.html')
    with app.app_context():
        interface = app.session_interface
        row = interface.sql_session_model.query.filter_by(session_id=interface._get_store_id(cookie.value)).one()
        assert row.expiry.replace(tzinfo=timezone.utc).timestamp() == expires
    monkeypatch.setattr(history, 'time', SimpleNamespace(time=lambda: expires))
    assert not client.get('/auth/session').json['authenticated']


def test_login_has_no_post_preference_endpoint(app):
    client = app.test_client()
    csrf = client.get('/auth/session').json['csrf_token']
    assert client.post('/auth/login', data={'csrf_token': csrf}).status_code == 405


def test_session_cookie_cannot_be_replayed_after_logout(app):
    client, _ = signin(app)
    name = app.config['SESSION_COOKIE_NAME']
    cookie = client.get_cookie(name).value
    auth = client.get('/auth/session').json
    assert client.post('/auth/logout', headers=headers(auth)).status_code == 200
    assert client.get_cookie(name) is None
    replay = app.test_client(); replay.set_cookie(name, cookie)
    assert not replay.get('/auth/session').json['authenticated']


@pytest.mark.parametrize('age_hours', [1, 9])
def test_preexisting_long_sessions_are_capped_at_eight_hours_from_issuance(app, age_hours):
    client, _ = signin(app)
    cookie = client.get_cookie(app.config['SESSION_COOKIE_NAME'])
    issued = int(time.time()) - age_hours * 3600
    with app.app_context():
        interface = app.session_interface
        row = interface.sql_session_model.query.filter_by(session_id=interface._get_store_id(cookie.value)).one()
        data = interface.serializer.decode(row.data)
        data['issued_at'] = issued
        data['expires_at'] = issued + 2592000
        row.data = interface.serializer.encode(data)
        interface.client.session.commit()
    assert client.get('/auth/session').json['authenticated'] is (age_hours < 8)
    if age_hours < 8:
        with client.session_transaction() as state:
            assert state['expires_at'] == issued + 28800
        assert client.get_cookie(app.config['SESSION_COOKIE_NAME']).expires.timestamp() == issued + 28800


def test_delayed_authenticated_session_write_cannot_resurrect_logout(app):
    from flask import session, Response
    client, _ = signin(app)
    name = app.config['SESSION_COOKIE_NAME']
    cookie = client.get_cookie(name).value
    with app.test_request_context('/auth/session', headers={'Cookie': name + '=' + cookie}):
        stale = session._get_current_object()
        stale['pending_request'] = 'late change'
    auth = client.get('/auth/session').json
    assert client.post('/auth/logout', headers=headers(auth)).status_code == 200
    with app.app_context():
        response = Response()
        app.session_interface.save_session(app, stale, response)
    replay = app.test_client(); replay.set_cookie(name, cookie)
    assert not replay.get('/auth/session').json['authenticated']


@pytest.mark.parametrize('deadline', [None, 'invalid', float('nan'), float('inf'), True])
def test_malformed_authenticated_deadline_fails_closed(users, deadline):
    client, _ = users[0]
    with client.session_transaction() as state:
        state['expires_at'] = deadline
    assert not client.get('/auth/session').json['authenticated']


def test_requests_do_not_extend_eight_hour_session(app):
    client, _ = signin(app)
    with client.session_transaction() as state:
        deadline = state['expires_at']
        assert deadline - state['issued_at'] == 28800
        state['modified_after_login'] = True
    client.get('/auth/session')
    with client.session_transaction() as state:
        assert state['expires_at'] == deadline
    assert client.get_cookie(app.config['SESSION_COOKIE_NAME']).expires.timestamp() == deadline


def test_existing_authenticated_session_without_new_metadata_keeps_deadline(app):
    client, _ = signin(app)
    with client.session_transaction() as state:
        deadline = state['expires_at']
        state.pop('issued_at')
    assert client.get('/auth/session').json['authenticated']
    with client.session_transaction() as state:
        assert state['expires_at'] == deadline


def test_old_csrf_token_can_be_refreshed_without_losing_active_identity(app, monkeypatch):
    from itsdangerous import TimestampSigner
    client, _ = signin(app)
    old_time = int(time.time()) - 28801
    with monkeypatch.context() as patch:
        patch.setattr(TimestampSigner, 'get_timestamp', lambda self: old_time)
        old = client.get('/auth/session').json
    assert old['authenticated']
    assert client.post('/predict', json=prediction(), headers=headers(old)).status_code == 400
    fresh = client.get('/auth/session').json
    assert fresh['user']['id'] == old['user']['id']
    assert fresh['csrf_token'] != old['csrf_token']
    assert client.post('/predict', json=prediction(), headers=headers(fresh)).json['saved']


def test_failed_oauth_does_not_grant_access(app):
    app.config['MSAL_CLIENT_FACTORY'] = lambda: Provider(None)
    client = app.test_client()
    assert client.get('/auth/login').status_code == 302
    assert client.get('/auth/callback?state=test-state&code=x').status_code == 403
    assert not client.get('/auth/session').json['authenticated']


def test_isolation_retries_filters_and_deletion(users):
    (alice, a), (bob, b) = users
    body = prediction()
    first = alice.post('/predict', json=body, headers=headers(a))
    assert first.status_code == 200 and first.json['saved']
    record_id = first.json['assessment_id']
    retry = alice.post('/predict', json=body, headers=headers(a))
    assert retry.json['assessment_id'] == record_id
    assert alice.post('/predict', json={**body, 'studyHours': 4}, headers=headers(a)).status_code == 409
    assert bob.get('/results').json['results'] == []
    assert bob.delete(f'/results/{record_id}', headers=headers(b)).status_code == 404
    assert bob.get('/results/summary').json['total_assessments'] == 0
    assert alice.get('/results?year_level=2nd%20Year').json['results'] == []
    assert len(alice.get('/results?year_level=1st%20Year').json['results']) == 1
    assert alice.delete(f'/results/{record_id}', headers=headers(a)).json['deleted'] == 1
    assert alice.get('/results').json['results'] == []


def test_guest_and_session_protections(app, users):
    guest = app.test_client()
    auth = guest.get('/auth/session').json
    assert guest.get('/results').status_code == 401
    result = guest.post('/predict', json=prediction(save_to_history=False), headers=headers(auth))
    assert result.status_code == 200 and not result.json['saved']
    assert guest.post('/predict', json=prediction(), headers=headers(auth)).status_code == 401
    (client, signed), _ = users
    assert client.post('/predict', json=prediction(), headers={'X-Expected-User': str(signed['user']['id'])}).status_code == 400
    assert client.post('/predict', json=prediction(), headers={**headers(signed), 'X-Expected-User': 'guest'}).status_code == 409
    assert client.post('/predict', json=prediction(user_id=999), headers=headers(signed)).status_code == 400
    assert client.get('/config.py').status_code == 404
    assert client.get('/app.py').status_code == 404
    assert client.get('/.git/config').status_code == 404


def test_clear_history_is_scoped(users):
    (alice, a), (bob, b) = users
    assert alice.post('/predict', json=prediction(), headers=headers(a)).json['saved']
    assert bob.post('/predict', json=prediction(), headers=headers(b)).json['saved']
    assert alice.delete('/results', headers=headers(a)).json['deleted'] == 1
    assert bob.get('/results').json['pagination']['total'] == 1


def test_ownerless_legacy_record_remains_inaccessible(app, users):
    (client, auth), _ = users
    assert client.get('/results').json['results'] == []
    assert client.delete('/results/1', headers=headers(auth)).status_code == 404


def test_manila_date_filter_and_stable_pagination(users):
    (client, auth), _ = users
    ids = []
    for _ in range(3):
        ids.append(client.post('/predict', json=prediction(), headers=headers(auth)).json['assessment_id'])
    from acad_perf.history.database import connect
    conn = connect(); cur = conn.cursor()
    # The first instant is Dec 31, 23:59 Manila; the next two are Jan 1.
    cur.execute("UPDATE assessments SET created_at='2025-12-31 15:59:00' WHERE id=%s", (ids[0],))
    for item in ids[1:]:
        cur.execute("UPDATE assessments SET created_at='2025-12-31 16:00:00' WHERE id=%s", (item,))
    conn.commit(); cur.close(); conn.close()
    first = client.get('/results?date_from=2026-01-01&date_to=2026-01-01&limit=1').json
    second = client.get('/results?date_from=2026-01-01&date_to=2026-01-01&limit=1&offset=1').json
    assert first['pagination']['total'] == 2 and first['pagination']['has_more']
    assert [first['results'][0]['id'], second['results'][0]['id']] == [ids[2], ids[1]]
    assert client.get('/results?date_from=2026-01-02&date_to=2026-01-01').status_code == 400


def test_database_write_failure_preserves_result(users, monkeypatch):
    (client, auth), _ = users
    import acad_perf.history.account_history as history
    def unavailable():
        raise mysql.connector.Error('database unavailable')
    monkeypatch.setattr(history, 'connect', unavailable)
    response = client.post('/predict', json=prediction(), headers=headers(auth))
    assert response.status_code == 200
    assert response.json['saved'] is False
    assert response.json['predicted_gwa'] is not None
    assert response.json['save_error']
    assert client.get('/results').status_code == 503


def test_expiration_and_logout_invalidate_access(users, monkeypatch):
    import acad_perf.history.account_history as history
    (client, auth), _ = users
    with client.session_transaction() as session:
        expires = session['expires_at']
    # Advance the request clock; saving an already-expired session now removes it.
    with monkeypatch.context() as patch:
        patch.setattr(history, 'time', SimpleNamespace(time=lambda: expires))
        assert client.post('/predict', json=prediction(), headers=headers(auth)).status_code == 401
    assert client.get('/results').status_code == 401
    (client, auth), _ = users
    # The second account still has a valid, independent session.
    second, other = users[1]
    assert second.post('/auth/logout', headers=headers(other)).status_code == 200
    assert second.get('/results').status_code == 401


def test_redirects_are_restricted(app):
    client = app.test_client()
    claim = {'tid': app.config['PLM_TENANT_ID'], 'oid': str(uuid.uuid4()),
             'aud': app.config['PLM_CLIENT_ID'],
             'iss': 'https://login.microsoftonline.com/' + app.config['PLM_TENANT_ID'] + '/v2.0',
             'acct': 0, 'exp': time.time() + 3600, 'name': 'Test'}
    app.config['MSAL_CLIENT_FACTORY'] = lambda: Provider(claim)
    client.get('/auth/login?next=https://example.invalid')
    assert client.get('/auth/callback?state=test-state&code=x').location == '/'
    client.get('/auth/login?next=%2F%23assessment')
    assert client.get('/auth/callback?state=test-state&code=x').location.endswith('/#assessment')


def test_shared_account_styles_use_the_existing_public_stylesheet(app):
    client = app.test_client()
    for page in ('index', 'hiw', 'assessment', 'history'):
        response = client.get(f'/{page}.html')
        assert response.status_code == 200
        assert b'../css/style.css?v=' in response.data
        assert b'../css/account.css' not in response.data
        assert b'../js/auth.js' in response.data
    css = client.get('/style.css?v=account-compact-1')
    assert css.status_code == 200 and css.mimetype == 'text/css'
    assert b'.account-icon { width: 18px; height: 18px;' in css.data
    assert b'.account-mobile-label { display: none; }' in css.data
    logo = client.get('/assets/icons/microsoft.svg')
    assert logo.status_code == 200 and logo.mimetype == 'image/svg+xml'
    assert client.get('/css/unlisted.css').status_code == 404


def test_same_microsoft_identity_recovers_history_on_another_device(app):
    claims = {'tid': app.config['PLM_TENANT_ID'], 'oid': str(uuid.uuid4()),
              'aud': app.config['PLM_CLIENT_ID'],
              'iss': 'https://login.microsoftonline.com/' + app.config['PLM_TENANT_ID'] + '/v2.0',
              'acct': 0, 'exp': time.time() + 3600, 'name': 'First Name', 'email': 'old@plm.edu.ph'}
    app.config['MSAL_CLIENT_FACTORY'] = lambda: Provider(claims)
    first = app.test_client()
    first.get('/auth/login'); first.get('/auth/callback?state=test-state&code=x')
    auth = first.get('/auth/session').json
    result = first.post('/predict', json=prediction(), headers=headers(auth)).json
    assert result['saved']
    assert first.post('/auth/logout', headers=headers(auth)).status_code == 200
    claims.update(name='Updated Name', email='new@plm.edu.ph')
    second = app.test_client()
    second.get('/auth/login'); second.get('/auth/callback?state=test-state&code=x')
    updated = second.get('/auth/session').json
    assert updated['user']['id'] == auth['user']['id']
    assert updated['user']['name'] == 'Updated Name'
    assert second.get('/results').json['results'][0]['id'] == result['assessment_id']
