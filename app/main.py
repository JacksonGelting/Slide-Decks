"""Slide Decks entry point.

    python app/main.py                         open the first deck in decks/
    python app/main.py --deck reynolds-equation-intro
    python app/main.py --deck path/to/deck-folder --dev
    python app/main.py --validate              check every deck, no window
    python app/main.py --validate --deck <id>  check one deck, no window
    python app/main.py --browser               open in your web browser (debugging)

Keys in the viewer: arrows / PageUp / PageDown / Space to move, Home / End,
R to reload the deck from disk (handy while editing deck.json).
"""

from __future__ import annotations

import argparse
import sys
import threading
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import library  # noqa: E402
from bridge import Bridge  # noqa: E402
from loader import load_deck, resolve_deck_path  # noqa: E402
from server import start_server  # noqa: E402

APP_TITLE = "Slide Decks"
RENDERER_PATH = "/renderer/index.html"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="main.py", description="View Slide Decks.")
    parser.add_argument("--deck", help="deck id (folder in decks/), deck folder, or deck.json path")
    parser.add_argument("--dev", action="store_true",
                        help="authoring mode: warn about overflowing slots and math errors")
    parser.add_argument("--validate", action="store_true",
                        help="validate deck(s) and print problems instead of opening a window")
    parser.add_argument("--browser", action="store_true",
                        help="serve the viewer and open it in the default web browser")
    parser.add_argument("--port", type=int, default=0, help="local server port (default: any free port)")
    return parser.parse_args(argv)


def validate(deck: str | None) -> int:
    results = [load_deck(deck)] if deck else [
        {"deckPath": d["deckPath"], "ok": d["ok"], "errors": d["errors"]} for d in library.list_decks()
    ]
    if not results:
        print("No decks found in decks/.")
        return 1
    failures = 0
    for result in results:
        if result["ok"]:
            print(f"OK    {result['deckPath']}")
            continue
        failures += 1
        print(f"FAIL  {result['deckPath']}")
        for err in result["errors"]:
            where = f"{err['where']}: " if err["where"] else ""
            print(f"        - {where}{err['message']}")
    return 1 if failures else 0


def run_window(url: str, title: str, dev: bool, bridge: Bridge) -> int:
    try:
        import webview
    except ImportError:
        print("pywebview is not installed. Run:  pip install -r requirements.txt\n"
              "Or use --browser to view the deck in your web browser.", file=sys.stderr)
        return 1

    webview.create_window(title, f"{url}?host=pywebview", js_api=bridge,
                          width=1440, height=860, min_size=(800, 480),
                          background_color="#1d2026", text_select=True)
    # Insist on Edge WebView2 on Windows; the legacy fallback can't run the renderer.
    gui = "edgechromium" if sys.platform == "win32" else None
    try:
        webview.start(gui=gui, debug=dev)
    except Exception as exc:  # pywebview raises several types for a missing backend
        print(f"Could not open the window: {exc}", file=sys.stderr)
        if sys.platform == "win32":
            print("Slide Decks needs the Microsoft Edge WebView2 Runtime. It ships with Windows 11 and "
                  "current Windows 10; otherwise install the Evergreen runtime from Microsoft.\n"
                  "Meanwhile you can use:  python app/main.py --browser", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.validate:
        return validate(args.deck)

    deck_path = resolve_deck_path(args.deck)
    bridge = Bridge(deck_path, dev=args.dev)
    deck = bridge.get_deck()
    title = f"{deck['deck']['title']} · {APP_TITLE}" if deck["ok"] else APP_TITLE

    httpd, base = start_server(bridge, args.port)
    url = base + RENDERER_PATH
    try:
        if args.browser:
            print(f"Serving {url}  (Ctrl+C to stop)")
            webbrowser.open(url)
            try:
                threading.Event().wait()
            except KeyboardInterrupt:
                return 0
        return run_window(url, title, args.dev, bridge)
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    sys.exit(main())
