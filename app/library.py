"""Scan decks/ and summarise every deck in it.

Phase 1 only uses this to validate decks from the command line. The library
screen (Phase 4) will build its card grid from list_decks().
"""

from __future__ import annotations

from typing import Any

from loader import DECK_FILE, DECKS_DIR, load_deck


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
