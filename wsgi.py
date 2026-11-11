"""Production WSGI entry point. Configure environment variables first."""
from app import create_app

app = create_app()
