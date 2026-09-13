"""
Configuration module for the Academic Performance Estimator backend.
Edit this file with your local MySQL credentials.
"""

import os

# MySQL Database Configuration
MYSQL_CONFIG = {
    'host': 'localhost',
    'database': 'acad_perf',
    'user': 'root',  # CHANGE THIS TO YOUR MYSQL USERNAME
    'password': '',  # CHANGE THIS TO YOUR MYSQL PASSWORD
    'port': 3306
}

# Flask Configuration
FLASK_CONFIG = {
    'DEBUG': True,
    'PORT': 5000,
    'HOST': '0.0.0.0'
}

# Model Configuration
MODEL_CONFIG = {
    'MODEL_PATH': 'model/decision_tree_model.joblib',  # Path to your pre-trained model
    # If you don't have a pre-trained model, one will be created for demonstration
}

# Feature names (must match the order expected by the model)
FEATURE_NAMES = [
    'year_level',
    'screen_time_hours',
    'study_during_phone_hours',
    'study_hours_per_day',
    'study_days_per_week'
]

# Target labels for GWA bands
GWA_BANDS = {
    (1.00, 1.75): 'Excellent',
    (1.76, 2.50): 'Good',
    (2.51, 3.00): 'Satisfactory',
    (3.01, 5.00): 'Failing'
}
