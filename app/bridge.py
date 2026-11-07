"""Functions the renderer can call.

The same Bridge instance is exposed two ways, and both return identical data:
  * as pywebview's JS API, so the renderer calls window.pywebview.api.get_deck()
  * over the local HTTP server at /api/<method>, for --browser debugging

Every public method must return JSON-serialisable data and must not raise for
a bad deck; problems come back inside the result.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import library
from loader import load_deck


class Bridge:
    # Methods reachable from the renderer. Anything else is private to Python.
    PUBLIC = ("get_deck", "get_settings", "list_decks")

    def __init__(self, deck_target: str | Path | None, dev: bool = False) -> None:
        self._deck_target = deck_target
        self._dev = dev

    def get_deck(self) -> dict[str, Any]:
        """Load (or reload from disk) the current deck, validated."""
        result = load_deck(self._deck_target)
        # The renderer resolves asset paths against this URL prefix, which the
        # local server maps to decks/<folder>/.
        result["assetBase"] = f"/decks/{result['deckFolder']}/"
        return result

    def get_settings(self) -> dict[str, Any]:
        return {"dev": self._dev}

    def list_decks(self) -> list[dict[str, Any]]:
        return library.list_decks()
