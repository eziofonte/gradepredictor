"Apply repeatable MySQL migrations. Back up the database before running."

from acad_history.database import connect


def migrate():
    conn = connect()
    cur = conn.cursor()
    try:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS users (\n            id INT AUTO_INCREMENT PRIMARY KEY, tenant_id CHAR(36) NOT NULL,\n            object_id CHAR(36) NOT NULL, display_name VARCHAR(200) NOT NULL,\n            email VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n            last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n            UNIQUE KEY users_identity (tenant_id, object_id)\n        ) ENGINE=InnoDB"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS assessments (\n            id INT AUTO_INCREMENT PRIMARY KEY, daily_screen_time_hrs FLOAT,\n            academic_app_usage_hrs FLOAT, social_media_hrs FLOAT,\n            study_hours_per_day FLOAT, study_frequency_per_week FLOAT,\n            predicted_gwa FLOAT, performance_category VARCHAR(20),\n            year_level VARCHAR(20), program VARCHAR(255), academic_term VARCHAR(20),\n            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n        ) ENGINE=InnoDB"
        )
        cur.execute("SHOW COLUMNS FROM assessments")
        columns = {row[0] for row in cur.fetchall()}
        for name, definition in (
            ("year_level", "VARCHAR(20)"),
            ("program", "VARCHAR(255)"),
            ("academic_term", "VARCHAR(20)"),
            ("user_id", "INT NULL"),
            ("submission_id", "CHAR(36) NULL"),
            ("request_hash", "CHAR(64) NULL"),
        ):
            if name not in columns:
                cur.execute(f"ALTER TABLE assessments ADD COLUMN {name} {definition}")
        cur.execute("SHOW INDEX FROM assessments")
        indexes = {row[2] for row in cur.fetchall()}
        if "assessment_owner_date" not in indexes:
            cur.execute(
                "CREATE INDEX assessment_owner_date ON assessments (user_id, created_at, id)"
            )
        if "assessment_owner_submission" not in indexes:
            cur.execute(
                "CREATE UNIQUE INDEX assessment_owner_submission ON assessments (user_id, submission_id)"
            )
        cur.execute(
            "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE\n            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'\n            AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users'"
        )
        if not cur.fetchone():
            cur.execute(
                "ALTER TABLE assessments ADD CONSTRAINT assessments_user_fk FOREIGN KEY (user_id) REFERENCES users(id)"
            )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS sessions (\n            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n            session_id VARCHAR(255) UNIQUE, data BLOB, expiry DATETIME\n        ) ENGINE=InnoDB"
        )
        cur.execute("INSERT IGNORE INTO schema_migrations (version) VALUES (1)")
        conn.commit()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    migrate()
    print("Database migration complete; ownerless assessments remain private.")
