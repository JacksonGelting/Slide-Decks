"""Side panels around the slide canvas.

Phase 1 has the outline sidebar. Glossary and speaker-notes panels arrive
in Phase 2.
"""

from __future__ import annotations

import re

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QDockWidget, QListWidget, QListWidgetItem

_TERM = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")
_FOOTNOTE = re.compile(r"\^\[[^\]]*\]")


def plain_title(text: str) -> str:
    """Rich-text title to plain text for list rows (math is kept as source)."""
    text = _TERM.sub(lambda m: m.group(2) or m.group(1), text)
    text = _FOOTNOTE.sub("", text)
    text = text.replace("**", "").replace("$", "")
    return re.sub(r"\\([$*\[\]{}^@\\])", r"\1", text).strip()


class OutlinePanel(QDockWidget):
    """Numbered list of slide titles. Click a row to jump to that slide."""

    slideRequested = Signal(int)

    def __init__(self, parent=None) -> None:
        super().__init__("Outline", parent)
        self.setObjectName("outline")
        self.setFeatures(QDockWidget.DockWidgetFeature.DockWidgetClosable)
        self.setAllowedAreas(Qt.DockWidgetArea.LeftDockWidgetArea | Qt.DockWidgetArea.RightDockWidgetArea)
        self.list = QListWidget(self)
        self.list.setFocusPolicy(Qt.FocusPolicy.NoFocus)  # arrow keys stay with the slides
        self.list.setWordWrap(True)
        self.list.setStyleSheet("QListWidget { border: none; } QListWidget::item { padding: 6px 10px; }")
        self.list.itemClicked.connect(lambda item: self.slideRequested.emit(self.list.row(item)))
        self.setWidget(self.list)
        self.setMinimumWidth(220)

    def show_deck(self, payload: dict) -> None:
        self.list.clear()
        if not payload.get("ok"):
            item = QListWidgetItem("This deck has errors.\nSee the message on the right.")
            item.setFlags(Qt.ItemFlag.NoItemFlags)
            self.list.addItem(item)
            return
        for i, slide in enumerate(payload["deck"]["slides"]):
            title = plain_title(slide.get("title", "")) or f"({slide['layout']})"
            self.list.addItem(QListWidgetItem(f"{i + 1}.  {title}"))

    def select(self, index: int) -> None:
        if 0 <= index < self.list.count():
            self.list.blockSignals(True)
            self.list.setCurrentRow(index)
            self.list.scrollToItem(self.list.item(index))
            self.list.blockSignals(False)
