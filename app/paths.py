"""Where the app's folders are, in development and in the built package.

Development (python app/main.py): everything is relative to the repo root.

Built package (PyInstaller --onedir, Phase 5):
    SlideDecks/
        SlideDecks.exe
        decks/            <- next to the exe, so decks can be dropped in
        _internal/        <- bundled code and data (renderer/, schema/)

Paths never depend on the current working directory.
"""

from __future__ import annotations

import sys
from pathlib import Path

FROZEN = bool(getattr(sys, "frozen", False))

if FROZEN:
    # Folder holding SlideDecks.exe: user-facing content lives here.
    APP_ROOT = Path(sys.executable).resolve().parent
    # Folder PyInstaller unpacked bundled data into.
    BUNDLE_ROOT = Path(getattr(sys, "_MEIPASS", APP_ROOT)).resolve()
else:
    APP_ROOT = Path(__file__).resolve().parent.parent
    BUNDLE_ROOT = APP_ROOT

RENDERER_DIR = BUNDLE_ROOT / "renderer"
SCHEMA_PATH = BUNDLE_ROOT / "schema" / "deck.schema.json"
DECKS_DIR = APP_ROOT / "decks"
