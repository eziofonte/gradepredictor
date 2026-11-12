"""Verify relocated frontend files through Flask without requiring MySQL."""
from html.parser import HTMLParser
import re
from urllib.parse import urljoin, urlsplit

import pytest

from acad_perf import web


@pytest.fixture(scope='module')
def client(tmp_path_factory):
    # Account integration has its own database-backed suite. These checks exercise
    # real file serving and model initialization from a different working directory.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(web, 'setup_accounts', lambda app, overrides: None)
        patch.chdir(tmp_path_factory.mktemp('outside-project'))
        application = web.create_app({'TESTING': True})
        application.config['TESTING'] = True
        yield application.test_client()


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if value and key in ('href', 'src'):
                self.urls.append(value)


@pytest.mark.parametrize('page', ['index', 'assessment', 'history', 'hiw', 'privacy', 'terms'])
@pytest.mark.parametrize('prefix', ['/', '/html/'])
def test_pages_and_local_references(client, page, prefix):
    address = prefix + page + '.html'
    response = client.get(address)
    assert response.status_code == 200
    assert response.mimetype == 'text/html'
    parser = References()
    parser.feed(response.get_data(as_text=True))
    for reference in parser.urls:
        resolved = urlsplit(urljoin('http://localhost' + address, reference))
        if resolved.netloc == 'localhost' and resolved.scheme == 'http':
            assert client.get(resolved.path).status_code == 200, reference


def test_homepage_and_stylesheet_compatibility(client):
    assert client.get('/').data == client.get('/index.html').data
    stylesheet = client.get('/css/style.css')
    assert stylesheet.status_code == 200
    assert stylesheet.mimetype == 'text/css'
    assert stylesheet.data == client.get('/style.css').data
    assert client.get('/assets/PLM2.jpg').status_code == 200


@pytest.mark.parametrize('stylesheet_url', ['/css/style.css', '/style.css'])
def test_stylesheet_images_resolve_from_both_routes(client, stylesheet_url):
    stylesheet = client.get(stylesheet_url).get_data(as_text=True)
    images = re.findall(r'url\([\'"]?([^\'"\)]+)[\'"]?\)', stylesheet)
    assert images
    for image in images:
        resolved = urlsplit(urljoin('http://localhost' + stylesheet_url, image))
        if resolved.netloc == 'localhost':
            response = client.get(resolved.path)
            assert response.status_code == 200, image
            assert response.mimetype.startswith('image/'), image


@pytest.mark.parametrize('address', [
    '/config.py', '/acad_perf/web.py', '/frontend/html/index.html',
    '/js/../../config.py', '/assets/../../config.py', '/css/missing.css',
])
def test_source_and_unapproved_files_are_not_served(client, address):
    assert client.get(address).status_code == 404
