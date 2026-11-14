import joblib
import pandas as pd
import pytest

import app


@pytest.fixture
def third_year():
    return {'yearLevel': '3rd Year', 'program': 'BSCS', 'screenTime': 6,
            'academicPhoneUse': 1, 'socialPhoneUse': 2, 'studyHours': 2,
            'studyDays': 5, 'thirdYearSemester': '1st Sem'}


def test_third_year_prediction_uses_survey_semester_difficulty(third_year):
    client = app.create_app().test_client()
    response = client.post('/predict', json=third_year)
    assert response.status_code == 200
    model = joblib.load(app.THIRD_YEAR_MODEL_PATH)
    difficulty = app.load_semester_difficulty()['BSCS']['1st Sem']
    expected = model.predict(pd.DataFrame([{'screen': 6.0, 'difficulty': difficulty,
                                           'program': 'BSCS', 'term': '1st Sem'}]))[0]
    assert response.json['predicted_gwa'] == round(min(5, max(1, float(expected))), 2)
    assert response.json['semester_difficulty'] == pytest.approx(difficulty)
    second = client.post('/predict', json={**third_year, 'thirdYearSemester': '2nd Sem'}).json
    assert second['semester_difficulty'] != response.json['semester_difficulty']


@pytest.mark.parametrize('changes', [
    {'thirdYearSemester': 'Midyear'}, {'thirdYearSemester': ''},
    {'thirdYearSemester': None},
])
def test_invalid_difficulty_is_rejected(third_year, changes):
    assert app.create_app().test_client().post('/predict', json={**third_year, **changes}).status_code == 400
