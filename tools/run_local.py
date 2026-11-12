"""Start the local app with a visibly entered Microsoft secret."""
import os
import secrets
import sys

from waitress import serve


def main():
    if not os.environ.get('PLM_CLIENT_SECRET'):
        try:
            value = input('Microsoft client secret Value (visible): ').strip()
        except EOFError:
            sys.exit('A terminal is required to enter the client secret.')
        if not value:
            sys.exit('The client secret is required for sign-in.')
        os.environ['PLM_CLIENT_SECRET'] = value
    # A new local key invalidates stale CSRF tokens on restart; account sessions
    # remain in the database and get a fresh token when the page is reloaded.
    os.environ.setdefault('APP_SECRET_KEY', secrets.token_urlsafe(48))
    os.environ.setdefault('APP_BASE_URL', 'http://localhost:5000')
    from app import create_app
    application = create_app()
    print('Open ' + os.environ['APP_BASE_URL'] + '. Press Ctrl+C to stop.')
    serve(application, host='127.0.0.1', port=5000)


if __name__ == '__main__':
    main()
