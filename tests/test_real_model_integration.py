import joblib
import pandas as pd
import app


def test_prediction_uses_saved_model_and_validates_survey_answers():
    client = app.create_app().test_client()
    payload = {'yearLevel': '2nd Year', 'program': 'BSIT', 'screenTime': 6,
               'academicPhoneUse': 1, 'socialPhoneUse': 2, 'studyHours': 2, 'studyDays': 5}
    model = joblib.load(app.MODEL_PATH)
    features = pd.DataFrame([{'screen_hours': 6, 'program': 'BSIT', 'year_level': '2'}])
    expected = round(float(model.predict(features)[0]), 2)
    response = client.post('/predict', json=payload)
    assert response.status_code == 200
    assert response.json['predicted_gwa'] == expected
    assert client.post('/predict', json={**payload, 'yearLevel': '1st Year'}).status_code == 400
    assert client.post('/predict', json={**payload, 'studyDays': 8}).status_code == 400
    changed = client.post('/predict', json={**payload, 'studyHours': 10}).json
    assert changed['predicted_gwa'] == expected
    assert changed['suggestions'] != response.json['suggestions']
