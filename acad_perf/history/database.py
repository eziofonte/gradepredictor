"""Database configuration shared by the application and migrations."""
import os
import mysql.connector

try:
    import config
    _legacy = config.MYSQL_CONFIG
except ImportError:
    _legacy = {}


def mysql_settings():
    return {
        'host': os.environ.get('MYSQL_HOST', _legacy.get('host', 'localhost')),
        'port': int(os.environ.get('MYSQL_PORT', _legacy.get('port', 3306))),
        'database': os.environ.get('MYSQL_DATABASE', _legacy.get('database', 'acad_perf')),
        'user': os.environ.get('MYSQL_USER', _legacy.get('user', 'root')),
        'password': os.environ.get('MYSQL_PASSWORD', _legacy.get('password', '')),
    }


def connect():
    connection = mysql.connector.connect(**mysql_settings())
    cursor = connection.cursor()
    cursor.execute("SET time_zone = '+00:00'")
    cursor.close()
    return connection
