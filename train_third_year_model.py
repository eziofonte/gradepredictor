"""Train a retrospective third-year model from fourth-year survey responses."""
import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from survey_training import metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, default=Path('models/third_year_difficulty_model.joblib'))
    args = parser.parse_args()
    rows, subjects = [], {}
    workbook = pd.ExcelFile(args.workbook)
    for sheet, program in [('4th CS', 'BSCS'), ('4TH IT', 'BSIT')]:
        df = pd.read_excel(workbook, sheet_name=sheet)
        screen_col = next(c for c in df if str(c).startswith('What is your average daily cellphone screen time over the most recent 7 days?'))
        consent_col = next(c for c in df if str(c).startswith('Do you voluntarily agree'))
        subjects[program] = {}
        for term, prefix in [('1st Sem', 'Q55 '), ('2nd Sem', 'Q56 ')]:
            columns = [c for c in df if str(c).startswith(prefix)]
            if not columns or any(' | ' not in c for c in columns):
                raise ValueError(f'Missing subject questions for {sheet}, {term}')
            subjects[program][term] = [c.split(' | ', 1)[1].strip() for c in columns]
            for index, row in df.iterrows():
                consent = str(row[consent_col]).strip().lower().startswith('yes')
                enrolled = str(row['Are you currently enrolled in CISTM?']).strip().lower() == 'yes'
                completed = str(row.get(f'Third Year ({term})', '')).strip().lower() == 'completed: official gwa available'
                grade = pd.to_numeric(row.get(f'Third Year ({term}) Official GWA'), errors='coerce')
                ratings = pd.to_numeric(row[columns], errors='coerce')
                screen = pd.to_numeric(row[screen_col], errors='coerce')
                if not (consent and enrolled and completed and pd.notna(grade) and 1 <= grade <= 5 and ratings.between(1, 5).all()):
                    continue
                if pd.isna(screen) or not 0 <= screen <= 24:
                    screen = np.nan
                rows.append({'student': f'{sheet}:{index}', 'program': program, 'term': term,
                             'screen': screen, 'difficulty': float(ratings.mean()), 'gwa': float(grade)})
    data = pd.DataFrame(rows)
    people = data[['student', 'program']].drop_duplicates()
    train_people, test_people = train_test_split(people, test_size=.25, random_state=42, stratify=people.program)
    train = data[data.student.isin(train_people.student)].copy()
    test = data[data.student.isin(test_people.student)].copy()
    cohort_means = train.groupby(['program', 'term']).difficulty.mean()
    # At prediction time a student supplies no individual subject ratings.
    # Compute semester ratings from training respondents only for both splits.
    for split in [train, test]:
        split['difficulty'] = [cohort_means.loc[(program, term)] for program, term in zip(split.program, split.term)]
    # Difficulty already represents the semester-level difference; including
    # the semester label as a second feature lets Ridge split that signal.
    cat = ['program']
    def make_model(numeric):
        preprocessor = ColumnTransformer([('numeric', make_pipeline(SimpleImputer(strategy='median'), StandardScaler()), numeric),
                                          ('categorical', OneHotEncoder(handle_unknown='ignore'), cat)])
        return make_pipeline(preprocessor, Ridge(alpha=10))
    features = ['screen', 'difficulty'] + cat
    model = make_model(['screen', 'difficulty']).fit(train[features], train.gwa)
    reference_features = ['screen'] + cat
    reference = make_model(['screen']).fit(train[reference_features], train.gwa)
    baseline = DummyRegressor().fit(train[reference_features], train.gwa)
    report = {'respondents': len(people), 'training_respondents': len(train_people), 'test_respondents': len(test_people),
              'training_semesters': len(train), 'test_semesters': len(test),
              'model': metrics(test.gwa, model.predict(test[features])),
              'without_difficulty': metrics(test.gwa, reference.predict(test[reference_features])),
              'baseline': metrics(test.gwa, baseline.predict(test[reference_features]))}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output)
    args.output.with_suffix('.subjects.json').write_text(json.dumps(subjects, indent=2, ensure_ascii=False), encoding='utf-8')
    difficulty = {program: {term: float(value) for (p, term), value in cohort_means.items() if p == program}
                  for program in ['BSCS', 'BSIT']}
    args.output.with_suffix('.difficulty.json').write_text(json.dumps(difficulty, indent=2), encoding='utf-8')
    args.output.with_suffix('.metrics.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
