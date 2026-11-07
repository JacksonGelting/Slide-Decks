import json
import shutil
from pathlib import Path

import pytest

from validate import DECKS_DIR, ExprError, check_rich_text, load_deck, parse_expression

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


def test_live_values_inside_math_are_checked():
    assert check_rich_text("$q = {{qr}}\\,U h$", "x", {}, {"qr"}) == []
    assert "not defined" in check_rich_text("$q = {{nope}}$", "x", {}, set())[0]["message"]


# ------------------------------------------------------- dynamic content


def test_expression_parser():
    assert parse_expression("6*K*X*(1 - X)/((2 + K)*(1 + K*(1 - X))^2)") == {"K", "X"}
    assert parse_expression("-x^2 + sin(pi*x) + 2**3 + 1e-3") == {"x"}
    with pytest.raises(ExprError, match=r"Write multiplication with \*"):
        parse_expression("2x")
    with pytest.raises(ExprError, match="Unknown function"):
        parse_expression("foo(1)")
    with pytest.raises(ExprError, match="ends too early"):
        parse_expression("sqrt(")
    with pytest.raises(ExprError, match="Unexpected character"):
        parse_expression("a % b")


def dynamic(**variables) -> dict:
    return minimal(variables=variables or {"h": {"min": 1, "max": 10, "value": 5}})


def with_elements(deck: dict, *elements) -> dict:
    deck["slides"][0]["layout"] = "body-figure"
    deck["slides"][0]["elements"] = list(elements)
    return deck


def test_valid_dynamic_deck(tmp_path):
    deck = with_elements(
        dynamic(h={"min": 1, "max": 10, "step": 0.5, "value": 5}, W={"expr": "1/h^2", "digits": 2}),
        {"type": "control", "slot": "body", "var": "h"},
        {"type": "text", "slot": "body", "content": "Load {{W}} at $h = {{h}}$."},
        {"type": "steps", "slot": "body", "items": ["One", "Two $x$"], "initial": 0},
        {"type": "chart", "slot": "figure", "kind": "function", "x": "h", "expr": "W",
         "xLabel": "h", "yRange": [0, 1.2], "caption": "Dot at {{h}}"},
        {"type": "chart", "slot": "figure", "kind": "scatter", "data": {"a": [1, 2], "b": [3, 4]},
         "series": [{"x": "a", "y": "b"}]},
    )
    result = load_deck(write_deck(tmp_path, deck))
    assert result["ok"], messages(result)


def test_variable_needs_value_or_expr(tmp_path):
    result = load_deck(write_deck(tmp_path, dynamic(a={"label": "A"}, b={"value": 1, "expr": "2"})))
    assert messages(result).count('Give exactly one of "value"') == 2


def test_derived_variable_errors(tmp_path):
    deck = dynamic(h={"value": 1}, a={"expr": "2*zz"}, b={"expr": "c + 1"}, c={"expr": "b*2"},
                   d={"expr": "h +"}, e={"expr": "h", "min": 0})
    text = messages(load_deck(write_deck(tmp_path, deck)))
    assert '"zz", which is not a deck variable' in text
    assert "can't depend on themselves" in text
    assert "ends too early" in text
    assert "can't have \"min\"" in text


def test_control_errors(tmp_path):
    deck = with_elements(
        dynamic(h={"value": 1}, W={"expr": "h"}),
        {"type": "control", "slot": "body", "var": "nope"},
        {"type": "control", "slot": "body", "var": "W"},
        {"type": "control", "slot": "body", "var": "h"},
    )
    text = messages(load_deck(write_deck(tmp_path, deck)))
    assert '"nope" is not a deck variable' in text
    assert "only set an input variable" in text
    assert 'A slider needs "min" and "max"' in text


def test_chart_errors(tmp_path):
    deck = with_elements(
        dynamic(),
        {"type": "chart", "slot": "figure", "kind": "function", "expr": "h^2"},
        {"type": "chart", "slot": "figure", "kind": "function", "x": "t", "expr": "t*q"},
        {"type": "chart", "slot": "figure", "kind": "function", "x": "h", "expr": "2h", "yRange": [1, 0]},
        {"type": "chart", "slot": "figure", "kind": "line", "series": [{"x": "a", "y": "b"}]},
        {"type": "chart", "slot": "figure", "kind": "line", "data": "assets/missing.csv",
         "series": [{"x": "a", "y": "b"}]},
    )
    text = messages(load_deck(write_deck(tmp_path, deck)))
    assert 'needs "x"' in text
    assert 'Add "domain"' in text
    assert '"q"' in text and "neither a deck variable" in text
    assert "Write multiplication" in text
    assert "must be less than the second" in text
    assert 'the chart has no "data"' in text
    assert 'No file "assets/missing.csv"' in text


def test_chart_csv_columns(tmp_path):
    deck = with_elements(dynamic(), {"type": "chart", "slot": "figure", "kind": "line", "data": "assets/d.csv",
                                     "series": [{"x": "X", "y": "P"}, {"x": "X", "y": "Q"}, {"x": "X", "y": "L"}]})
    deck_dir = write_deck(tmp_path, deck)
    (deck_dir / "assets").mkdir()
    (deck_dir / "assets" / "d.csv").write_text("# comment\nX,P,L\n0,1,a\n1,2,b\n", encoding="utf-8")
    text = messages(load_deck(deck_dir))
    assert 'No column "Q"' in text
    assert 'Column "L" must hold numbers' in text
    assert '"P"' not in text


def test_steps_initial_too_large(tmp_path):
    deck = with_elements(minimal(), {"type": "steps", "slot": "body", "items": ["a"], "initial": 3})
    assert "more than the 1 step(s)" in messages(load_deck(write_deck(tmp_path, deck)))


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
    deck["slides"][0]["elements"][0] = {"type": "figure", "slot": "body"}
    result = load_deck(write_deck(tmp_path, deck))
    assert '"figure" is not allowed here. Use one of: text, chart, control, steps.' in messages(result)


def test_cli(capsys):
    from validate import main

    assert main([]) == 0
    assert main([str(FIXTURES / "broken-deck")]) == 1
    assert "FAIL" in capsys.readouterr().out
