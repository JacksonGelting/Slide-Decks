"""Load a deck folder, validate it, and report problems in plain language.

The loader is the only gate between a deck file and the renderer. It never
raises for a bad deck; it returns a result the renderer can show:

    {"ok": True,  "deck": {...}, "deckDir": "...", "deckPath": "...", "errors": []}
    {"ok": False, "deck": None,  "deckDir": "...", "deckPath": "...", "errors": [
        {"where": "Slide 2 (\"s2\") > element 1 > slot", "message": "..."}]}

Checks run in this order, and later checks only run when earlier ones pass:
  1. the file exists and is valid JSON
  2. schemaVersion is one this app understands
  3. the JSON Schema in schema/deck.schema.json (structure, field names, enums)
  4. cross-reference rules the schema cannot express (unique ids, slots per
     layout, glossary terms, variables, balanced math delimiters)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = REPO_ROOT / "schema" / "deck.schema.json"
DECKS_DIR = REPO_ROOT / "decks"
DECK_FILE = "deck.json"

SUPPORTED_SCHEMA_VERSION = 1
MAX_REPORTED_ERRORS = 25

# Named slots each layout offers. Keep in sync with renderer/js/layouts.js
# and docs/AUTHORING.md.
LAYOUT_SLOTS: dict[str, tuple[str, ...]] = {
    "title": ("body",),
    "title-body": ("body",),
    "two-column": ("left", "right"),
    "body-figure": ("body", "figure"),
    "full-figure": ("figure",),
    "equation-focus": ("equation", "body"),
    "section-break": ("body",),
}

# Element fields that hold rich text, by element type.
RICH_TEXT_FIELDS: dict[str, tuple[str, ...]] = {
    "text": ("content",),
}

TERM_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")
VAR_RE = re.compile(r"\{\{\s*([^}]*?)\s*\}\}")

_validator: Draft202012Validator | None = None


def _schema_validator() -> Draft202012Validator:
    global _validator
    if _validator is None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        _validator = Draft202012Validator(schema)
    return _validator


# ---------------------------------------------------------------- entry points


def resolve_deck_path(target: str | Path | None) -> Path:
    """Turn a deck id, deck folder, or deck.json path into a deck.json path.

    With no target, picks the first deck folder in decks/ (alphabetically).
    """
    if target is None:
        candidates = sorted(p for p in DECKS_DIR.glob(f"*/{DECK_FILE}"))
        if not candidates:
            return DECKS_DIR / DECK_FILE  # will report "not found"
        return candidates[0]

    path = Path(target)
    if not path.exists() and not path.is_absolute() and (DECKS_DIR / path).exists():
        path = DECKS_DIR / path  # a bare deck id like "reynolds-equation-intro"
    if path.is_dir():
        path = path / DECK_FILE
    return path.resolve()


def load_deck(target: str | Path | None = None) -> dict[str, Any]:
    """Load and validate a deck. Never raises for problems in the deck itself."""
    deck_path = resolve_deck_path(target)
    result: dict[str, Any] = {
        "ok": False,
        "deck": None,
        "deckPath": str(deck_path),
        "deckDir": str(deck_path.parent),
        "deckFolder": deck_path.parent.name,
        "errors": [],
    }

    def fail(errors: list[dict[str, str]]) -> dict[str, Any]:
        if len(errors) > MAX_REPORTED_ERRORS:
            extra = len(errors) - MAX_REPORTED_ERRORS
            errors = errors[:MAX_REPORTED_ERRORS] + [
                _issue("", f"...and {extra} more problem(s). Fix the ones above and reload.")
            ]
        result["errors"] = errors
        return result

    # 1. file + JSON
    if not deck_path.is_file():
        return fail([_issue("", f"No {DECK_FILE} found at {deck_path}.")])
    try:
        text = deck_path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError) as exc:
        return fail([_issue("", f"Could not read the file: {exc}")])
    try:
        deck = json.loads(text)
    except json.JSONDecodeError as exc:
        line = text.splitlines()[exc.lineno - 1] if 0 < exc.lineno <= len(text.splitlines()) else ""
        snippet = f' Near: "{line.strip()[:80]}"' if line.strip() else ""
        return fail([_issue(f"line {exc.lineno}, column {exc.colno}",
                            f"The file is not valid JSON ({exc.msg}).{snippet}")])
    if not isinstance(deck, dict):
        return fail([_issue("", "The deck must be a JSON object ({ ... }) at the top level.")])

    # 2. schema version
    version = deck.get("schemaVersion")
    if isinstance(version, int) and not isinstance(version, bool) and version > SUPPORTED_SCHEMA_VERSION:
        return fail([_issue("schemaVersion",
                            f"This deck needs schemaVersion {version}, but this app only understands "
                            f"up to {SUPPORTED_SCHEMA_VERSION}. Get the newer version of the app.")])

    # 3. JSON Schema
    schema_errors = sorted(_schema_validator().iter_errors(deck), key=lambda e: list(map(str, e.absolute_path)))
    if schema_errors:
        return fail(_dedupe([_format_schema_error(e, deck) for e in schema_errors]))

    # 4. cross-references
    problems = check_references(deck, deck_path.parent)
    if problems:
        return fail(problems)

    result["ok"] = True
    result["deck"] = deck
    return result


# ------------------------------------------------------------ semantic checks


def check_references(deck: dict[str, Any], deck_dir: Path) -> list[dict[str, str]]:
    problems: list[dict[str, str]] = []

    if deck["id"] != deck_dir.name:
        problems.append(_issue("id", f'The deck id "{deck["id"]}" must match its folder name "{deck_dir.name}".'))

    glossary = {k.casefold(): k for k in deck.get("glossary", {})}
    variables = set(deck.get("variables", {}))

    for name, var in deck.get("variables", {}).items():
        lo, hi = var.get("min"), var.get("max")
        if lo is not None and hi is not None and lo >= hi:
            problems.append(_issue(f"variables > {name}", f"min ({lo}) must be less than max ({hi})."))
        elif (lo is not None and var["value"] < lo) or (hi is not None and var["value"] > hi):
            problems.append(_issue(f"variables > {name}", f"value {var['value']} is outside min..max."))

    seen_ids: dict[str, str] = {}

    def claim(item_id: str, where: str) -> None:
        if item_id in seen_ids:
            problems.append(_issue(where, f'The id "{item_id}" is already used by {seen_ids[item_id]}. '
                                          "Every slide and element id must be unique in the deck."))
        else:
            seen_ids[item_id] = where

    def check_rich(value: str, where: str, allow_terms: bool = True) -> None:
        problems.extend(check_rich_text(value, where, glossary if allow_terms else None, variables))

    check_rich(deck["title"], "title")
    for key, definition in deck.get("glossary", {}).items():
        check_rich(definition, f'glossary > "{key}"', allow_terms=False)

    for s_index, slide in enumerate(deck["slides"]):
        s_where = _slide_label(s_index, slide)
        claim(slide["id"], s_where)
        for field in ("title", "subtitle"):
            if field in slide:
                check_rich(slide[field], f"{s_where} > {field}")

        allowed = LAYOUT_SLOTS[slide["layout"]]
        for e_index, element in enumerate(slide.get("elements", [])):
            e_where = f"{s_where} > element {e_index + 1}"
            if "id" in element:
                claim(element["id"], e_where)
            if element["slot"] not in allowed:
                problems.append(_issue(f"{e_where} > slot",
                                       f'The "{slide["layout"]}" layout has no "{element["slot"]}" slot. '
                                       f"Use one of: {', '.join(allowed)}."))
            for field in RICH_TEXT_FIELDS.get(element["type"], ()):
                if field in element:
                    check_rich(element[field], f"{e_where} > {field}")

    return problems


def check_rich_text(value: str, where: str, glossary: dict[str, str] | None,
                    variables: set[str]) -> list[dict[str, str]]:
    """Catch the rich-text mistakes that would otherwise render silently wrong."""
    problems: list[dict[str, str]] = []
    prose = _strip_math(value)

    if prose is None:
        problems.append(_issue(where, "A $ math delimiter is never closed. Every $...$ and $$...$$ needs a "
                                      "closing $. Write \\$ for a literal dollar sign."))
        prose = value

    for match in TERM_RE.finditer(prose):
        term = match.group(1).strip()
        if glossary is None:
            problems.append(_issue(where, f"[[{term}]] can't be used inside a glossary definition."))
        elif term.casefold() not in glossary:
            problems.append(_issue(where, f'[[{term}]] has no glossary entry. Add "{term}" to the deck\'s '
                                          "glossary, or remove the brackets."))
    if "[[" in TERM_RE.sub("", prose):
        problems.append(_issue(where, "A [[ hover term is never closed with ]]."))

    for match in VAR_RE.finditer(prose):
        name = match.group(1)
        if name not in variables:
            problems.append(_issue(where, f'{{{{{name}}}}} refers to a variable that is not defined in the '
                                          "deck's variables."))
    return problems


def _strip_math(value: str) -> str | None:
    """Remove $...$ and $$...$$ spans (honouring \\$). None if a span never closes."""
    out: list[str] = []
    i, n = 0, len(value)
    while i < n:
        ch = value[i]
        if ch == "\\" and i + 1 < n:
            out.append(value[i:i + 2])
            i += 2
            continue
        if ch == "$":
            delim = "$$" if value.startswith("$$", i) else "$"
            j = i + len(delim)
            while j < n:
                if value[j] == "\\":
                    j += 2
                    continue
                if value.startswith(delim, j):
                    break
                j += 1
            if j >= n:
                return None
            out.append(" ")
            i = j + len(delim)
            continue
        out.append(ch)
        i += 1
    return "".join(out)


# ------------------------------------------------------- schema error wording

_PATTERN_HINTS = {
    "^[a-z0-9]+(-[a-z0-9]+)*$": "must be lowercase letters and digits joined by single hyphens, like \"my-deck\"",
    "^[A-Za-z][A-Za-z0-9_-]*$": "must start with a letter and use only letters, digits, - or _",
    "^[A-Za-z_][A-Za-z0-9_]*$": "must be a simple name like h or film_thickness (letters, digits, _)",
    "^[^\\[\\]|]+$": "can't contain [, ] or |",
}

_JSON_TYPES = {dict: "an object", list: "a list", str: "text", bool: "true/false",
               int: "a number", float: "a number", type(None): "null"}


def _format_schema_error(error, deck: dict[str, Any]) -> dict[str, str]:
    where = _where(list(error.absolute_path), deck)
    v, inst, expected = error.validator, error.instance, error.validator_value

    if v == "required":
        missing = [k for k in expected if isinstance(inst, dict) and k not in inst]
        msg = f"Missing required field {_names(missing)}."
    elif v == "additionalProperties":
        known = set(error.schema.get("properties", {}))
        extra = sorted(k for k in inst if k not in known) if isinstance(inst, dict) else []
        hint = f" Allowed fields: {', '.join(sorted(known))}." if known else ""
        msg = f"Unknown field {_names(extra)}.{hint}"
    elif v == "enum":
        msg = f"{json.dumps(inst)} is not allowed here. Use one of: {', '.join(map(str, expected))}."
    elif v == "const":
        msg = f"Must be {json.dumps(expected)}."
    elif v == "type":
        msg = f"Should be {_type_name(expected)}, but got {_JSON_TYPES.get(type(inst), type(inst).__name__)}."
    elif v == "pattern":
        msg = f"{json.dumps(inst)} {_PATTERN_HINTS.get(expected, 'has the wrong format')}."
    elif v == "minLength":
        msg = "Must not be empty."
    elif v == "minItems":
        msg = f"Needs at least {expected} item(s)."
    elif v == "uniqueItems":
        msg = "Contains duplicate entries."
    elif v in ("minimum", "exclusiveMinimum"):
        msg = f"Must be {'at least' if v == 'minimum' else 'greater than'} {expected}."
    elif v == "propertyNames":
        msg = error.message
    else:
        msg = error.message[0].upper() + error.message[1:] if error.message else "Invalid value."
    return _issue(where, msg)


def _where(path: list, deck: dict[str, Any]) -> str:
    parts: list[str] = []
    i = 0
    while i < len(path):
        key = path[i]
        if key == "slides" and i + 1 < len(path) and isinstance(path[i + 1], int):
            idx = path[i + 1]
            slides = deck.get("slides")
            slide = slides[idx] if isinstance(slides, list) and idx < len(slides) else None
            parts.append(_slide_label(idx, slide))
            i += 2
        elif key == "elements" and i + 1 < len(path) and isinstance(path[i + 1], int):
            parts.append(f"element {path[i + 1] + 1}")
            i += 2
        elif isinstance(key, int):
            parts.append(f"item {key + 1}")
            i += 1
        else:
            parts.append(str(key))
            i += 1
    return " > ".join(parts) if parts else "deck"


def _slide_label(index: int, slide: Any) -> str:
    sid = slide.get("id") if isinstance(slide, dict) else None
    return f'Slide {index + 1} ("{sid}")' if isinstance(sid, str) else f"Slide {index + 1}"


def _names(keys: list[str]) -> str:
    return ", ".join(f'"{k}"' for k in keys) if keys else "(unknown)"


def _type_name(expected: Any) -> str:
    names = {"object": "an object", "array": "a list", "string": "text", "integer": "a whole number",
             "number": "a number", "boolean": "true/false", "null": "null"}
    if isinstance(expected, list):
        return " or ".join(names.get(t, t) for t in expected)
    return names.get(expected, str(expected))


def _issue(where: str, message: str) -> dict[str, str]:
    return {"where": where, "message": message}


def _dedupe(issues: list[dict[str, str]]) -> list[dict[str, str]]:
    seen, out = set(), []
    for item in issues:
        key = (item["where"], item["message"])
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out
