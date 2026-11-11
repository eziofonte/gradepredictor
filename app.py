import os
from flask import Flask, request, jsonify, send_from_directory, session
from acad_history.database import connect
from acad_history.account_history import setup as setup_accounts, save_prediction
from mysql.connector import Error
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from academic_performance_predictor import (
    generate_synthetic_data,
    FEATURE_COLUMNS,
    TARGET_SCORE,
    TARGET_CLASS,
    RANDOM_SEED,
    gwa_to_category,
)


HIGH_SOCIAL_MEDIA_HOURS = 2
HIGH_ACADEMIC_APP_HOURS = 4
MAX_SUGGESTIONS = 4


def get_suggestions(category, inputs):
    """Return a category message followed by tips for reported habits."""
    category_messages = {
        'Excellent': 'Keep up the study habits supporting your excellent result.',
        'Good': 'Build on your good result with consistent study habits.',
        'Satisfactory': 'Strengthen your study routine to improve your result.',
        'Failing': 'Seek academic support and work on a manageable study plan.',
    }
    suggestions = [category_messages[category]]
    if inputs['socialPhoneUse'] > HIGH_SOCIAL_MEDIA_HOURS:
        suggestions.append('Set app limits and schedule phone-free study blocks.')
    if inputs['academicPhoneUse'] > HIGH_ACADEMIC_APP_HOURS:
        suggestions.append('Check whether this time is real study time or distraction.')
    return suggestions[:MAX_SUGGESTIONS]


def create_app(overrides=None):
    """Application factory pattern for Flask app."""
    app = Flask(__name__, static_folder=None)
    setup_accounts(app, overrides)

    # MySQL connection
    def get_db_connection():
        """Create and return a MySQL database connection."""
        try:
            connection = connect()
            return connection
        except Error:
            app.logger.warning('MySQL connection unavailable')
            return None

    def train_models():
        """Train the regression model once on synthetic
        data when the app starts (matches the desktop app's behavior:
        no saved model files, fresh training each run)."""
        df = generate_synthetic_data(n=400)
        X = df[FEATURE_COLUMNS]

        reg_model = LinearRegression()
        reg_model.fit(X, df[TARGET_SCORE])

        return reg_model

    def predict_new_student(reg_model, student_dict):
        """Given a dict of feature values for one student, return the GWA,
        the GWA-derived category (source of truth). Matches
        academic_performance_calculator_app.py's on_predict() logic exactly."""
        # NOTE: studyDuringPhone currently maps to BOTH academic_app_usage_hrs
        # and social_media_hrs below - this is a known limitation until
        # assessment.html has separate fields for each. See open TODO.
        features = {
            'daily_screen_time_hrs': float(student_dict.get('screenTime', 0)),
            'academic_app_usage_hrs': float(student_dict.get('academicPhoneUse', 0)),
            'social_media_hrs': float(student_dict.get('socialPhoneUse', 0)),
            'study_hours_per_day': float(student_dict.get('studyHours', 0)),
            'study_frequency_per_week': float(student_dict.get('studyDays', 0))
        }

        X_new = pd.DataFrame([features])[FEATURE_COLUMNS]
        gwa = float(np.clip(reg_model.predict(X_new)[0], 1.00, 5.00))
        gwa = round(gwa, 2)

        category = gwa_to_category(gwa)  # source of truth, always derived from GWA

        return gwa, category

    # Initialize models
    try:
        reg_model = train_models()
        print("Models initialized successfully")
    except Exception as e:
        print(f"Failed to initialize models: {e}")
        reg_model = None

    # Serve frontend
    @app.route('/')
    def serve_index():
        return send_from_directory('html', 'index.html')

    @app.get('/<page>.html')
    def serve_page(page):
        if page not in ('index', 'assessment', 'history', 'hiw', 'privacy', 'terms'):
            return jsonify({'error': 'Not found'}), 404
        return send_from_directory('html', page + '.html')

    @app.get('/html/<page>.html')
    def serve_html_page(page):
        return serve_page(page)

    @app.get('/js/<path:filename>')
    def serve_js(filename):
        return send_from_directory('js', filename)

    @app.get('/assets/<path:filename>')
    def serve_assets(filename):
        return send_from_directory('assets', filename)

    @app.get('/style.css')
    def serve_css():
        return send_from_directory('.', 'style.css')

    # Health check endpoint
    @app.route('/health')
    def health_check():
        """Simple health check endpoint."""
        db_connection = get_db_connection()
        db_status = 'connected' if db_connection and db_connection.is_connected() else 'disconnected'
        if db_connection:
            db_connection.close()

        return jsonify({
            'status': 'healthy',
            'database': db_status,
            'models_loaded': reg_model is not None
        })

    @app.route('/predict', methods=['POST'])
    def predict():
        data = request.get_json(silent=True)

        if not isinstance(data, dict) or not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        if any(key in data for key in ('user_id', 'userId', 'owner_id')):
            return jsonify({'error': 'User ownership is determined by your session.'}), 400
        expected = request.headers.get('X-Expected-User')
        actual = str(session.get('user_id', 'guest'))
        if expected is not None and expected != actual:
            return jsonify({'error': 'The signed-in account changed. Reload this page.'}), 409
        if data.get('save_to_history') is True and not session.get('user_id'):
            return jsonify({'error': 'Your session expired. Please sign in again.'}), 401
        if session.get('user_id') and data.get('save_to_history') is not True:
            return jsonify({'error': 'Your sign-in changed. Reload the page before submitting.'}), 409

        # Extract and validate required fields (matching assessment form)
        required_fields = ['screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays']
        missing_fields = [field for field in required_fields if not data.get(field) and data.get(field) != 0]

        if missing_fields:
            return jsonify({
                'error': f'Missing required fields: {", ".join(missing_fields)}'
            }), 400
        if data.get('academicTerm') not in ('1st Sem', '2nd Sem', 'Midyear'):
            return jsonify({'error': 'Academic term must be 1st Sem, 2nd Sem, or Midyear'}), 400
        if reg_model is None:
            return jsonify({"error": "Models not available"}), 500

        try:
            screenTime = float(data['screenTime'])
            academicPhoneUse = float(data['academicPhoneUse'])
            socialPhoneUse = float(data['socialPhoneUse'])
            studyHours = float(data['studyHours'])
            studyDays = float(data['studyDays'])

            # Validate ranges
            if not (0 <= screenTime <= 24):
                return jsonify({'error': 'Screen time must be between 0 and 24 hours'}), 400
            if not (0 <= academicPhoneUse <= 24):
                return jsonify({'error': 'Academic phone use must be between 0 and 24 hours'}), 400
            if not (0 <= socialPhoneUse <= 24):
                return jsonify({'error': 'Social phone use must be between 0 and 24 hours'}), 400
            if not (0 <= studyHours <= 24):
                return jsonify({'error': 'Study hours must be between 0 and 24 hours'}), 400
            if not (0 <= studyDays <= 7):
                return jsonify({'error': 'Study days must be between 0 and 7'}), 400

        except (ValueError, TypeError) as e:
            return jsonify({
                'error': f'Invalid value format: {str(e)}'
            }), 400

        # Make prediction using the real predictor
        student_data = {
            'screenTime': screenTime,
            'academicPhoneUse': academicPhoneUse,
            'socialPhoneUse': socialPhoneUse,
            'studyHours': studyHours,
            'studyDays': studyDays
        }

        predicted_gwa, performance_category = predict_new_student(reg_model, student_data)

        result = {
            'assessment_id': None, 'saved': False, 'save_error': None,
            'predicted_gwa': predicted_gwa,
            'performance_category': performance_category,
            'suggestions': get_suggestions(performance_category, student_data),
            'model_info': {
                'regression_model': 'Linear Regression',
                'note': 'performance_category is always derived from predicted_gwa via gwa_to_category()'
            }
        }
        if session.get('user_id'):
            saved, status = save_prediction(data, predicted_gwa, performance_category)
            if status != 200:
                return jsonify(saved), status
            result.update(saved)
            result['suggestions'] = get_suggestions(result['performance_category'], student_data)
        return jsonify(result)

    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Endpoint not found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'error': 'Internal server error'}), 500

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host=os.environ.get('APP_HOST', '127.0.0.1'),
            port=int(os.environ.get('APP_PORT', '5000')), debug=False)
