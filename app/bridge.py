"""The QWebChannel object shared with the renderer.

The renderer reaches it as `bridge` (see renderer/js/api.js):

    JS -> Python   bridge.getDeck(cb)        deck payload as a JSON string
                   bridge.getSettings(cb)    {"dev": bool} as a JSON string
                   bridge.slideChanged(i)    renderer moved to slide i (0-based)
    Python -> JS   bridge.goToSlide(i)       signal: renderer should show slide i

Python-side listeners (the outline panel, the window title) use deckLoaded
and slideShown.

Data crosses as JSON strings rather than QVariant maps so numbers, nulls and
nesting survive exactly.
"""

from __future__ import annotations

import json
from pathlib import Path

from PySide6.QtCore import QObject, Signal, Slot

from library import deck_payload


class Bridge(QObject):
    goToSlide = Signal(int)          # Python -> renderer
    deckLoaded = Signal(dict)        # Python side: a deck payload was just served
    slideShown = Signal(int)         # Python side: the renderer is on slide i

    def __init__(self, deck_path: Path, dev: bool = False, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.deck_path = deck_path
        self.dev = dev

    @Slot(result=str)
    def getDeck(self) -> str:  # noqa: N802 - JS-facing name
        payload = deck_payload(self.deck_path)
        self.deckLoaded.emit(payload)
        return json.dumps(payload)

    @Slot(result=str)
    def getSettings(self) -> str:  # noqa: N802
        return json.dumps({"dev": self.dev})

    @Slot(int)
    def slideChanged(self, index: int) -> None:  # noqa: N802
        self.slideShown.emit(index)
