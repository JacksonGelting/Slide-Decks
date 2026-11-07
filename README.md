# Slide Decks

A desktop viewer for educational slide decks. Claude writes each deck as a JSON data file in `decks/`; the app validates it and renders it as polished, interactive slides (equations, hover definitions, and later charts and sliders). The app runs fully offline.

## Run it (Windows)

Needs Python 3.11+ and the Microsoft Edge WebView2 Runtime (built into Windows 11 and current Windows 10).

```powershell
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app/main.py
```

That opens the first deck in `decks/`. Other options:

| Command | What it does |
| --- | --- |
| `python app/main.py --deck reynolds-equation-intro` | Open a specific deck (id, folder, or `deck.json` path) |
| `python app/main.py --dev` | Authoring mode: lists math errors and overflowing content |
| `python app/main.py --validate` | Check every deck and print problems, no window |
| `python app/main.py --browser` | Open the viewer in your web browser instead of an app window |
| `python app/main.py --deck tests/fixtures/broken-deck` | See the error screen for an invalid deck |

**Keys:** arrows, Page Up/Down or Space to move, Home/End for first/last slide, `R` to reload the deck from disk, `Esc` to close a hover card. Click the right three-quarters of a slide to go forward, the left quarter to go back.

## Getting decks

There is no in-app update. Download the repo as a zip from GitHub (Code → Download ZIP) or copy a deck folder into `decks/`.

## Layout

```
app/          Python shell: window, loading, validation, local server, bridge
renderer/     HTML/CSS/JS that draws the slides; vendor/ holds KaTeX and Plotly.js
schema/       deck.schema.json, the contract every deck is written against
decks/        one folder per deck: deck.json + assets/
docs/         AUTHORING.md, the guide for writing decks
tests/        pytest (loader, server) and node tests (rich-text parser)
```

The Python side only loads, validates and passes deck data; the renderer draws everything. The window loads the renderer from a small server bound to `127.0.0.1` that serves only `renderer/` and `decks/`.

## Writing decks

Read [docs/AUTHORING.md](docs/AUTHORING.md). In short: create `decks/<id>/deck.json`, run `python app/main.py --validate --deck <id>`, then preview with `--dev`.

## Tests

```
pip install -r requirements-dev.txt
python -m pytest
node --test tests/richtext.test.mjs
```

## Third-party libraries

Bundled in `renderer/vendor/` with their licenses: [KaTeX](https://katex.org) 0.16.22 (MIT) and [Plotly.js](https://plotly.com/javascript/) 2.35.3 (MIT, used from Phase 3 for charts).
