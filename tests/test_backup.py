import os
import uuid

import mysql.connector
import pytest

from acad_history.database import mysql_settings
from tools.backup_assessments import backup_assessments


def test_assessments_backup_restores_without_overwriting_existing_file(tmp_path, monkeypatch):
    settings = mysql_settings()
    settings.pop('database')
    try:
        admin = mysql.connector.connect(**settings)
    except mysql.connector.Error as error:
        pytest.skip(f'MySQL unavailable (error {error.errno})')
    source = 'acad_backup_test_' + uuid.uuid4().hex[:10]
    target = 'acad_restore_test_' + uuid.uuid4().hex[:10]
    cur = admin.cursor()
    try:
        cur.execute(f'CREATE DATABASE `{source}`')
        cur.execute(f'CREATE DATABASE `{target}`')
        cur.execute(f'CREATE TABLE `{source}`.assessments (id INT PRIMARY KEY, program VARCHAR(255), predicted_gwa FLOAT)')
        cur.execute(f'INSERT INTO `{source}`.assessments VALUES (%s,%s,%s)', (1, "Student's; test", 1.75))
        admin.commit()
        monkeypatch.setenv('MYSQL_DATABASE', source)
        path = tmp_path / 'backup.sql'
        assert backup_assessments(path) == 1
        contents = path.read_text(encoding='utf-8')
        with pytest.raises(FileExistsError):
            backup_assessments(path)
        assert path.read_text(encoding='utf-8') == contents
        settings['database'] = target
        restored = mysql.connector.connect(**settings)
        restore_cursor = restored.cursor()
        restore_cursor.execute(contents)
        for _ in restore_cursor.fetchsets():
            pass
        restored.commit()
        restore_cursor.execute('SELECT id, program, predicted_gwa FROM assessments')
        assert restore_cursor.fetchone() == (1, "Student's; test", 1.75)
        restore_cursor.close(); restored.close()
    finally:
        cur.execute(f'DROP DATABASE IF EXISTS `{source}`')
        cur.execute(f'DROP DATABASE IF EXISTS `{target}`')
        cur.close(); admin.close()
