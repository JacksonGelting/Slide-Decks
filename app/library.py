"""Scan decks/ and summarise every deck in it; build the payload the renderer gets.

The library screen (Phase 4) will build its card grid from list_decks().
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from paths import DECKS_DIR
from validate import DECK_FILE, load_deck, resolve_deck_path

# The renderer resolves deck asset paths ("assets/fig.svg") against this URL
# prefix. Both the Qt scheme handler and the --browser server map it to the
# folder of the deck currently open.
ASSET_BASE = "/deck/"


def deck_payload(target: str | Path | None) -> dict[str, Any]:
    """Load (or reload from disk) a deck, validated, in the shape the renderer expects."""
    result = load_deck(target)
    result["assetBase"] = ASSET_BASE
    return result


def default_deck() -> Path:
    return resolve_deck_path(None)


def list_decks() -> list[dict[str, Any]]:
    """One summary per deck folder, valid or not, sorted by folder name."""
    summaries = []
    for deck_json in sorted(DECKS_DIR.glob(f"*/{DECK_FILE}")):
        result = load_deck(deck_json)
        deck = result["deck"] or {}
        summaries.append({
            "folder": deck_json.parent.name,
            "deckPath": result["deckPath"],
            "ok": result["ok"],
            "errors": result["errors"],
            "id": deck.get("id", deck_json.parent.name),
            "title": deck.get("title", deck_json.parent.name),
            "subject": deck.get("subject", ""),
            "tags": deck.get("tags", []),
            "slideCount": len(deck.get("slides", [])),
        })
    return summaries
