"""Developer preview: serve the renderer to an ordinary web browser.

    python app/main.py --browser [--deck <id>] [--dev]

Not part of the app the user runs (that is the PySide6 window). It exists so
decks can be previewed and the renderer debugged where Qt isn't installed.
It needs only the standard library, binds to 127.0.0.1, serves GET only, and
exposes nothing but renderer/, the open deck's folder (at /deck/) and two
read-only API calls that mirror the Qt bridge.
"""

from __future__ import annotations

import json
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from library import ASSET_BASE, deck_payload
from paths import RENDERER_DIR

# Set explicitly: on Windows, mimetypes reads the registry, which sometimes
# maps .js to text/plain and breaks module scripts.
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".csv": "text/csv; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
}


def content_type(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")


def resolve_request(path: str, deck_dir: Path) -> Path | None:
    """Map a URL path to a file under renderer/ or the deck folder, or None.

    Shared with the Qt scheme handler so both apply the same rules.
    """
    roots = {"/renderer/": RENDERER_DIR.resolve(), ASSET_BASE: deck_dir.resolve()}
    for prefix, root in roots.items():
        if path.startswith(prefix):
            target = (root / path[len(prefix):]).resolve()
            if target.is_relative_to(root) and target.is_file():
                return target
    return None


def make_handler(deck_path: Path, dev: bool):
    class Handler(BaseHTTPRequestHandler):
        server_version = "SlideDecksPreview"

        def log_message(self, format: str, *args) -> None:  # noqa: A002 - quiet
            pass

        def do_GET(self) -> None:  # noqa: N802
            path = unquote(urlsplit(self.path).path)
            if path == "/api/getDeck":
                self._send(HTTPStatus.OK, json.dumps(deck_payload(deck_path)).encode(), CONTENT_TYPES[".json"])
            elif path == "/api/getSettings":
                self._send(HTTPStatus.OK, json.dumps({"dev": dev}).encode(), CONTENT_TYPES[".json"])
            else:
                target = resolve_request(path, deck_path.parent)
                if target is None:
                    self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain")
                else:
                    self._send(HTTPStatus.OK, target.read_bytes(), content_type(target))

        def _send(self, status: HTTPStatus, body: bytes, ctype: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    return Handler


def start_server(deck_path: Path, dev: bool = False, port: int = 0) -> tuple[ThreadingHTTPServer, str]:
    """Start serving on 127.0.0.1 in a daemon thread. Returns (server, base_url)."""
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(deck_path, dev))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, name="slide-decks-preview", daemon=True).start()
    host, real_port = httpd.server_address[:2]
    return httpd, f"http://{host}:{real_port}"
