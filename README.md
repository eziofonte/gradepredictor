# Academic Performance Estimator

Flask application that estimates GWA from study habits and phone usage, with
PLM Microsoft sign-in and private assessment history in MySQL.

## Find your way around

```text
acad-perf/
|-- acad_perf/              Python application
|   |-- web.py              Flask factory, frontend routes, prediction API
|   |-- predictor.py        Synthetic training data and GWA categories
|   |-- desktop.py          Optional Tkinter calculator
|   `-- history/            Accounts, database connection, migration
|-- frontend/               Browser-facing source files
|   |-- html/               Home, assessment, history, how-it-works, legal pages
|   |-- css/style.css       Shared stylesheet and themes
|   |-- js/                 Page behavior and shared UI utilities
|   `-- assets/             Images, logos, favicon, icons
|-- scripts/                Windows setup, launch, demo, and sign-in launchers
|-- tools/                  Python development and database maintenance commands
|-- tests/                  Python integration and route tests
|   `-- ui/                 JavaScript behavior and browser checks
|-- docs/                   Setup, deployment, design, QA, research references
|-- .vscode/settings.json   Hide generated dependencies/caches in VS Code
|-- app.py                  Local entry point; exports create_app
|-- wsgi.py                 Production entry point
|-- config.example.py       Database configuration template
`-- requirements.txt        Python runtime dependencies
```

Local `config.py`, `venv/`, caches, and `backups/` are ignored by Git. Keep
database backups private. VS Code hides generated dependencies and caches in
Explorer; their files remain on disk.

## Run locally

From the project root on Windows:

```powershell
.\scripts\setup.bat
```

Configure the generated root `config.py` with your MySQL settings, back up the
database, and apply the migration as described in
[deployment and setup](docs/DEPLOYMENT.md). For later starts:

```powershell
.\scripts\dev-server.bat
```

Open `http://localhost:5000`. The launcher displays the Microsoft secret as you enter it.
Use Flask to serve the application; the prediction and account APIs require it.
Launchers work when opened from Explorer or called from another working directory.

## Common tasks

Run Python module commands from the project root with your virtual environment:

| Task | Command or location |
| --- | --- |
| Edit a page | `frontend/html/` |
| Change styles or behavior | `frontend/css/style.css`, `frontend/js/` |
| Change prediction logic | `acad_perf/web.py`, `acad_perf/predictor.py` |
| Change accounts or history | `acad_perf/history/account_history.py` |
| Migrate the database | `venv\Scripts\python.exe -m acad_perf.history.migrate` |
| Back up assessments | `venv\Scripts\python.exe -m tools.backup_assessments` |
| Run the desktop calculator | `venv\Scripts\python.exe -m acad_perf.desktop` |
| Check Microsoft sign-in | `scripts\check-microsoft-signin.bat` |
| Run Python checks | `venv\Scripts\python.exe -m pytest -q` |
| Run JavaScript checks | `npm.cmd --prefix tests/ui test` |

Install UI test dependencies first with `npm.cmd ci --prefix tests/ui`. Python
checks need `pytest` in addition to the runtime dependencies. Database integration
tests use disposable databases and skip if MySQL is unavailable. See the
[UI test guide](tests/ui/README.md) for browser checks.

## More documentation

See the [documentation index](docs/README.md) for deployment, demo hosting,
Microsoft setup, design notes, and mobile QA.

Source folders do not determine public URLs: Flask still serves `/`,
`/<page>.html`, `/html/<page>.html`, `/js/`, and `/assets/`. The stylesheet is
served at `/css/style.css`; `/style.css` remains available for existing links.
