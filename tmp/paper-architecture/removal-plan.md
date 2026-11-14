# Remove auxiliary classifiers

The user approved removing the Decision Tree and aligning the paper with a single Linear Regression model.

- Add regression checks for prediction output, GWA thresholds, health, storage, and history without a classifier.
- Remove classifier training, inference, output fields, and new-schema columns from Flask and the desktop/demo paths. Preserve existing database records and columns.
- Refresh the model configuration and related documentation; regenerate the architecture PDF, SVG, PNG, and description.
- Run the checks, inspect the diff, and visually verify both PDF pages.
