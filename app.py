import os
import sys
from flask import Flask, request, jsonify, send_from_directory
import mysql.connector
from mysql.connector import Error
import math
import json
from pathlib import Path
import joblib
import pandas as pd
import config

MODEL_PATH = Path(__file__).resolve().parent / 'models' / 'short_form_gwa_model.joblib'
THIRD_YEAR_MODEL_PATH = Path(__file__).resolve().parent / 'models' / 'third_year_difficulty_model.joblib'
DIFFICULTY_PATH = THIRD_YEAR_MODEL_PATH.with_suffix('.difficulty.json')

def load_semester_difficulty():
    return json.loads(DIFFICULTY_PATH.read_text(encoding='utf-8'))

def gwa_to_category(gwa):
    if gwa <= 1.75:
        return 'Excellent'
    if gwa <= 2.50:
        return 'Good'
    if gwa <= 3.00:
        return 'Satisfactory'
    return 'Failing'

def ensure_database_exists():
    """Create the configured database if it doesn't exist yet.
    Connects without specifying a database, then creates it."""
    config_without_db = {k: v for k, v in config.MYSQL_CONFIG.items() if k != 'database'}
    try:
        conn = mysql.connector.connect(**config_without_db)
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {config.MYSQL_CONFIG['database']}")
        cursor.close()
        conn.close()
        print(f"✓ Database '{config.MYSQL_CONFIG['database']}' ready")
    except Error as e:
        print(f"Warning: Could not create database: {e}")

def create_app():
    """Application factory pattern for Flask app."""
    app = Flask(__name__, static_folder=None)

    # MySQL connection
    def get_db_connection():
        """Create and return a MySQL database connection."""
        try:
            connection = mysql.connector.connect(**config.MYSQL_CONFIG)
            return connection
        except Error as e:
            print(f"Error connecting to MySQL: {e}")
            return None

    try:
        reg_model = joblib.load(MODEL_PATH)
    except Exception as e:
        app.logger.error('Unable to load survey model: %s', e)
        reg_model = None
    try:
        difficulty_model = joblib.load(THIRD_YEAR_MODEL_PATH)
        semester_difficulties = load_semester_difficulty()
    except Exception as e:
        app.logger.error('Unable to load third-year model: %s', e)
        difficulty_model, semester_difficulties = None, {}

    # Serve frontend files
    @app.route('/')
    def serve_index():
        """Serve the main index.html file."""
        return send_from_directory('.', 'html/index.html')

    @app.route('/<path:path>')
    def serve_static(path):
        """Serve static files (HTML, CSS, JS) from the project root."""
        # Prevent directory traversal attacks
        if '..' in path or path.startswith('/') or not (path.startswith(('html/', 'js/')) or path in ('style.css', 'index.html', 'assessment.html', 'history.html')):
            return jsonify({'error': 'Not found'}), 404

        # Check if file exists in root or html/ directory
        if os.path.isfile(f'.{os.sep}{path}'):
            return send_from_directory('.', path)
        elif os.path.isfile(f'html{os.sep}{path}'):
            return send_from_directory('html', path)
        else:
            # Try to serve from js/ directory for script files
            if path.startswith('js/') and os.path.isfile(f'.{os.sep}{path}'):
                return send_from_directory('.', path)
            return jsonify({'error': 'Not found'}), 404

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

    # Prediction endpoint
    @app.route('/predict', methods=['POST'])
    def predict():
        if reg_model is None:
            return jsonify({'error': 'Survey model unavailable'}), 503
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({'error': 'A JSON object is required'}), 400
        year_value = data.get('yearLevel')
        year = {'2nd Year': '2', '3rd Year': '3', '4th Year': '4'}.get(year_value) if isinstance(year_value, str) else None
        program = data.get('program')
        try:
            screen = float(data.get('screenTime'))
        except (TypeError, ValueError):
            screen = float('nan')
        if not year or program not in ('BSIT', 'BSCS'):
            return jsonify({'error': 'Select BSIT or BSCS and a year from 2nd to 4th.'}), 400
        if isinstance(data.get('screenTime'), bool) or not math.isfinite(screen) or not 0 <= screen <= 24:
            return jsonify({'error': 'Screen time must be between 0 and 24 hours.'}), 400
        responses = {}
        for field, maximum in [('academicPhoneUse', 24), ('socialPhoneUse', 24), ('studyHours', 24), ('studyDays', 7)]:
            value = data.get(field)
            try:
                number = float(value)
            except (TypeError, ValueError):
                number = float('nan')
            if isinstance(value, bool) or not math.isfinite(number) or not 0 <= number <= maximum or (field == 'studyDays' and not number.is_integer()):
                return jsonify({'error': f'{field} must be within its allowed range.'}), 400
            responses[field] = number
        if year == '3':
            if difficulty_model is None:
                return jsonify({'error': 'Third-year difficulty model unavailable'}), 503
            term = data.get('thirdYearSemester')
            if not isinstance(term, str) or term not in ('1st Sem', '2nd Sem'):
                return jsonify({'error': 'Select a completed third-year semester.'}), 400
            difficulty = semester_difficulties.get(program, {}).get(term)
            if not isinstance(difficulty, (int, float)) or not math.isfinite(difficulty) or not 1 <= difficulty <= 5:
                return jsonify({'error': 'Semester difficulty data unavailable'}), 503
            features = {'screen': screen, 'program': program, 'term': term, 'difficulty': difficulty}
            raw = float(difficulty_model.predict(pd.DataFrame([features]))[0])
            note = 'Uses screen time, program, semester and average difficulty from survey respondents; estimates that completed third-year semester.'
        else:
            features = {'screen_hours': screen, 'program': program, 'year_level': year}
            raw = float(reg_model.predict(pd.DataFrame([features]))[0])
            note = 'Uses screen time, program and year only; other answers do not affect the retrospective estimate.'
        gwa = round(min(5.0, max(1.0, raw)), 2)
        suggestions = [
            f"You reported {responses['studyHours']:g} study hours per day and {responses['studyDays']:g} study days per week. Consider whether this routine gives you enough time for your coursework.",
            f"During study time, you reported {responses['academicPhoneUse']:g} hours of academic phone use and {responses['socialPhoneUse']:g} hours of social or entertainment phone use. Consider whether the balance supports your focus."
        ]
        return jsonify({'predicted_gwa': gwa, 'performance_category': gwa_to_category(gwa), 'suggestions': suggestions,
                        'semester_difficulty': difficulty if year == '3' else None,
                        'model_info': {'regression_model': 'Ridge regression trained on survey data',
                                       'note': note},
                        'saved': False})

    # Results endpoints
    @app.route('/results', methods=['GET'])
    def get_results():
        """Get all assessment results with optional filtering."""
        try:
            db_connection = get_db_connection()
            if not db_connection or not db_connection.is_connected():
                return jsonify({'error': 'Database connection failed'}), 500

            cursor = db_connection.cursor(dictionary=True)

            limit = request.args.get('limit', 100, type=int)
            offset = request.args.get('offset', 0, type=int)

            query = """SELECT id, daily_screen_time_hrs, academic_app_usage_hrs,
                       social_media_hrs, study_hours_per_day, study_frequency_per_week,
                       predicted_gwa, performance_category, created_at
                       FROM assessments ORDER BY created_at DESC LIMIT %s OFFSET %s"""
            cursor.execute(query, [limit, offset])
            results = cursor.fetchall()

            cursor.execute("SELECT COUNT(*) as total FROM assessments")
            total_count = cursor.fetchone()['total']

            cursor.close()
            db_connection.close()

            return jsonify({
                'results': results,
                'pagination': {
                    'total': total_count,
                    'limit': limit,
                    'offset': offset,
                    'has_more': (offset + limit) < total_count
                }
            })

        except Error as e:
            print(f"Database error in get_results: {e}")
            return jsonify({'error': 'Database error'}), 500
        except Exception as e:
            print(f"Error in get_results: {e}")
            return jsonify({'error': 'Internal server error'}), 500

    @app.route('/results/summary', methods=['GET'])
    def get_results_summary():
        """Get summary statistics of assessment results."""
        try:
            db_connection = get_db_connection()
            if not db_connection or not db_connection.is_connected():
                return jsonify({'error': 'Database connection failed'}), 500

            cursor = db_connection.cursor(dictionary=True)

            # Get overall statistics
            cursor.execute("""
                SELECT
                    COUNT(*) as total_assessments,
                    AVG(predicted_gwa) as avg_gwa,
                    MIN(predicted_gwa) as min_gwa,
                    MAX(predicted_gwa) as max_gwa,
                    COUNT(CASE WHEN performance_category = 'Excellent' THEN 1 END) as excellent_count,
                    COUNT(CASE WHEN performance_category = 'Good' THEN 1 END) as good_count,
                    COUNT(CASE WHEN performance_category = 'Satisfactory' THEN 1 END) as satisfactory_count,
                    COUNT(CASE WHEN performance_category = 'Failing' THEN 1 END) as failing_count
                FROM assessments
            """)
            overall_stats = cursor.fetchone()

            cursor.close()
            db_connection.close()

            # Calculate percentages
            total = overall_stats['total_assessments'] or 1  # Avoid division by zero
            summary = {
                'total_assessments': overall_stats['total_assessments'],
                'avg_gwa': round(overall_stats['avg_gwa'], 2) if overall_stats['avg_gwa'] else 0,
                'min_gwa': round(overall_stats['min_gwa'], 2) if overall_stats['min_gwa'] else 0,
                'max_gwa': round(overall_stats['max_gwa'], 2) if overall_stats['max_gwa'] else 0,
                'band_distribution': {
                    'excellent': {
                        'count': overall_stats['excellent_count'],
                        'percentage': round((overall_stats['excellent_count'] / total) * 100, 1)
                    },
                    'good': {
                        'count': overall_stats['good_count'],
                        'percentage': round((overall_stats['good_count'] / total) * 100, 1)
                    },
                    'satisfactory': {
                        'count': overall_stats['satisfactory_count'],
                        'percentage': round((overall_stats['satisfactory_count'] / total) * 100, 1)
                    },
                    'failing': {
                        'count': overall_stats['failing_count'],
                        'percentage': round((overall_stats['failing_count'] / total) * 100, 1)
                    }
                },
            }

            return jsonify(summary)

        except Error as e:
            print(f"Database error in get_results_summary: {e}")
            return jsonify({'error': 'Database error'}), 500
        except Exception as e:
            print(f"Error in get_results_summary: {e}")
            return jsonify({'error': 'Internal server error'}), 500

    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Endpoint not found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'error': 'Internal server error'}), 500

    return app

if __name__ == '__main__':
    # Create the app
    app = create_app()

    # Print startup information
    print("=" * 60)
    print("Academic Performance Estimator Backend")
    print("Impact of Cellphone Usage and Study Habits in the Academic Performance of PLM Students")
    print("=" * 60)
    print("To run locally:")
    print("1. pip install -r requirements.txt")
    print("2. Edit config.py with your local MySQL credentials")
    print("3. python app.py")
    print()
    print(f"Server will run on: http://{config.FLASK_CONFIG['HOST']}:{config.FLASK_CONFIG['PORT']}")
    print("Frontend will be served at the root URL")
    print("API Endpoints:")
    print("  GET  /                    - Serves frontend (index.html)")
    print("  GET  /<path>              - Serves static assets (CSS, JS, HTML)")
    print("  GET  /health              - Health check")
    print("  POST /predict             - Submit assessment for prediction")
    print("  GET  /results             - Get assessment results (with filtering)")
    print("  GET  /results/summary     - Get summary statistics")
    print("=" * 60)

    ensure_database_exists()

    # Test database connection on startup
    print("Testing MySQL connection...")
    try:
        db_connection = mysql.connector.connect(**config.MYSQL_CONFIG)
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        db_connection = None

    if db_connection and db_connection.is_connected():
        print("✓ MySQL connection successful")
        db_connection.close()

        # Try to create assessments table if it doesn't exist
        try:
            connection = mysql.connector.connect(**config.MYSQL_CONFIG)
            if connection and connection.is_connected():
                cursor = connection.cursor()
                create_table_query = """
                CREATE TABLE IF NOT EXISTS assessments (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    daily_screen_time_hrs FLOAT,
                    academic_app_usage_hrs FLOAT,
                    social_media_hrs FLOAT,
                    study_hours_per_day FLOAT,
                    study_frequency_per_week FLOAT,
                    predicted_gwa FLOAT,
                    performance_category VARCHAR(20),
                    tree_prediction VARCHAR(20),
                    agrees_with_gwa BOOLEAN,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
                cursor.execute(create_table_query)
                connection.commit()
                cursor.close()
                connection.close()
                print("✓ Assessments table ready")
        except Error as e:
            print(f"Warning: Could not create assessments table: {e}")
    else:
        print("✗ MySQL connection failed - continuing without database storage")
        print("  Please check your MySQL credentials in config.py")


    print("=" * 60)

    # Run the Flask app
    app.run(
        host=config.FLASK_CONFIG['HOST'],
        port=config.FLASK_CONFIG['PORT'],
        debug=config.FLASK_CONFIG['DEBUG']
    )
