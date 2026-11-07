"""The main window: menus, outline sidebar, and the slide canvas.

The canvas is a QWebEngineView showing renderer/index.html. Files reach it
through the app:// URL scheme (AppSchemeHandler), never through the network
or the file system directly, and Python talks to it over QWebChannel.
"""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QBuffer, QByteArray, QFile, QIODevice, Qt, QUrl
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import (
    QWebEnginePage,
    QWebEngineProfile,
    QWebEngineSettings,
    QWebEngineUrlRequestJob,
    QWebEngineUrlScheme,
    QWebEngineUrlSchemeHandler,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QFileDialog, QMainWindow

from bridge import Bridge
from panels import OutlinePanel
from paths import DECKS_DIR
from server import content_type, resolve_request
from validate import DECK_FILE, resolve_deck_path

SCHEME = b"app"
START_URL = "app://local/renderer/index.html?host=qt"
APP_NAME = "Slide Decks"


def register_scheme() -> None:
    """Declare app:// to Qt. Must run before QApplication is created."""
    scheme = QWebEngineUrlScheme(SCHEME)
    scheme.setSyntax(QWebEngineUrlScheme.Syntax.Host)
    scheme.setFlags(
        QWebEngineUrlScheme.Flag.SecureScheme
        | QWebEngineUrlScheme.Flag.LocalScheme
        | QWebEngineUrlScheme.Flag.LocalAccessAllowed
        | QWebEngineUrlScheme.Flag.CorsEnabled  # ES modules need CORS
        | QWebEngineUrlScheme.Flag.FetchApiAllowed  # charts fetch CSV data from the deck folder
    )
    QWebEngineUrlScheme.registerScheme(scheme)


class AppSchemeHandler(QWebEngineUrlSchemeHandler):
    """Serves app://local/renderer/... and app://local/deck/... (the open deck's folder)."""

    def __init__(self, bridge: Bridge, parent=None) -> None:
        super().__init__(parent)
        self.bridge = bridge

    def requestStarted(self, job: QWebEngineUrlRequestJob) -> None:  # noqa: N802 - Qt override
        path = job.requestUrl().path()
        if path == "/renderer/qwebchannel.js":
            # Ships inside Qt itself; served here so the page needs no qrc access.
            data = _read_qt_resource(":/qtwebchannel/qwebchannel.js")
            ctype = "text/javascript"
        else:
            target = resolve_request(path, self.bridge.deck_path.parent)
            data = target.read_bytes() if target else None
            ctype = content_type(target).split(";")[0] if target else ""
        if data is None:
            job.fail(QWebEngineUrlRequestJob.Error.UrlNotFound)
            return
        buffer = QBuffer(job)
        buffer.setData(QByteArray(data))
        buffer.open(QIODevice.OpenModeFlag.ReadOnly)
        job.reply(ctype.encode(), buffer)


def _read_qt_resource(name: str) -> bytes | None:
    f = QFile(name)
    if not f.open(QIODevice.OpenModeFlag.ReadOnly):
        return None
    try:
        return bytes(f.readAll().data())
    finally:
        f.close()


class MainWindow(QMainWindow):
    def __init__(self, deck_path: Path, dev: bool = False) -> None:
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(1440, 900)
        self.setMinimumSize(800, 500)

        self.bridge = Bridge(deck_path, dev=dev, parent=self)

        profile = QWebEngineProfile.defaultProfile()
        self.scheme_handler = AppSchemeHandler(self.bridge, self)
        profile.installUrlSchemeHandler(SCHEME, self.scheme_handler)

        self.view = QWebEngineView(self)
        page = QWebEnginePage(profile, self.view)
        self.view.setPage(page)
        settings = page.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, False)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, False)
        if not dev:
            self.view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)

        self.channel = QWebChannel(page)
        self.channel.registerObject("bridge", self.bridge)
        page.setWebChannel(self.channel)
        self.setCentralWidget(self.view)

        self.outline = OutlinePanel(self)
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, self.outline)
        self.outline.slideRequested.connect(self._jump_to)
        self.bridge.deckLoaded.connect(self._on_deck_loaded)
        self.bridge.slideShown.connect(self.outline.select)

        self._build_menus()
        self.view.load(QUrl(START_URL))
        self.view.setFocus()

    # ------------------------------------------------------------ menus

    def _build_menus(self) -> None:
        file_menu = self.menuBar().addMenu("&File")
        self._action(file_menu, "&Open Deck Folder…", QKeySequence.StandardKey.Open, self.open_deck)
        self._action(file_menu, "&Reload Deck", QKeySequence("Ctrl+R"), self.reload)
        file_menu.addSeparator()
        self._action(file_menu, "E&xit", QKeySequence("Ctrl+Q"), self.close)

        view_menu = self.menuBar().addMenu("&View")
        toggle = self.outline.toggleViewAction()
        toggle.setText("&Outline")
        toggle.setShortcut(QKeySequence("Ctrl+L"))
        view_menu.addAction(toggle)

    def _action(self, menu, text, shortcut, slot) -> QAction:
        action = QAction(text, self)
        action.setShortcut(shortcut)
        action.triggered.connect(slot)
        menu.addAction(action)
        return action

    # ------------------------------------------------------------ actions

    def open_deck(self) -> None:
        start = str(self.bridge.deck_path.parent.parent if self.bridge.deck_path.exists() else DECKS_DIR)
        folder = QFileDialog.getExistingDirectory(self, "Open deck folder", start)
        if folder:
            self.bridge.deck_path = resolve_deck_path(Path(folder))
            self.view.load(QUrl(START_URL))  # fresh page, starts at slide 1

    def reload(self) -> None:
        self.view.page().runJavaScript("location.reload()")

    def _jump_to(self, index: int) -> None:
        self.bridge.goToSlide.emit(index)
        self.view.setFocus()

    def _on_deck_loaded(self, payload: dict) -> None:
        self.outline.show_deck(payload)
        if payload.get("ok"):
            self.setWindowTitle(f"{payload['deck']['title']} · {APP_NAME}")
        else:
            self.setWindowTitle(f"{Path(payload['deckPath']).parent.name}/{DECK_FILE} (errors) · {APP_NAME}")
