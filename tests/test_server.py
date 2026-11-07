import json
import urllib.error
import urllib.request

import pytest

from bridge import Bridge
from server import start_server


@pytest.fixture(scope="module")
def base():
    httpd, url = start_server(Bridge("reynolds-equation-intro", dev=True))
    yield url
    httpd.shutdown()


def get(url):
    with urllib.request.urlopen(url) as r:
        return r.status, r.headers.get("Content-Type"), r.read()


def test_api_get_deck(base):
    status, ctype, body = get(base + "/api/get_deck")
    data = json.loads(body)
    assert status == 200 and data["ok"]
    assert data["deck"]["id"] == "reynolds-equation-intro"
    assert data["assetBase"] == "/decks/reynolds-equation-intro/"


def test_serves_renderer_with_js_type(base):
    status, ctype, _ = get(base + "/renderer/js/app.js")
    assert status == 200 and ctype.startswith("text/javascript")


@pytest.mark.parametrize("path", ["/app/main.py", "/renderer/../app/main.py",
                                  "/renderer/%2e%2e/app/main.py", "/api/_deck_target", "/README.md"])
def test_refuses_everything_else(base, path):
    with pytest.raises(urllib.error.HTTPError) as exc:
        get(base + path)
    assert exc.value.code == 404
