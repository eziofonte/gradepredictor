# Academic Performance Estimator - System Design

## Overview
The Academic Performance Estimator is a web application that predicts students' General Weighted Average (GWA) based on their cellphone usage and study habits. The system consists of a Flask backend with machine learning models and a responsive frontend built with HTML, CSS, and JavaScript.

## System Architecture

### High-Level Components
```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│   Frontend      │    │     Backend      │    │   Machine Learning │
│  (HTML/CSS/JS)  │◄──►│   (Flask API)    │◄──►│     Models         │
└─────────────────┘    └──────────────────┘    └────────────────────┘
                              │
                              ▼
                      ┌────────────────┐
                      │   Database     │
                      │   (MySQL)      │
                      └────────────────┘
```

### Backend Architecture
- **Framework**: Flask (Python web framework)
- **API Design**: RESTful endpoints for prediction and results retrieval
- **Database**: MySQL for storing assessment results
- **Machine Learning**: 
  - Linear Regression model for GWA prediction (1.00-5.00 scale)
  - Decision Tree classifier for performance category prediction
  - Models trained on synthetic data during application startup
- **Configuration**: Separate config.py for database and Flask settings

### Frontend Architecture
- **Structure**: Single-page application with multiple sections (hero, how-it-works, assessment, etc.)
- **Styling**: CSS with CSS variables for theming and easy customization
- **Interactivity**: Vanilla JavaScript for form handling, API calls, and UI updates
- **Responsiveness**: Mobile-first design with flexible layouts
- **Offline Support**: Local storage for caching assessment results

## Detailed Component Design

### 1. Backend Components

#### app.py
- **Application Factory Pattern**: Uses `create_app()` function for modular application creation
- **Model Initialization**: Trains regression and classification models on synthetic data at startup
- **Database Connection**: MySQL connector with connection pooling
- **API Endpoints**:
  - `GET /`: Serves frontend index.html
  - `GET /<path>`: Serves static assets (CSS, JS, HTML)
  - `GET /health`: Health check endpoint
  - `POST /predict`: Main prediction endpoint
  - `GET /results`: Retrieves assessment results with pagination
  - `GET /results/summary`: Gets summary statistics
- **Error Handling**: Custom error handlers for 404 and 500 errors
- **Database Initialization**: Creates assessments table if it doesn't exist on startup

#### academic_performance_predictor.py
- **Synthetic Data Generation**: Creates realistic training data for model development
- **Feature Engineering**: Defines 5 key features:
  - daily_screen_time_hrs
  - academic_app_usage_hrs  
  - social_media_hrs
  - study_hours_per_day
  - study_frequency_per_week
- **Target Variables**:
  - TARGET_SCORE: academic_performance_gwa (1.00-5.00, lower=better)
  - TARGET_CLASS: performance_category (derived from GWA)
- **Model Training**: 
  - Linear Regression for GWA prediction
  - Decision Tree Classifier for category prediction
- **Prediction Function**: Converts student input to GWA and category predictions
- **GWA to Category Mapping**: 
  - Excellent: 1.00-1.75
  - Good: 1.76-2.50
  - Satisfactory: 2.51-3.00
  - Failing: 3.01-5.00

#### config.py
- **MySQL Configuration**: Host, database, user, password, port settings
- **Flask Configuration**: Debug mode, host, port settings
- **Model Configuration**: Path for pre-trained models
- **Feature Names**: Expected feature order for models
- **GWA Bands**: Mapping of GWA ranges to performance categories

### 2. Frontend Components

#### HTML Structure (index.html)
- **Semantic Structure**: Proper HTML5 elements with ARIA-like attributes
- **Navigation**: Fixed top navigation with active state tracking
- **Sections**: 
  - Hero: Introduction with GWA scale visual
  - How It Works: Explanation of the estimation process
  - Assessment: Interactive form for predictions
  - Dashboard/History: Linked pages for results viewing
- **Accessibility**: Proper labeling, color contrast, and focus management

#### CSS Styling (style.css)
- **CSS Variables**: Centralized theme definition:
  - --navy: Primary background color (#16232F)
  - --navy-panel: Secondary background (#1F3245)
  - --paper: Card background (#F4F1E8)
  - --sage: Accent color (#8FA283)
  - --sage-dark: Darker accent (#71836A)
  - --gold: Highlight color (#D3B673)
  - --ink-light: Text color (#ECE8DC)
  - --muted: Secondary text (#9FAAB3)
- **Responsive Design**: Media queries for different screen sizes
- **Component Styling**: Consistent styling for forms, buttons, panels, etc.
- **Visual Hierarchy**: Clear typography scale and spacing system
- **Performance Bands**: Color-coded bands for Excellent, Good, Satisfactory, Failing

#### JavaScript Logic
- **assessment.js**: Main assessment form logic
  - Form validation and submission handling
  - API communication with backend (/predict endpoint)
  - Result display with appropriate styling
  - Local storage integration for offline backup
  - Loading states and error handling
- **storage.js**: Local storage utilities for persisting assessment data
- **chatbot-widget.js**: Floating chatbot interface for user assistance
- **script.js**: Main application script (navigation, IntersectionObserver for active nav links)

### 3. Data Flow

#### Prediction Flow
1. User fills out assessment form in frontend
2. Form data validated and sent via POST to `/predict` endpoint
3. Backend receives JSON payload with:
   - screenTime, academicPhoneUse, socialPhoneUse, studyHours, studyDays
4. Backend:
   - Validates input ranges
   - Creates feature dictionary for model
   - Uses pre-trained Linear Regression model to predict GWA
   - Converts GWA to performance category using gwa_to_category()
   - Optionally stores result in MySQL database
   - Returns JSON response with prediction results
5. Frontend:
   - Receives prediction result
   - Updates UI with GWA value and performance band
   - Saves entry to localStorage
   - Shows result panel

#### Results Retrieval Flow
1. User navigates to dashboard or history page
2. Frontend makes GET request to `/results` or `/results/summary` endpoint
3. Backend:
   - Queries MySQL database for assessment records
   - Applies pagination and filtering as needed
   - Returns JSON response with results
4. Frontend:
   - Renders results in appropriate format (table, charts, etc.)

### 4. Design Decisions and Rationale

#### Technology Stack
- **Flask**: Chosen for simplicity, Python ecosystem, and easy ML integration
- **MySQL**: Reliable, widely-used relational database for structured assessment data
- **Scikit-learn**: Industry-standard ML library with Linear Regression and Decision Tree algorithms
- **Vanilla HTML/CSS/JS**: No framework dependencies for lightweight, fast-loading frontend
- **CSS Variables**: Enable easy theming and maintenance without preprocessors

#### Machine Learning Approach
- **Synthetic Data Training**: Used during development when real survey data unavailable
- **Model Selection**: 
  - Linear Regression for continuous GWA prediction (interpretable coefficients)
  - Decision Tree for categorical classification (handles non-linear relationships)
- **Feature Engineering**: Five carefully selected features representing cellphone usage and study habits
- **Target Variable**: GWA on 1.00-5.00 scale (lower=better) matching Philippine university convention

#### User Experience Design
- **Progressive Disclosure**: Form broken into logical sections (Student, Cellphone Usage, Study Habits)
- **Visual Feedback**: Clear result presentation with GWA value and color-coded performance band
- **Error Handling**: Informative error messages for invalid inputs or system issues
- **Accessibility**: Proper color contrast, focus management, and semantic HTML
- **Mobile Responsiveness**: Design works across device sizes from mobile to desktop

#### Data Persistence Strategy
- **Primary Storage**: MySQL database for permanent record keeping
- **Secondary Storage**: LocalStorage for offline access and backup
- **Optional Database**: Application continues to function even if database unavailable
- **Assessment ID**: Database-generated ID for tracking individual assessments

#### Security Considerations
- **Input Validation**: Both frontend (HTML5 attributes) and backend (range checking)
- **SQL Injection Prevention**: Parameterized queries in database operations
- **XSS Prevention**: Proper escaping in Flask responses (JSON API reduces risk)
- **CSRF Protection**: Not implemented as API is primarily for same-origin use
- **Directory Traversal Prevention**: Path checking in static file serving

### 5. Extensibility and Future Enhancements

#### Planned Improvements
1. **Real Data Integration**: Replace synthetic data with actual survey data from PLM students
2. **Model Persistence**: Save trained models to disk instead of retraining on each startup
3. **Enhanced Analytics**: 
   - Data visualization dashboards
   - Trend analysis over time
   - Comparative statistics
4. **User Features**:
   - User accounts and authentication
   - Personal assessment history
   - Goal setting and progress tracking
5. **Performance Optimization**:
   - CSS and JavaScript minification
   - Image optimization (when assets added)
   - Caching strategies
   - Service workers for offline capability
6. **API Enhancements**:
   - Additional filtering and sorting options
   - Export functionality (CSV, PDF)
   - WebSocket integration for real-time updates

#### Configuration Flexibility
- **Environment Variables**: Configurable via environment variables for different deployments
- **Model Swapping**: Easy to replace ML models with different algorithms
- **Feature Expansion**: Simple to add new features to the prediction model
- **Theme Customization**: CSS variables allow easy color scheme changes

### 6. Implementation Details

#### File Structure
```
acad-perf/
├── app.py                  # Main Flask application
├── academic_performance_predictor.py  # ML model training and prediction logic
├── config.py               # Configuration settings
├── requirements.txt        # Python dependencies
├── style.css               # Global stylesheet
├── html/                   # HTML pages
│   ├── index.html          # Home page
│   ├── assessment.html     # Assessment form
│   ├── dashboard.html      # Results dashboard
│   ├── history.html        # History view
│   ├── hiw.html            # How it works
│   └── chatbot.html        # Chatbot interface
├── js/                     # JavaScript files
│   ├── script.js           # Main application script
│   ├── assessment.js       # Assessment form logic
│   ├── dashboard.js        # Dashboard logic
│   ├── history.js          # History logic
│   └── storage.js          # Local storage utilities
└── docs/                   # Documentation
    └── README.md           # Project documentation
```

#### Key Algorithms
1. **GWA Prediction**:
   - Input: 5-dimensional feature vector (cellphone usage + study habits)
   - Process: Linear regression model → continuous GWA value (1.00-5.00)
   - Output: Predicted GWA rounded to 2 decimal places

2. **Performance Classification**:
   - Input: Same 5-dimensional feature vector
   - Process: Decision tree model → categorical prediction
   - Output: Performance category (Excellent/Good/Satisfactory/Failing)
   - Note: Displayed category is always derived from predicted GWA via gwa_to_category() for consistency

#### Data Models
**Assessment Record** (MySQL table):
- id: INT AUTO_INCREMENT PRIMARY KEY
- daily_screen_time_hrs: FLOAT
- academic_app_usage_hrs: FLOAT
- social_media_hrs: FLOAT
- study_hours_per_day: FLOAT
- study_frequency_per_week: FLOAT
- predicted_gwa: FLOAT
- performance_category: VARCHAR(20)
- tree_prediction: VARCHAR(20)
- agrees_with_gwa: BOOLEAN
- created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 7. Deployment Considerations

#### Requirements
- Python 3.7+
- MySQL 5.7+
- pip package manager

#### Setup Steps
1. Clone repository
2. Install dependencies: `pip install -r requirements.txt`
3. Configure MySQL credentials in config.py
4. Ensure MySQL server is running and database exists
5. Run application: `python app.py`
6. Access via browser: http://localhost:5000

#### Environment Configuration
- **Development**: DEBUG=True, local MySQL instance
- **Production**: DEBUG=False, production MySQL, consider gunicorn/uWSGI
- **Environment Variables**: Override config values via environment variables for different deployments

### 8. Trade-offs and Limitations

#### Current Limitations
1. **Synthetic Data Dependency**: Models trained on synthetic data until real survey data collected
2. **Single Prediction Model**: No ensemble or uncertainty quantification
3. **Limited Features**: Only 5 input features used for prediction
4. **Basic Authentication**: No user authentication system implemented
5. **Simple Storage**: LocalStorage backup lacks synchronization capabilities

#### Design Trade-offs
1. **Simplicity vs. Features**: Chose vanilla JS over frameworks for simplicity and zero build step
2. **Development Speed vs. Optimization**: Prioritized working prototype over premature optimization
3. **Functionality vs. Security**: Basic security measures implemented; advanced security would require additional complexity
4. **Immediate Feedback vs. Batch Processing**: Real-time predictions vs. batch processing for efficiency

## Conclusion
The Academic Performance Estimator provides a solid foundation for predicting student academic performance based on digital habits and study patterns. The system follows modern web development practices with a clean separation of concerns, responsive design, and extensible architecture. The use of CSS variables, modular JavaScript, and a well-structured Flask API makes the system maintainable and ready for enhancement as real data becomes available and additional features are requested.