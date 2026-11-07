import json
import shutil
from pathlib import Path

import pytest

from validate import DECKS_DIR, check_rich_text, load_deck

FIXTURES = Path(__file__).parent / "fixtures"
SAMPLE = DECKS_DIR / "reynolds-equation-intro"


def write_deck(tmp_path: Path, deck: dict, folder: str | None = None) -> Path:
    deck_dir = tmp_path / (folder or deck.get("id", "deck"))
    deck_dir.mkdir()
    (deck_dir / "deck.json").write_text(json.dumps(deck), encoding="utf-8")
    return deck_dir


def minimal(**overrides) -> dict:
    deck = {
        "schemaVersion": 1,
        "id": "mini",
        "title": "Mini",
        "slides": [{"id": "s1", "layout": "title-body", "title": "Hi",
                    "elements": [{"type": "text", "slot": "body", "content": "Hello"}]}],
    }
    deck.update(overrides)
    return deck


def messages(result) -> str:
    return "\n".join(f"{e['where']}: {e['message']}" for e in result["errors"])


@pytest.mark.parametrize("deck_dir", sorted(p.parent for p in DECKS_DIR.glob("*/deck.json")),
                         ids=lambda p: p.name)
def test_every_shipped_deck_is_valid(deck_dir):
    result = load_deck(deck_dir)
    assert result["ok"], messages(result)


def test_load_by_id_and_by_file():
    assert load_deck("reynolds-equation-intro")["ok"]
    assert load_deck(SAMPLE / "deck.json")["ok"]


def test_broken_fixture_reports_readable_errors():
    result = load_deck(FIXTURES / "broken-deck")
    assert not result["ok"]
    text = messages(result)
    assert 'Unknown field "colour"' in text
    assert 'Missing required field "content"' in text
    assert '"two-columns" is not allowed here' in text
    assert 'Slide 1 ("s1") > element 2' in text


def test_missing_file(tmp_path):
    result = load_deck(tmp_path)
    assert not result["ok"]
    assert "No deck.json found" in messages(result)


def test_invalid_json_reports_line(tmp_path):
    d = tmp_path / "bad"
    d.mkdir()
    (d / "deck.json").write_text('{\n  "id": "bad",\n  "title": "x",\n}', encoding="utf-8")
    result = load_deck(d)
    assert not result["ok"]
    assert result["errors"][0]["where"].startswith("line 3")
    assert "not valid JSON" in result["errors"][0]["message"]


def test_newer_schema_version_refused(tmp_path):
    result = load_deck(write_deck(tmp_path, minimal(schemaVersion=2)))
    assert not result["ok"]
    assert "only understands up to 1" in messages(result)


def test_id_must_match_folder(tmp_path):
    result = load_deck(write_deck(tmp_path, minimal(), folder="other-name"))
    assert "must match its folder name" in messages(result)


def test_slot_must_exist_in_layout(tmp_path):
    deck = minimal()
    deck["slides"][0]["elements"][0]["slot"] = "left"
    result = load_deck(write_deck(tmp_path, deck))
    assert 'has no "left" slot' in messages(result)


def test_duplicate_ids(tmp_path):
    deck = minimal()
    deck["slides"].append(dict(deck["slides"][0]))
    result = load_deck(write_deck(tmp_path, deck))
    assert 'The id "s1" is already used' in messages(result)


def test_unknown_glossary_term(tmp_path):
    deck = minimal(glossary={"Viscosity": "Resistance to shear."})
    deck["slides"][0]["elements"][0]["content"] = "[[viscosity]] is fine, [[density]] is not."
    result = load_deck(write_deck(tmp_path, deck))
    text = messages(result)
    assert "[[density]] has no glossary entry" in text
    assert "viscosity" not in text.replace("[[density]]", "")


def test_unclosed_math(tmp_path):
    deck = minimal()
    deck["slides"][0]["elements"][0]["content"] = "Costs $5 and $x^2$"
    result = load_deck(write_deck(tmp_path, deck))
    assert "never closed" in messages(result)


def test_rich_text_checks():
    assert check_rich_text(r"Price \$5, $a$ and $$b$$", "x", {}, set()) == []
    assert check_rich_text("$[[not a term]]$", "x", {}, set()) == []
    assert check_rich_text("{{h}} µm", "x", {}, {"h"}) == []
    assert "not defined" in check_rich_text("{{q}}", "x", {}, set())[0]["message"]
    assert "never closed with ]]" in check_rich_text("[[open", "x", {}, set())[0]["message"]
    assert "inside a glossary definition" in check_rich_text("[[a]]", "x", None, set())[0]["message"]


# ---------------------------------------------------------- schema checker


def test_schema_checker_keywords():
    from validate import SchemaChecker

    checker = SchemaChecker({
        "$defs": {"slug": {"type": "string", "pattern": "^[a-z]+$"}},
        "type": "object",
        "additionalProperties": False,
        "required": ["a"],
        "properties": {
            "a": {"$ref": "#/$defs/slug"},
            "n": {"type": "integer", "minimum": 1},
            "e": {"type": "string", "enum": ["x", "y"]},
            "l": {"type": "array", "minItems": 1, "uniqueItems": True, "items": {"type": "string", "minLength": 1}},
            "m": {"type": "object", "propertyNames": {"type": "string", "pattern": "^k"},
                  "additionalProperties": {"type": "number", "exclusiveMinimum": 0}},
        },
    })
    assert list(checker.iter_errors({"a": "ok", "n": 2, "e": "x", "l": ["p"], "m": {"k1": 1}})) == []
    found = {(e.validator, tuple(e.path)) for e in checker.iter_errors(
        {"a": "BAD", "n": 0, "e": "z", "l": ["", ""], "m": {"zz": 0}, "extra": 1})}
    assert found == {
        ("pattern", ("a",)), ("minimum", ("n",)), ("enum", ("e",)), ("uniqueItems", ("l",)),
        ("minLength", ("l", 0)), ("minLength", ("l", 1)), ("propertyNames", ("m",)),
        ("exclusiveMinimum", ("m", "zz")), ("additionalProperties", ()),
    }
    assert {e.validator for e in checker.iter_errors({})} == {"required"}
    assert {e.validator for e in checker.iter_errors({"a": 5})} == {"type"}
    assert {e.validator for e in checker.iter_errors({"a": "x", "n": True})} == {"type"}


def test_schema_checker_rejects_unknown_keywords():
    from validate import SchemaChecker

    with pytest.raises(ValueError, match="unsupported keyword"):
        SchemaChecker({"type": "string", "maxLength": 3})


def test_unknown_element_type(tmp_path):
    deck = minimal()
    deck["slides"][0]["elements"][0] = {"type": "chart", "slot": "body"}
    result = load_deck(write_deck(tmp_path, deck))
    assert '"chart" is not allowed here. Use one of: text.' in messages(result)


def test_cli(capsys):
    from validate import main

    assert main([]) == 0
    assert main([str(FIXTURES / "broken-deck")]) == 1
    assert "FAIL" in capsys.readouterr().out
