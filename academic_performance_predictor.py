"""
Once survey data is ready:
  1. Export it to a CSV with the SAME column names used in
     FEATURE_COLUMNS / TARGET_SCORE below (or rename your columns to
     match).
  2. In main(), replace:
         df = generate_synthetic_data(n=300)
     with:
         df = pd.read_csv("your_survey_data.csv")
  3. Everything downstream (training, evaluation, prediction) runs
     unchanged. You may need to re-tune gwa_to_category() to match
     PLM's actual grading/classification scheme.
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    mean_absolute_error, mean_squared_error, r2_score,
    accuracy_score, classification_report, confusion_matrix
)
import matplotlib.pyplot as plt

RANDOM_SEED = 42

# These are placeholder variable names for cellphone usage and study
# habits. Rename/add/remove to match your final survey instrument.
FEATURE_COLUMNS = [
    "daily_screen_time_hrs",     # total phone screen time per day
    "academic_app_usage_hrs",    # screen time used for academic/school purposes
    "social_media_hrs",          # time on social media / entertainment apps
    "study_hours_per_day",       # average hours spent studying per day
    "study_frequency_per_week",  # number of days per week the student studies
]

TARGET_SCORE = "academic_performance_gwa"     # 1.00-5.00 GWA (lower = better), used for the regression model
TARGET_CLASS = "performance_category"         # derived from the GWA, used for classification

CATEGORY_ORDER = ["Failing", "Satisfactory", "Good", "Excellent"]


def gwa_to_category(gwa):
    """Convert a 1.00-5.00 GWA (lower = better) into a category label.
    Thresholds follow a typical PLM-style passing scheme: 3.00 is the
    passing cutoff, anything above is failing. Adjust to match your
    college's actual grading policy once real data is available."""
    if gwa <= 1.75:
        return "Excellent"
    elif gwa <= 2.50:
        return "Good"
    elif gwa <= 3.00:
        return "Satisfactory"
    else:
        return "Failing"


def generate_synthetic_data(n=300, seed=RANDOM_SEED):
    rng = np.random.default_rng(seed)

    daily_screen_time_hrs = np.clip(rng.normal(6, 2, n), 1, 14)
    academic_app_usage_hrs = np.clip(rng.normal(1.2, 0.6, n), 0, 4)
    social_media_hrs = np.clip(daily_screen_time_hrs * rng.uniform(0.3, 0.7, n), 0, 10)

    study_hours_per_day = np.clip(rng.normal(2.2, 1.0, n), 0, 8)
    study_frequency_per_week = np.clip(rng.normal(4.5, 1.5, n), 1, 7).round()

    noise = rng.normal(0, 0.3, n)

    gwa = (
        3.0
        - study_hours_per_day * 0.25
        - study_frequency_per_week * 0.07
        - academic_app_usage_hrs * 0.05
        + social_media_hrs * 0.10
        + noise
    )
    gwa = np.clip(gwa, 1.00, 5.00)

    df = pd.DataFrame({
        "daily_screen_time_hrs": daily_screen_time_hrs.round(2),
        "academic_app_usage_hrs": academic_app_usage_hrs.round(2),
        "social_media_hrs": social_media_hrs.round(2),
        "study_hours_per_day": study_hours_per_day.round(2),
        "study_frequency_per_week": study_frequency_per_week.round(0),
        TARGET_SCORE: gwa.round(2),
    })
    df[TARGET_CLASS] = df[TARGET_SCORE].apply(gwa_to_category)
    return df


def train_regression_model(df):
    X = df[FEATURE_COLUMNS]
    y = df[TARGET_SCORE]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED
    )
    model = LinearRegression()
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    rmse = mean_squared_error(y_test, preds) ** 0.5
    print("\n--- Regression Model: Academic Performance GWA (1.00-5.00, lower = better) ---")
    print(f"R^2 score : {r2_score(y_test, preds):.3f}")
    print(f"MAE       : {mean_absolute_error(y_test, preds):.2f}")
    print(f"RMSE      : {rmse:.2f}")

    coeffs = pd.Series(model.coef_, index=FEATURE_COLUMNS).sort_values()
    print("\nFeature influence (regression coefficients):")
    print(coeffs.to_string())

    return model, (X_test, y_test, preds)


def train_classification_model(df):
    X = df[FEATURE_COLUMNS]
    y = df[TARGET_CLASS]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )
    model = RandomForestClassifier(n_estimators=200, random_state=RANDOM_SEED)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    print("\n--- Classification Model: Performance Category ---")
    print(f"Accuracy: {accuracy_score(y_test, preds):.3f}\n")
    print(classification_report(y_test, preds, zero_division=0))

    importances = pd.Series(model.feature_importances_, index=FEATURE_COLUMNS)
    importances = importances.sort_values(ascending=False)
    print("Feature importance:")
    print(importances.to_string())

    return model, (X_test, y_test, preds)


def plot_results(reg_results, clf_results, out_dir="/mnt/user-data/outputs"):
    X_test_r, y_test_r, preds_r = reg_results
    X_test_c, y_test_c, preds_c = clf_results

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    axes[0].scatter(y_test_r, preds_r, alpha=0.6, color="#4C72B0")
    lims = [1.00, 5.00]
    axes[0].plot(lims, lims, "--", color="gray")
    axes[0].invert_xaxis()  # lower GWA = better, so flip so "better" reads left-to-right
    axes[0].invert_yaxis()
    axes[0].set_xlabel("Actual GWA (synthetic)")
    axes[0].set_ylabel("Predicted GWA")
    axes[0].set_title("Regression: Actual vs Predicted")

    labels = [c for c in CATEGORY_ORDER if c in set(y_test_c)]
    cm = confusion_matrix(y_test_c, preds_c, labels=labels)
    axes[1].imshow(cm, cmap="Blues")
    axes[1].set_xticks(range(len(labels)))
    axes[1].set_yticks(range(len(labels)))
    axes[1].set_xticklabels(labels, rotation=45, ha="right")
    axes[1].set_yticklabels(labels)
    axes[1].set_xlabel("Predicted")
    axes[1].set_ylabel("Actual")
    axes[1].set_title("Classification: Confusion Matrix")
    for i in range(len(labels)):
        for j in range(len(labels)):
            axes[1].text(j, i, cm[i, j], ha="center", va="center",
                         color="white" if cm[i, j] > cm.max() / 2 else "black")

    plt.tight_layout()
    path = f"{out_dir}/pseudo_model_results.png"
    plt.savefig(path, dpi=150)
    print(f"\nSaved chart: {path}")


def predict_new_student(reg_model, clf_model, student):
    """Given a dict of feature values for one hypothetical student,
    return a pseudo-predicted score and category. Labeled PSEUDO because
    the models are trained on synthetic, not real, data."""
    X_new = pd.DataFrame([student])[FEATURE_COLUMNS]
    gwa = float(np.clip(reg_model.predict(X_new)[0], 1.00, 5.00))
    category = clf_model.predict(X_new)[0]
    return round(gwa, 2), category


def main():
    print("Generating synthetic (pseudo) dataset...")
    df = generate_synthetic_data(n=400)
    print(df.head())
    print(f"\nDataset shape: {df.shape}")
    print("\nCategory distribution:")
    print(df[TARGET_CLASS].value_counts())

    reg_model, reg_results = train_regression_model(df)
    clf_model, clf_results = train_classification_model(df)
    plot_results(reg_results, clf_results)

    print("\n" + "=" * 60)
    print("PSEUDO-PREDICTIONS FOR SAMPLE HYPOTHETICAL STUDENTS")
    print("(Demo only - models trained on synthetic data)")
    print("=" * 60)

    sample_students = {
        "Heavy phone use, low study habits": {
            "daily_screen_time_hrs": 10, "academic_app_usage_hrs": 0.5,
            "social_media_hrs": 6,
            "study_hours_per_day": 0.5, "study_frequency_per_week": 2,
        },
        "Balanced phone use and study habits": {
            "daily_screen_time_hrs": 5, "academic_app_usage_hrs": 1.5,
            "social_media_hrs": 2.5,
            "study_hours_per_day": 2, "study_frequency_per_week": 5,
        },
        "Low phone use, high study habits": {
            "daily_screen_time_hrs": 3, "academic_app_usage_hrs": 1.8,
            "social_media_hrs": 1,
            "study_hours_per_day": 4, "study_frequency_per_week": 7,
        },
    }

    for label, features in sample_students.items():
        gwa, category = predict_new_student(reg_model, clf_model, features)
        print(f"\n{label}")
        print(f"  -> Predicted GWA     : {gwa:.2f}  (1.00-5.00, lower = better)  (PSEUDO)")
        print(f"  -> Predicted category: {category}  (PSEUDO)")


if __name__ == "__main__":
    main()
