"""Train an exploratory model using the fields available in the shorter form."""
import argparse
import json
from pathlib import Path

import joblib
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
    parser.add_argument('data', type=Path, help='clean model_data.csv produced by survey_training.py')
    parser.add_argument('--output', type=Path, default=Path('models/short_form_gwa_model.joblib'))
    args = parser.parse_args()
    df = pd.read_csv(args.data, dtype={'year_level': str})
    columns = ['screen_hours', 'program', 'year_level']
    train, test = train_test_split(df, test_size=0.2, random_state=42, stratify=df.program + df.year_level)
    preprocessor = ColumnTransformer([
        ('numeric', make_pipeline(SimpleImputer(strategy='median', add_indicator=True), StandardScaler()), ['screen_hours']),
        ('categorical', OneHotEncoder(handle_unknown='ignore'), ['program', 'year_level']),
    ])
    model = make_pipeline(preprocessor, Ridge(alpha=10))
    model.fit(train[columns], train.target_gwa)
    baseline = DummyRegressor(strategy='mean').fit(train[columns], train.target_gwa)
    report = {'train_rows': len(train), 'test_rows': len(test),
              'model': metrics(test.target_gwa, model.predict(test[columns])),
              'baseline': metrics(test.target_gwa, baseline.predict(test[columns]))}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output)
    args.output.with_suffix('.metrics.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
