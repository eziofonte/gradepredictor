"""Make a private SQL backup of the existing assessments before migration."""
from datetime import datetime, timezone
from pathlib import Path
import secrets

from mysql.connector.conversion import MySQLConverter
from acad_perf.history.database import connect


def backup_assessments(destination):
    destination = Path(destination)
    conn = connect()
    created = False
    try:
        cur = conn.cursor()
        cur.execute('SHOW CREATE TABLE assessments')
        table = cur.fetchone()
        if not table:
            raise RuntimeError('The assessments table was not found.')
        ddl = table[1]
        cur.execute('SELECT * FROM assessments')
        names = [column[0] for column in cur.description]
        converter = MySQLConverter(charset='utf8mb4')
        quoted_names = ', '.join('`' + name.replace('`', '``') + '`' for name in names)
        count = 0
        with destination.open('x', encoding='utf-8', newline='\n') as out:
            created = True
            out.write('SET NAMES utf8mb4;\nSET time_zone = "+00:00";\n')
            out.write(ddl + ';\n')
            for row in cur:
                values = []
                for value in row:
                    literal = converter.quote(converter.escape(converter.to_mysql(value)))
                    values.append(bytes(literal).decode('utf-8'))
                out.write('INSERT INTO `assessments` (' + quoted_names + ') VALUES (' + ', '.join(values) + ');\n')
                count += 1
        cur.close()
        return count
    except Exception:
        # A partial file is never presented as a valid backup.
        if created:
            destination.unlink(missing_ok=True)
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    folder = Path('backups')
    folder.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    path = folder / f'assessments-before-history-{stamp}-{secrets.token_hex(3)}.sql'
    count = backup_assessments(path)
    print(f'Backed up {count} assessment(s) to {path}. Keep this file private.')
