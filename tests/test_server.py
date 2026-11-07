import json
import urllib.error
import urllib.request

import pytest

from server import start_server
from validate import resolve_deck_path


@pytest.fixture(scope="module")
def base():
    httpd, url = start_server(resolve_deck_path("reynolds-equation-intro"), dev=True)
    yield url
    httpd.shutdown()


def get(url):
    with urllib.request.urlopen(url) as r:
        return r.status, r.headers.get("Content-Type"), r.read()


def test_api_get_deck(base):
    status, _, body = get(base + "/api/getDeck")
    data = json.loads(body)
    assert status == 200 and data["ok"]
    assert data["deck"]["id"] == "reynolds-equation-intro"
    assert data["assetBase"] == "/deck/"


def test_api_get_settings(base):
    assert json.loads(get(base + "/api/getSettings")[2]) == {"dev": True}


def test_serves_renderer_and_deck_folder(base):
    status, ctype, _ = get(base + "/renderer/js/app.js")
    assert status == 200 and ctype.startswith("text/javascript")
    status, ctype, _ = get(base + "/deck/deck.json")
    assert status == 200 and ctype.startswith("application/json")


@pytest.mark.parametrize("path", ["/app/main.py", "/renderer/../app/main.py", "/renderer/%2e%2e/app/main.py",
                                  "/deck/../../app/main.py", "/api/nope", "/README.md"])
def test_refuses_everything_else(base, path):
    with pytest.raises(urllib.error.HTTPError) as exc:
        get(base + path)
    assert exc.value.code == 404
