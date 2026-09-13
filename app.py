import os
import sys
from flask import Flask, request, jsonify, send_from_directory
import mysql.connector
from mysql.connector import Error
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeClassifier
import config
from academic_performance_predictor import (
    generate_synthetic_data,
    FEATURE_COLUMNS,
    TARGET_SCORE,
    TARGET_CLASS,
    RANDOM_SEED,
    gwa_to_category,
)
import config

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

    def train_models():
        """Train the regression + decision tree models once on synthetic
        data when the app starts (matches the desktop app's behavior:
        no saved model files, fresh training each run)."""
        df = generate_synthetic_data(n=400)
        X = df[FEATURE_COLUMNS]

        reg_model = LinearRegression()
        reg_model.fit(X, df[TARGET_SCORE])

        clf_model = DecisionTreeClassifier(max_depth=4, min_samples_leaf=8, random_state=RANDOM_SEED)
        clf_model.fit(X, df[TARGET_CLASS])

        return reg_model, clf_model

    def predict_new_student(reg_model, clf_model, student_dict):
        """Given a dict of feature values for one student, return the GWA,
        the GWA-derived category (source of truth), and the tree's separate
        category prediction for an agree/disagree cross-check. Matches
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

        category = gwa_to_category(gwa)          # source of truth, always derived from GWA
        tree_category = clf_model.predict(X_new)[0]  # separate cross-check, never used for display
        agrees_with_gwa = bool(tree_category == category)

        return gwa, category, tree_category, agrees_with_gwa

    # Initialize models
    try:
        reg_model, clf_model = train_models()
        print("Models initialized successfully")
    except Exception as e:
        print(f"Failed to initialize models: {e}")
        reg_model, clf_model = None, None

    # Serve frontend files
    @app.route('/')
    def serve_index():
        """Serve the main index.html file."""
        return send_from_directory('.', 'html/index.html')

    @app.route('/<path:path>')
    def serve_static(path):
        """Serve static files (HTML, CSS, JS) from the project root."""
        # Prevent directory traversal attacks
        if '..' in path or path.startswith('/'):
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
            'models_loaded': reg_model is not None and clf_model is not None
        })

    # Prediction endpoint
    @app.route('/predict', methods=['POST'])
    def predict():
        """Handle prediction requests from the assessment form."""
        if reg_model is None or clf_model is None:
            return jsonify({'error': 'Models not available'}), 500

        try:
            # Get JSON data from request
            data = request.get_json()

            if not data:
                return jsonify({'error': 'No JSON data provided'}), 400

            # Extract and validate required fields (matching assessment form)
            required_fields = ['screenTime', 'academicPhoneUse', 'socialPhoneUse', 'studyHours', 'studyDays']
            missing_fields = [field for field in required_fields if not data.get(field) and data.get(field) != 0]

            if missing_fields:
                return jsonify({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                }), 400

            # Convert to appropriate types and validate
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

            predicted_gwa, performance_category, tree_category, agrees_with_gwa = predict_new_student(reg_model, clf_model, student_data)

            # Try to store result in database (optional, continue if fails)
            db_connection = get_db_connection()
            if db_connection and db_connection.is_connected():
                try:
                    cursor = db_connection.cursor()
                    insert_query = """
                    INSERT INTO assessments
                    (daily_screen_time_hrs, academic_app_usage_hrs, social_media_hrs,
                     study_hours_per_day, study_frequency_per_week,
                     predicted_gwa, performance_category, tree_prediction, agrees_with_gwa)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    cursor.execute(insert_query, (
                        screenTime,
                        academicPhoneUse,
                        socialPhoneUse,
                        studyHours,
                        studyDays,
                        predicted_gwa,
                        performance_category,
                        str(tree_category),
                        agrees_with_gwa
                    ))
                    assessment_id = cursor.lastrowid
                    db_connection.commit()
                    cursor.close()
                except Error as e:
                    print(f"Warning: Could not store assessment in database: {e}")
                    assessment_id = None
                finally:
                    if db_connection.is_connected():
                        db_connection.close()
            else:
                assessment_id = None

            # Return prediction result
            return jsonify({
                'assessment_id': assessment_id,
                'predicted_gwa': predicted_gwa,
                'performance_category': performance_category,
                'tree_prediction': str(tree_category),
                'agrees_with_gwa': agrees_with_gwa,
                'model_info': {
                    'regression_model': 'Linear Regression',
                    'category_model': 'Decision Tree (max_depth=4, min_samples_leaf=8)',
                    'note': 'performance_category is always derived from predicted_gwa via gwa_to_category(); tree_prediction is shown as a separate agreement check, never used for display.'
                }
            })

        except Exception as e:
            print(f"Error in prediction: {e}")
            return jsonify({'error': 'Internal server error'}), 500

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

            query = "SELECT * FROM assessments ORDER BY created_at DESC LIMIT %s OFFSET %s"
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