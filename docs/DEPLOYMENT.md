# Personal history setup and deployment

The Microsoft registration has been verified with a real PLM account. The app
uses the configured PLM tenant, restricts sign-in to directory members, and
stores each assessment under the signed-in account. Guests receive estimates
without creating assessment records.

## Local setup

1. Install dependencies with `setup.bat`, or run `venv\Scripts\python.exe -m pip install -r requirements.txt`.
2. Configure the existing `config.py` MySQL connection, or use the `MYSQL_HOST`,
   `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` environment
   variables. Do not commit real credentials.
3. Back up the existing database before migration. For the existing project
   database, which originally has only an `assessments` table, run
   `venv\Scripts\python.exe -m tools.backup_assessments`. The ignored `backups/`
   directory contains private student data; secure it and verify restoration.
   For a database with additional tables, views, or triggers, take a complete
   database backup using your database provider's backup tool instead.
4. Run `venv\Scripts\python.exe -m acad_history.migrate`. The migration is
   repeatable. Existing records without an owner remain unassigned and hidden.
5. Stop the separate Microsoft sign-in check if it still occupies port 5000.
   Start `dev-server.bat`; enter the Microsoft client secret Value at the hidden
   prompt. Open `http://localhost:5000`. Restart the app when the secret changes.

The app requires the Flask server. Opening the HTML directly or using a static
file server does not provide prediction, sign-in, or history.

For a short panel presentation using your own PC and a temporary free HTTPS
link, see `DEMO_HOSTING.md`.

## Production configuration

Use a managed environment with persistent MySQL, HTTPS termination and a stable,
private environment configuration. Set:

| Variable | Purpose |
| --- | --- |
| `APP_SECRET_KEY` | Long random secret shared by all app workers; generate and store securely |
| `APP_BASE_URL` | Public HTTPS origin, without a trailing slash |
| `PLM_CLIENT_ID`, `PLM_TENANT_ID` | Microsoft app and PLM directory IDs; defaults match the current registration |
| `PLM_CLIENT_SECRET` | Microsoft client secret Value; inject through a secret manager |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | MySQL connection; use a restricted runtime account |

Register the exact production `APP_BASE_URL/auth/callback` as a Web redirect URI
in the same Microsoft application. Apply migrations with a separately privileged
deployment account; do not grant schema-changing privileges to the runtime user.
Run Waitress behind a correctly configured HTTPS reverse proxy, for example:

```text
waitress-serve --listen=127.0.0.1:8000 wsgi:app
```

Never expose the local-only Microsoft sign-in checker to the network. Set
`APP_BASE_URL` to HTTPS for secure session cookies, disable debug mode, restrict
database network access, and rotate credentials before they expire. The server
only serves the approved HTML, JavaScript, stylesheet, and assets routes.

Schedule daily database backups with a 30-day retention period and regularly
test restoration to a separate database. Deleted assessments may remain in
backups until that retention period expires. Run the Flask-Session cleanup job
daily with `flask --app wsgi:app purge-expired-sessions`; expired sessions are also
cleaned periodically during requests. Monitor failed sign-ins and database
errors without logging tokens, secrets, callback URLs, or assessment contents.

Before wider use, test two distinct PLM accounts on multiple devices, verify
that neither account can access or delete the other's history, and check save
failure and logout behavior. If an ownership test fails, disable history access
until corrected; do not restore the old unscoped results endpoint.
