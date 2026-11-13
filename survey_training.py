"""Prepare the survey and fit an exploratory retrospective GWA model."""
import argparse
import json
import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

TERMS = ["First year (1st Sem)", "First year (2nd Sem)", "Second Year (1st Sem)", "Second Year (2nd Sem)", "Third Year (1st Sem)", "Third Year (2nd Sem)", "Fourth Year (1st Sem)", "Fourth Year (2nd Sem)"]
SCALES = {"time_management": "Time Management and Study Scheduling.", "review_consistency": "Consistency and Regularity of Review.", "study_strategies": "Study Strategies and Techniques.", "focus": "Focus and Concentration During Study Sessions"}
NUMERIC = ["screen_hours", *SCALES]
CATEGORICAL = ["program", "year_level"]


def latest_gwa(row):
    for term in reversed(TERMS):
        if str(row.get(term, "")).strip().lower() != "completed: official gwa available":
            continue
        value = pd.to_numeric(row.get(term + " Official GWA"), errors="coerce")
        if pd.notna(value) and 1 <= value <= 5:
            return float(value), term
    return np.nan, None


def likert_mean(values):
    parsed = [int(m.group(1)) for value in values if (m := re.match(r"^\s*([1-5])\s*:", str(value)))]
    return float(np.mean(parsed)) if len(parsed) >= 4 else np.nan


def clean_sheet(df, sheet):
    rows = []
    screen_col = next(c for c in df if str(c).startswith("What is your average daily cellphone screen time over the most recent 7 days?"))
    consent_col = next(c for c in df if str(c).startswith("Do you voluntarily agree"))
    program_col = next(c for c in df if str(c).strip() == "Course/Program")
    scale_cols = {name: [c for c in df if str(c).startswith(prefix)] for name, prefix in SCALES.items()}
    if any(len(cols) != 5 for cols in scale_cols.values()):
        raise ValueError(f"Expected five items per study scale in {sheet}")
    for index, row in df.iterrows():
        consent = str(row[consent_col]).strip().lower().startswith("yes")
        enrolled = str(row.get("Are you currently enrolled in CISTM?", "")).strip().lower() == "yes"
        gwa, term = latest_gwa(row)
        screen = pd.to_numeric(row[screen_col], errors="coerce")
        if not (pd.notna(screen) and 0 <= screen <= 24):
            screen = np.nan
        year_match = re.search(r"[234]", str(row.get("Year Level", "")))
        record = {"source_sheet": sheet, "source_excel_row": int(index) + 2, "consent": consent, "enrolled": enrolled,
                  "program": str(row[program_col]).strip().upper(), "year_level": year_match.group() if year_match else None,
                  "screen_hours": screen, "target_gwa": gwa, "target_term": term}
        record.update({name: likert_mean(row[cols]) for name, cols in scale_cols.items()})
        rows.append(record)
    return pd.DataFrame(rows)


def metrics(y, pred):
    return {"mae": float(mean_absolute_error(y, pred)), "rmse": float(np.sqrt(mean_squared_error(y, pred))), "r2": float(r2_score(y, pred))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, default=Path("output/survey_model"))
    args = parser.parse_args()
    sheets = pd.read_excel(args.workbook, sheet_name=None)
    clean = pd.concat([clean_sheet(frame, name) for name, frame in sheets.items()], ignore_index=True)
    source_rows = len(clean)
    rows_by_sheet = clean.groupby("source_sheet").size().to_dict()
    clean = clean[clean.consent & clean.enrolled].copy()
    eligible = clean[clean.target_gwa.notna() & clean.program.isin(["BSIT", "BSCS"]) & clean.year_level.notna()].copy()
    if len(eligible) < 20:
        raise ValueError("Too few eligible survey responses to evaluate a model")
    train, test = train_test_split(eligible, test_size=0.2, random_state=42, stratify=eligible["program"] + eligible["year_level"])
    preprocessor = ColumnTransformer([("numeric", make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler()), NUMERIC),
                                      ("categorical", make_pipeline(SimpleImputer(strategy="most_frequent"), OneHotEncoder(handle_unknown="ignore")), CATEGORICAL)])
    model = make_pipeline(preprocessor, Ridge(alpha=10))
    model.fit(train[NUMERIC + CATEGORICAL], train.target_gwa)
    baseline = DummyRegressor(strategy="mean").fit(train[NUMERIC + CATEGORICAL], train.target_gwa)
    pred = model.predict(test[NUMERIC + CATEGORICAL])
    group_metrics = {}
    for key, group in test.assign(prediction=pred).groupby(["program", "year_level"]):
        group_metrics[" ".join(key)] = {"n": len(group), "mae": float(mean_absolute_error(group.target_gwa, group.prediction))}
    report = {"source_rows": source_rows, "rows_by_sheet": rows_by_sheet,
              "consented_and_enrolled": len(clean), "eligible_rows": len(eligible),
              "training_rows": len(train), "test_rows": len(test), "target_terms": eligible.target_term.value_counts().to_dict(),
              "missing_features": eligible[NUMERIC + CATEGORICAL].isna().sum().to_dict(),
              "test_model": metrics(test.target_gwa, pred), "test_baseline": metrics(test.target_gwa, baseline.predict(test[NUMERIC + CATEGORICAL])),
              "test_groups": group_metrics, "exact_duplicate_eligible_rows": int(eligible[NUMERIC + CATEGORICAL + ["target_gwa", "target_term"]].duplicated().sum())}
    args.output.mkdir(parents=True, exist_ok=True)
    clean.to_csv(args.output / "cleaned_survey.csv", index=False)
    eligible.to_csv(args.output / "model_data.csv", index=False)
    joblib.dump(model, args.output / "retrospective_gwa_model.joblib")
    (args.output / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
