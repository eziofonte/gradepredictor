from pathlib import Path
import json
import joblib
from flask import Flask, request, jsonify, send_from_directory, session
from acad_perf.history.database import connect
from acad_perf.history.account_history import setup as setup_accounts, save_prediction
from mysql.connector import Error
import numpy as np
import pandas as pd

from acad_perf.predictor import gwa_to_category


HIGH_SOCIAL_MEDIA_HOURS = 2
HIGH_ACADEMIC_APP_HOURS = 4
MAX_SUGGESTIONS = 4
FRONTEND_DIR = Path(__file__).resolve().parent.parent / 'frontend'
MODEL_DIR = Path(__file__).resolve().parent.parent / 'models'


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

    try:
        reg_model = joblib.load(MODEL_DIR / 'short_form_gwa_model.joblib')
        difficulty_model = joblib.load(MODEL_DIR / 'third_year_difficulty_model.joblib')
        semester_difficulties = json.loads((MODEL_DIR / 'third_year_difficulty_model.difficulty.json').read_text(encoding='utf-8'))
    except Exception as e:
        app.logger.exception('Unable to load trained survey models: %s', e)
        reg_model = difficulty_model = None
        semester_difficulties = {}

    # Serve frontend
    @app.route('/')
    def serve_index():
        return send_from_directory(FRONTEND_DIR / 'html', 'index.html')

    @app.get('/<page>.html')
    def serve_page(page):
        if page not in ('index', 'assessment', 'history', 'hiw', 'privacy', 'terms'):
            return jsonify({'error': 'Not found'}), 404
        return send_from_directory(FRONTEND_DIR / 'html', page + '.html')

    @app.get('/html/<page>.html')
    def serve_html_page(page):
        return serve_page(page)

    @app.get('/js/<path:filename>')
    def serve_js(filename):
        return send_from_directory(FRONTEND_DIR / 'js', filename)

    @app.get('/assets/<path:filename>')
    def serve_assets(filename):
        return send_from_directory(FRONTEND_DIR / 'assets', filename)

    @app.get('/style.css')
    @app.get('/css/style.css')
    def serve_css():
        return send_from_directory(FRONTEND_DIR / 'css', 'style.css')

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
            'models_loaded': reg_model is not None and difficulty_model is not None
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
            return jsonify({"error": "Trained survey model is unavailable"}), 503
        year = {'2nd Year': '2', '3rd Year': '3', '4th Year': '4'}.get(data.get('yearLevel'))
        program = data.get('program')
        if year is None or program not in ('BSIT', 'BSCS'):
            return jsonify({'error': 'Choose a supported year (2nd to 4th) and BSIT or BSCS.'}), 400

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

        student_data = {
            'screenTime': screenTime,
            'academicPhoneUse': academicPhoneUse,
            'socialPhoneUse': socialPhoneUse,
            'studyHours': studyHours,
            'studyDays': studyDays
        }

        semester_difficulty = None
        if year == '3':
            term = data['academicTerm']
            if term not in ('1st Sem', '2nd Sem'):
                return jsonify({'error': 'Third-year estimates require the first or second semester.'}), 400
            semester_difficulty = semester_difficulties.get(program, {}).get(term)
            if difficulty_model is None or semester_difficulty is None:
                return jsonify({'error': 'Third-year survey model is unavailable.'}), 503
            features = pd.DataFrame([{'screen': screenTime, 'program': program,
                                      'term': term, 'difficulty': semester_difficulty}])
            raw_gwa = float(difficulty_model.predict(features)[0])
            model_note = ('Estimates a completed third-year semester using reported screen time and the survey average subject difficulty for the selected program and semester. This retrospective estimate is exploratory.')
        else:
            features = pd.DataFrame([{'screen_hours': screenTime, 'program': program, 'year_level': year}])
            raw_gwa = float(reg_model.predict(features)[0])
            model_note = 'Uses the trained survey model with screen time, program, and year. Other survey answers provide study suggestions but do not change GWA.'
        predicted_gwa = round(float(np.clip(raw_gwa, 1.0, 5.0)), 2)
        performance_category = gwa_to_category(predicted_gwa)

        result = {
            'assessment_id': None, 'saved': False, 'save_error': None,
            'predicted_gwa': predicted_gwa,
            'performance_category': performance_category,
            'suggestions': get_suggestions(performance_category, student_data),
            'semester_difficulty': semester_difficulty,
            'model_info': {
                'regression_model': 'Ridge regression trained on collected survey data',
                'note': model_note
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


