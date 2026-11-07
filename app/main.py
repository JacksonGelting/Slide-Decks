"""Slide Decks entry point.

    python app/main.py                          open the first deck in decks/
    python app/main.py --deck reynolds-equation-intro
    python app/main.py --deck path/to/deck-folder --dev
    python app/main.py --validate [--deck <id>] same as python app/validate.py (no Qt needed)
    python app/main.py --browser [--deck <id>]  developer preview in a web browser (no Qt needed)

Keys on the slides: arrows / PageUp / PageDown / Space to move, Home / End,
R to reload the deck from disk (handy while editing deck.json).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from validate import resolve_deck_path  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="main.py", description="View Slide Decks.")
    parser.add_argument("--deck", help="deck id (folder in decks/), deck folder, or deck.json path")
    parser.add_argument("--dev", action="store_true",
                        help="authoring mode: list math errors and overflowing slots")
    parser.add_argument("--validate", action="store_true",
                        help="validate deck(s) and print problems instead of opening a window")
    parser.add_argument("--browser", action="store_true",
                        help="developer preview: serve the renderer and open it in the default web browser")
    parser.add_argument("--port", type=int, default=0, help="port for --browser (default: any free port)")
    return parser.parse_args(argv)


def run_browser_preview(deck_path: Path, dev: bool, port: int) -> int:
    import threading
    import webbrowser

    from server import start_server

    httpd, base = start_server(deck_path, dev=dev, port=port)
    url = f"{base}/renderer/index.html"
    print(f"Previewing {deck_path} at {url}  (Ctrl+C to stop)")
    webbrowser.open(url)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.shutdown()
    return 0


def run_app(deck_path: Path, dev: bool) -> int:
    try:
        from PySide6.QtCore import QCoreApplication, Qt
        from PySide6.QtWidgets import QApplication
    except ImportError:
        print("PySide6 is not installed. Run:  pip install -r requirements.txt", file=sys.stderr)
        return 1

    from window import APP_NAME, MainWindow, register_scheme

    register_scheme()  # must happen before QApplication exists
    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QApplication(sys.argv[:1])
    app.setApplicationName(APP_NAME)
    window = MainWindow(deck_path, dev=dev)
    window.show()
    return app.exec()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.validate:
        import validate

        return validate.main([args.deck] if args.deck else [])

    deck_path = resolve_deck_path(args.deck)
    if args.browser:
        return run_browser_preview(deck_path, args.dev, args.port)
    return run_app(deck_path, args.dev)


if __name__ == "__main__":
    sys.exit(main())
