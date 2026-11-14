from unittest.mock import MagicMock, patch

import pytest

import app


@pytest.fixture
def payload():
    return {'yearLevel': '2nd Year', 'program': 'BSIT', 'screenTime': 5,
            'academicPhoneUse': 1, 'socialPhoneUse': 2, 'studyHours': 2, 'studyDays': 5}


@pytest.fixture
def client():
    return app.create_app().test_client()


def test_prediction_works_without_database_and_uses_only_regression(client, payload):
    with patch.object(app.mysql.connector, 'connect', side_effect=app.Error('offline')):
        response = client.post('/predict', json=payload)
        health = client.get('/health').get_json()
    assert response.status_code == 200
    result = response.get_json()
    assert result['performance_category'] == app.gwa_to_category(result['predicted_gwa'])
    assert result['saved'] is False
    assert 'tree_prediction' not in result
    assert 'category_model' not in result['model_info']
    assert health['models_loaded'] is True


@pytest.mark.parametrize('changes', [
    {'yearLevel': '1st Year'}, {'program': 'Other'}, {'screenTime': -1},
    {'screenTime': 25}, {'screenTime': None}, {'screenTime': True},
    {'studyDays': 8}, {'studyDays': 2.5}, {'studyHours': 25}, {'socialPhoneUse': True},
])
def test_prediction_rejects_invalid_survey_inputs(client, payload, changes):
    assert client.post('/predict', json={**payload, **changes}).status_code == 400


def test_prediction_fails_closed_when_model_is_unavailable(payload):
    with patch.object(app.joblib, 'load', side_effect=FileNotFoundError):
        client = app.create_app().test_client()
    assert client.post('/predict', json=payload).status_code == 503


@pytest.mark.parametrize(('raw', 'gwa', 'category'), [
    (0.5, 1.0, 'Excellent'), (1.754, 1.75, 'Excellent'),
    (1.76, 1.76, 'Good'), (2.50, 2.50, 'Good'),
    (2.51, 2.51, 'Satisfactory'), (3.00, 3.00, 'Satisfactory'),
    (3.01, 3.01, 'Failing'), (5.5, 5.0, 'Failing'),
])
def test_prediction_category_uses_rounded_and_bounded_gwa(payload, raw, gwa, category):
    model = MagicMock()
    model.predict.return_value = [raw]
    with patch.object(app.joblib, 'load', return_value=model):
        client = app.create_app().test_client()
    result = client.post('/predict', json=payload).get_json()
    assert (result['predicted_gwa'], result['performance_category']) == (gwa, category)


def test_legacy_history_selects_only_active_columns(client):
    connection = MagicMock()
    cursor = connection.cursor.return_value
    cursor.fetchall.return_value = []
    cursor.fetchone.return_value = {'total': 0}
    with patch.object(app.mysql.connector, 'connect', return_value=connection):
        response = client.get('/results')
    assert response.status_code == 200
    query = cursor.execute.call_args_list[0].args[0]
    assert 'SELECT *' not in query
    assert 'predicted_gwa' in query and 'created_at' in query
    assert 'tree_prediction' not in query and 'agrees_with_gwa' not in query
