import tkinter as tk
from tkinter import ttk, messagebox

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeClassifier

from academic_performance_predictor import (
    generate_synthetic_data,
    FEATURE_COLUMNS,
    TARGET_SCORE,
    TARGET_CLASS,
    RANDOM_SEED,
    gwa_to_category,
)

FIELD_SPECS = [
    ("Daily screen time (hrs)",      "daily_screen_time_hrs",     "6",   "0-16 hrs/day",        (0, 16)),
    ("Academic app usage (hrs)",     "academic_app_usage_hrs",    "1.2", "0-6 hrs/day",         (0, 6)),
    ("Social media / entertainment (hrs)", "social_media_hrs",    "3",   "0-12 hrs/day",         (0, 12)),
    ("Study hours per day",          "study_hours_per_day",       "2",   "0-12 hrs/day",         (0, 12)),
    ("Study days per week",          "study_frequency_per_week",  "5",   "0-7 days",             (0, 7)),
]

CATEGORY_COLORS = {
    "Excellent": "#1a7f37",
    "Good": "#2f6feb",
    "Satisfactory": "#b08800",
    "Failing": "#cf222e",
}


def train_models():
    """Train the regression + decision tree models once on synthetic
    data when the app starts. Quiet (no console prints) by design."""
    df = generate_synthetic_data(n=400)

    X = df[FEATURE_COLUMNS]

    reg = LinearRegression()
    reg.fit(X, df[TARGET_SCORE])

    clf = DecisionTreeClassifier(max_depth=4, min_samples_leaf=8, random_state=RANDOM_SEED)
    clf.fit(X, df[TARGET_CLASS])

    return reg, clf


class PredictorApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Academic Performance Predictor (Draft - Pseudo Data)")
        self.resizable(False, False)
        self.configure(padx=16, pady=16)
        self.minsize(520, 0)

        self.reg_model, self.clf_model = train_models()
        self.entries = {}

        self._build_header()
        self._build_form()
        self._build_buttons()
        self._build_output()

    #UI sections

    def _build_header(self):
        title = ttk.Label(
            self, text="Impact of  Cellphone Usage and Study Habits in Academic Performance",
            font=("Segoe UI", 12, "bold"), wraplength=420, justify="left",
        )
        title.grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 2))

        subtitle = ttk.Label(
            self,
            text="DRAFT",
            font=("Segoe UI", 8, "italic"), foreground="#b08800",
            wraplength=420, justify="left",
        )
        subtitle.grid(row=1, column=0, columnspan=2, sticky="w", pady=(0, 12))

    def _build_form(self):
        form = ttk.Frame(self)
        form.grid(row=2, column=0, columnspan=2, sticky="ew")

        for i, (label, key, default, hint, _bounds) in enumerate(FIELD_SPECS):
            ttk.Label(form, text=label).grid(row=i, column=0, sticky="w", pady=3)

            var = tk.StringVar(value=default)
            entry = ttk.Entry(form, textvariable=var, width=10, justify="right")
            entry.grid(row=i, column=1, sticky="e", padx=(8, 6), pady=3)
            self.entries[key] = var

            ttk.Label(form, text=hint, foreground="#666666", font=("Segoe UI", 8)).grid(
                row=i, column=2, sticky="w", pady=3, padx=(0, 4)
            )

    def _build_buttons(self):
        btn_frame = ttk.Frame(self)
        btn_frame.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(12, 0))

        ttk.Button(btn_frame, text="Predict", command=self.on_predict).pack(
            side="left", padx=(0, 8)
        )
        ttk.Button(btn_frame, text="Reset", command=self.on_reset).pack(side="left")

        presets = ttk.Frame(self)
        presets.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        ttk.Label(presets, text="Quick sample profiles:", font=("Segoe UI", 8)).pack(
            anchor="w"
        )
        preset_row = ttk.Frame(presets)
        preset_row.pack(anchor="w", pady=(2, 0))
        ttk.Button(
            preset_row, text="Heavy phone use",
            command=lambda: self.load_preset("heavy_phone"),
        ).pack(side="left", padx=(0, 4))
        ttk.Button(
            preset_row, text="Balanced",
            command=lambda: self.load_preset("balanced"),
        ).pack(side="left", padx=(0, 4))
        ttk.Button(
            preset_row, text="Disciplined studier",
            command=lambda: self.load_preset("disciplined"),
        ).pack(side="left")

    def _build_output(self):
        sep = ttk.Separator(self, orient="horizontal")
        sep.grid(row=5, column=0, columnspan=2, sticky="ew", pady=12)

        self.result_frame = ttk.Frame(self)
        self.result_frame.grid(row=6, column=0, columnspan=2, sticky="ew")

        self.warning_label = ttk.Label(
            self.result_frame, text="", font=("Segoe UI", 8, "italic"),
            foreground="#cf222e", wraplength=460, justify="left",
        )
        self.warning_label.pack(anchor="w", pady=(0, 4))

        self.gwa_label = ttk.Label(
            self.result_frame, text="Predicted GWA: -", font=("Segoe UI", 13, "bold")
        )
        self.gwa_label.pack(anchor="w")

        self.category_label = ttk.Label(
            self.result_frame, text="Predicted category: -", font=("Segoe UI", 13, "bold")
        )
        self.category_label.pack(anchor="w", pady=(2, 0))

        self.tree_label = ttk.Label(
            self.result_frame, text="", font=("Segoe UI", 9), foreground="#444444",
        )
        self.tree_label.pack(anchor="w", pady=(4, 0))

        self.pseudo_note = ttk.Label(
            self.result_frame,
            text="(PSEUDO-OUTPUT - synthetic data, for demo only)",
            font=("Segoe UI", 8, "italic"), foreground="#666666",
        )
        self.pseudo_note.pack(anchor="w", pady=(6, 0))

    #Logic

    def on_predict(self):
        values = {}
        clamped_fields = []

        for label, key, _default, _hint, (lo, hi) in FIELD_SPECS:
            raw = self.entries[key].get().strip()
            try:
                val = float(raw)
            except ValueError:
                messagebox.showerror(
                    "Invalid input", f"'{label}' must be a number. Got: '{raw}'"
                )
                return

            clamped = min(max(val, lo), hi)
            if clamped != val:
                clamped_fields.append(f"{label} ({val:g} -> {clamped:g})")
            values[key] = clamped

        if clamped_fields:
            self.warning_label.config(
                text="Note: some values were outside the realistic range this "
                     "model was trained on and were capped:\n- " + "\n- ".join(clamped_fields)
            )
        else:
            self.warning_label.config(text="")

        X_new = pd.DataFrame([values])[FEATURE_COLUMNS]
        gwa = float(np.clip(self.reg_model.predict(X_new)[0], 1.00, 5.00))
        gwa = round(gwa, 2)

        category = gwa_to_category(gwa)

        tree_category = self.clf_model.predict(X_new)[0]

        self.gwa_label.config(text=f"Predicted GWA: {gwa:.2f}  (1.00-5.00, lower = better)")
        self.category_label.config(
            text=f"Predicted category: {category}",
            foreground=CATEGORY_COLORS.get(category, "black"),
        )
        agree = " (agrees)" if tree_category == category else " (disagrees - see note below)"
        self.tree_label.config(
            text=f"Decision tree model separately predicts: {tree_category}{agree}"
        )

    def on_reset(self):
        for label, key, default, _hint, _bounds in FIELD_SPECS:
            self.entries[key].set("")
        self.warning_label.config(text="")
        self.gwa_label.config(text="Predicted GWA: -")
        self.category_label.config(text="Predicted category: -", foreground="black")
        self.tree_label.config(text="")

    def load_preset(self, name):
        presets = {
            "heavy_phone": {
                "daily_screen_time_hrs": 10, "academic_app_usage_hrs": 0.5,
                "social_media_hrs": 6,
                "study_hours_per_day": 0.5, "study_frequency_per_week": 2,
            },
            "balanced": {
                "daily_screen_time_hrs": 5, "academic_app_usage_hrs": 1.5,
                "social_media_hrs": 2.5,
                "study_hours_per_day": 2, "study_frequency_per_week": 5,
            },
            "disciplined": {
                "daily_screen_time_hrs": 3, "academic_app_usage_hrs": 1.8,
                "social_media_hrs": 1,
                "study_hours_per_day": 4, "study_frequency_per_week": 7,
            },
        }
        for key, val in presets[name].items():
            self.entries[key].set(str(val))
        self.on_predict()


if __name__ == "__main__":
    app = PredictorApp()
    app.mainloop()
