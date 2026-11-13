import unittest
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

import app
import academic_performance_calculator_app as desktop
from academic_performance_predictor import (
    FEATURE_COLUMNS, TARGET_SCORE, generate_synthetic_data,
    gwa_to_category, predict_new_student,
)


class RegressionOnlyTests(unittest.TestCase):
    def setUp(self):
        self.client = app.create_app().test_client()
        self.inputs = dict(screenTime=5, academicPhoneUse=1.5,
                           socialPhoneUse=2.5, studyHours=2, studyDays=5)
        self.features = dict(zip(FEATURE_COLUMNS, self.inputs.values()))

    def test_prediction_preserves_regression_result_without_classifier_outputs(self):
        data = generate_synthetic_data(n=400)
        model = LinearRegression().fit(data[FEATURE_COLUMNS], data[TARGET_SCORE])
        expected = round(float(np.clip(model.predict(
            pd.DataFrame([self.features])[FEATURE_COLUMNS])[0], 1, 5)), 2)
        with patch.object(app.mysql.connector, 'connect', side_effect=app.Error('offline')):
            response = self.client.post('/predict', json=self.inputs)
            health = self.client.get('/health').get_json()
        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result['predicted_gwa'], expected)
        self.assertEqual(result['performance_category'], gwa_to_category(expected))
        self.assertIsNone(result['assessment_id'])
        self.assertNotIn('tree_prediction', result)
        self.assertNotIn('agrees_with_gwa', result)
        self.assertNotIn('category_model', result['model_info'])
        self.assertTrue(health['models_loaded'])

    def test_storage_uses_only_features_and_regression_results(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.lastrowid = 42
        with patch.object(app.mysql.connector, 'connect', return_value=connection):
            response = self.client.post('/predict', json=self.inputs)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['assessment_id'], 42)
        query, values = cursor.execute.call_args.args
        self.assertEqual(len(values), 7)
        self.assertNotIn('tree_prediction', query)
        self.assertNotIn('agrees_with_gwa', query)
        connection.commit.assert_called_once()

    def test_history_selects_only_active_columns_from_existing_databases(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchall.return_value = []
        cursor.fetchone.return_value = {'total': 0}
        with patch.object(app.mysql.connector, 'connect', return_value=connection):
            response = self.client.get('/results')
        self.assertEqual(response.status_code, 200)
        query = cursor.execute.call_args_list[0].args[0]
        self.assertNotIn('SELECT *', query)
        self.assertIn('predicted_gwa', query)
        self.assertIn('created_at', query)

    def test_demo_derives_categories_from_rounded_clipped_gwa(self):
        for raw, gwa, category in [
            (0.5, 1.0, 'Excellent'), (1.754, 1.75, 'Excellent'),
            (1.76, 1.76, 'Good'), (2.50, 2.50, 'Good'),
            (2.51, 2.51, 'Satisfactory'), (3.00, 3.00, 'Satisfactory'),
            (3.01, 3.01, 'Failing'), (5.5, 5.0, 'Failing'),
        ]:
            with self.subTest(raw=raw):
                model = MagicMock()
                model.predict.return_value = [raw]
                self.assertEqual(predict_new_student(model, self.features), (gwa, category))

    def test_desktop_trains_a_single_regression_model(self):
        self.assertIsInstance(desktop.train_model(), LinearRegression)

    def test_input_validation_still_rejects_missing_and_out_of_range_features(self):
        self.assertEqual(self.client.post('/predict', json={}).status_code, 400)
        self.assertEqual(self.client.post('/predict', json={**self.inputs, 'studyDays': 8}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
