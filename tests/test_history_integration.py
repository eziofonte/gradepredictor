"""Integration tests use a new, disposable MySQL database, never the app database."""
import os
import time
import uuid

import mysql.connector
import pytest

from acad_history.database import mysql_settings
from acad_history.migrate import migrate
from app import create_app


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
    from acad_history.database import connect
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
    import acad_history.account_history as history
    def unavailable():
        raise mysql.connector.Error('database unavailable')
    monkeypatch.setattr(history, 'connect', unavailable)
    response = client.post('/predict', json=prediction(), headers=headers(auth))
    assert response.status_code == 200
    assert response.json['saved'] is False
    assert response.json['predicted_gwa'] is not None
    assert response.json['save_error']
    assert client.get('/results').status_code == 503


def test_expiration_and_logout_invalidate_access(users):
    (client, auth), _ = users
    with client.session_transaction() as session:
        session['expires_at'] = time.time() - 1
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
        assert b'../style.css?v=' in response.data
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
