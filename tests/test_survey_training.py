import pandas as pd

from survey_training import latest_gwa, likert_mean


def test_latest_gwa_requires_completed_status_and_valid_grade():
    row = pd.Series({"First year (2nd Sem)": "Completed: Official GWA Available", "First year (2nd Sem) Official GWA": "1.75", "Second Year (1st Sem)": "Currently Taking", "Second Year (1st Sem) Official GWA": "1.20"})
    assert latest_gwa(row) == (1.75, "First year (2nd Sem)")


def test_likert_mean_requires_at_least_four_valid_answers():
    assert likert_mean(["1: Strongly Disagree", "2: Disagree", "3: Neutral", "4: Agree", None]) == 2.5
    assert pd.isna(likert_mean(["1: Strongly Disagree", "2: Disagree", "5: Strongly Agree", None, None]))
