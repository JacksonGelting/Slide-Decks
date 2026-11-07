"""A tiny localhost-only file server for the renderer and deck assets.

The window loads http://127.0.0.1:<port>/renderer/index.html from here, so the
renderer, its bundled vendor libraries and decks/<id>/assets/ share one
origin. Only GET is supported, and only files under renderer/ and decks/ are
served. /api/<method> calls the Bridge, which lets the renderer run in an
ordinary browser with --browser.
"""

from __future__ import annotations

import json
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from bridge import Bridge
from loader import REPO_ROOT

SERVED_DIRS = ("renderer", "decks")

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


def make_handler(bridge: Bridge, root: Path = REPO_ROOT):
    root = root.resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version = "SlideDecks"

        def log_message(self, format: str, *args) -> None:  # noqa: A002 - quiet by default
            pass

        def do_GET(self) -> None:  # noqa: N802 - http.server naming
            path = unquote(urlsplit(self.path).path)
            if path.startswith("/api/"):
                self._api(path[len("/api/"):])
            else:
                self._file(path)

        def _api(self, name: str) -> None:
            if name not in Bridge.PUBLIC:
                self._send(HTTPStatus.NOT_FOUND, b"unknown api method", "text/plain")
                return
            payload = json.dumps(getattr(bridge, name)()).encode("utf-8")
            self._send(HTTPStatus.OK, payload, CONTENT_TYPES[".json"])

        def _file(self, path: str) -> None:
            target = (root / path.lstrip("/")).resolve()
            allowed = any(target.is_relative_to(root / d) for d in SERVED_DIRS)
            if not allowed or not target.is_file():
                self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain")
                return
            ctype = CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
            self._send(HTTPStatus.OK, target.read_bytes(), ctype)

        def _send(self, status: HTTPStatus, body: bytes, ctype: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    return Handler


def start_server(bridge: Bridge, port: int = 0) -> tuple[ThreadingHTTPServer, str]:
    """Start serving on 127.0.0.1 in a daemon thread. Returns (server, base_url)."""
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(bridge))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, name="slide-decks-http", daemon=True).start()
    host, real_port = httpd.server_address[:2]
    return httpd, f"http://{host}:{real_port}"
