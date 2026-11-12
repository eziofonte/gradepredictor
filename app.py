"""Local entry point; application code lives in acad_perf.web."""
import os

from acad_perf.web import create_app


if __name__ == '__main__':
    application = create_app()
    application.run(host=os.environ.get('APP_HOST', '127.0.0.1'),
                    port=int(os.environ.get('APP_PORT', '5000')), debug=False)
