# Slide Decks

A desktop app for viewing educational slide decks. Claude writes each deck as a JSON data file in `decks/`; the app validates it and renders it as polished, interactive slides (equations, hover definitions, and later charts and sliders). It is a PySide6 (Qt) application with its own window, works fully offline, and has one dependency.

## Run it (Windows)

Needs Python 3.11+.

```powershell
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app/main.py
```

That opens the first deck in `decks/`. A portable `SlideDecks.exe` build that needs no Python comes in Phase 5.

| Command | What it does |
| --- | --- |
| `python app/main.py --deck reynolds-equation-intro` | Open a specific deck (id, folder, or `deck.json` path) |
| `python app/main.py --dev` | Authoring mode: lists math errors and overflowing content |
| `python app/main.py --deck tests/fixtures/broken-deck` | See the error screen for an invalid deck |
| `python app/validate.py [deck]` | Check one deck, or every deck, and print problems. Standard library only |
| `python app/main.py --browser` | Developer preview in a web browser, for machines without PySide6 |

**In the window:** File → Open Deck Folder (Ctrl+O), Reload Deck (Ctrl+R or `R`), View → Outline (Ctrl+L). The outline sidebar follows the current slide; click a title to jump.

**On the slides:** arrows, Page Up/Down or Space to move, Home/End for first/last slide, `Esc` to close a hover card. Click the right three-quarters of a slide to go forward, the left quarter to go back. Hover, focus or click an underlined term to see its definition.

## Getting decks

There is no in-app update. Download the repo zip from GitHub (Code → Download ZIP), or drop a deck folder into `decks/`.

## Layout

```
app/
  main.py       entry point: QApplication + main window (or --validate / --browser)
  window.py     main window, menus, app:// scheme handler, web view
  panels.py     outline sidebar (glossary and notes panels in Phase 2)
  bridge.py     QWebChannel object shared with the renderer
  library.py    scans decks/, builds the payload the renderer gets
  validate.py   deck checker, standard library only
  paths.py      resolves folders in dev and in the built package
  server.py     developer browser preview (not used by the app window)
renderer/       HTML/CSS/JS that draws the slides; vendor/ holds KaTeX and Plotly.js
schema/         deck.schema.json, the contract every deck is written against
decks/          one folder per deck: deck.json + assets/
docs/           AUTHORING.md, the guide for writing decks
tests/          pytest (validator, preview server, Qt window) and node tests (rich-text parser)
```

Python only loads, validates and passes deck data; the renderer draws everything. The web view gets its files through a private `app://` URL scheme that serves only `renderer/` and the open deck's folder, so nothing touches the network.

## Writing decks

Read [docs/AUTHORING.md](docs/AUTHORING.md). In short: create `decks/<id>/deck.json`, run `python app/validate.py <id>`, then preview with `python app/main.py --deck <id> --dev`.

## Tests

```
pip install -r requirements-dev.txt
python -m pytest
node --test tests/richtext.test.mjs
```

The Qt window tests run headless and skip themselves if PySide6 isn't installed.

## Third-party libraries

PySide6 (LGPL). Bundled in `renderer/vendor/` with their licenses: [KaTeX](https://katex.org) 0.16.22 (MIT) and [Plotly.js](https://plotly.com/javascript/) 2.35.3 (MIT, used from Phase 3 for charts).
