# Field Mapping Gap Analysis

## Current assessment.html Form Fields:
1. Year level (id="yearLevel") - Select dropdown
2. Program / Course (id="program") - Text input
3. Average daily screen time (hours) (id="screenTime") - Number input
4. Cellphone use during study time (hours) (id="studyDuringPhone") - Number input
5. Average study hours per day (id="studyHours") - Number input
6. Study frequency per week (days) (id="studyDays") - Number input

## FEATURE_COLUMNS from academic_performance_predictor.py:
1. "daily_screen_time_hrs"     # total phone screen time per day
2. "academic_app_usage_hrs"    # screen time used for academic/school purposes
3. "social_media_hrs"          # time on social media / entertainment apps
4. "study_hours_per_day"       # average hours spent studying per day
5. "study_frequency_per_week"  # number of days per week the student studies

## Direct Mappings:
- screenTime → daily_screen_time_hrs ✓
- studyHours → study_hours_per_day ✓
- studyDays → study_frequency_per_week ✓

## Fields Requiring Attention:

### 1. Year level (yearLevel) and Program / Course (program)
- **Status**: Not used in prediction model
- **Purpose**: Demographic information for filtering/storage only
- **Handling**: Should be stored in database but NOT used for prediction
- **Current backend implementation**: Already handles this correctly

### 2. Cellphone use during study time (studyDuringPhone)
- **Status**: AMBIGUOUS MAPPING - NEEDS CLARIFICATION
- **Problem**: This single field attempts to capture two distinct concepts:
  - academic_app_usage_hrs (educational/school-related phone use)
  - social_media_hrs (entertainment/non-academic phone use)
- **Current backend implementation**: Uses this value for BOTH fields (limitation)
- **Gap**: Missing separate fields for academic vs. social phone usage

## Recommended Solution:
To properly map to the 5 FEATURE_COLUMNS, the assessment form should be updated to include:

### Option A (Minimal Change - Keep Current Form):
- Keep studyDuringPhone as-is
- Clearly document that it represents TOTAL phone use during study time
- Split it arbitrarily or based on assumptions for prediction (NOT IDEAL)
- **Not recommended** as it loses important distinction

### Option B (Recommended - Update Form):
Split the "Cellphone use during study time" into two separate fields:
1. "Academic phone use during study time (hours)" → academic_app_usage_hrs
2. "Social phone use during study time (hours)" → social_media_hrs

### Option C (Alternative - Add Clarifying Fields):
Keep studyDuringPhone but add two new fields:
1. "Percentage of study phone use that is academic (%)" 
2. Or "Academic vs social phone use ratio"

## Current State in Backend:
The backend currently maps studyDuringPhone to BOTH academic_app_usage_hrs AND social_media_hrs, which means:
- If a student reports 2 hours of phone use during study time
- The model sees: 2 hours academic use AND 2 hours social use
- This artificially inflates the total phone influence and creates inconsistency

## Thesis Implications:
This gap should be acknowledged in your thesis as:
1. A limitation of the current prototype
2. An area for future improvement in the survey instrument
3. The reason why yearLevel and program are collected but not used in prediction (demographic only)
4. How the model handles the ambiguity (current approach vs. ideal approach)

## Files to Reference:
- html/assessment.html - Current form implementation
- js/assessment.js - Current form handling logic
- academic_performance_predictor.py - Source of FEATURE_COLUMNS and prediction logic
- app.py - Backend implementation showing current mapping

## Conclusion:
To achieve perfect field mapping, the assessment form needs two additional number inputs to separately capture academic and social phone usage during study time. Until then, the backend makes the best effort mapping available while clearly documenting this limitation.
