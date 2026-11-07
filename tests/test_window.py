"""Smoke test: the PySide6 window opens the sample deck and the renderer draws it.

Skipped when PySide6 (with Qt WebEngine) isn't installed or can't start.
"""

import json
import os

import pytest

pytest.importorskip("PySide6.QtWebEngineWidgets", exc_type=ImportError)
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--no-sandbox --disable-gpu")

from PySide6.QtCore import QCoreApplication, QEventLoop, Qt, QTimer  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

from validate import resolve_deck_path  # noqa: E402
from window import MainWindow, register_scheme  # noqa: E402

PROBE = """JSON.stringify({
  slides: document.querySelectorAll('.slide').length,
  terms: document.querySelectorAll('.rt-term').length,
  math: document.querySelectorAll('.katex').length,
  error: !document.getElementById('message').hidden,
})"""


@pytest.fixture(scope="module")
def app():
    register_scheme()
    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    return QApplication.instance() or QApplication([])


def probe(window, timeout_ms=15000):
    """Poll the page until the renderer has drawn something, then return its state."""
    loop = QEventLoop()
    state = {}

    def check():
        def got(result):
            if result:
                data = json.loads(result)
                if data["slides"] or data["error"]:
                    state.update(data)
                    loop.quit()
                    return
            QTimer.singleShot(200, check)
        window.view.page().runJavaScript(PROBE, 0, got)

    QTimer.singleShot(200, check)
    QTimer.singleShot(timeout_ms, loop.quit)
    loop.exec()
    return state


def test_opens_sample_deck(app):
    window = MainWindow(resolve_deck_path("reynolds-equation-intro"))
    window.show()
    state = probe(window)
    assert state.get("slides") == 9 and not state["error"]
    assert state["terms"] > 0 and state["math"] > 0
    assert window.outline.list.count() == 9
    window.close()


def test_broken_deck_shows_error_screen(app):
    from pathlib import Path

    window = MainWindow(resolve_deck_path(Path(__file__).parent / "fixtures" / "broken-deck"))
    window.show()
    state = probe(window)
    assert state.get("error") is True and state["slides"] == 0
    window.close()
