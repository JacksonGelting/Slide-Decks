// Parser tests for the renderer's rich-text engine. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseBlocks } from "../renderer/js/richtext.js";

const types = (src) => parseInline(src).map((t) => t.t);

test("inline and display math", () => {
  assert.deepEqual(parseInline("a $x^2$ b"), [
    { t: "text", v: "a " }, { t: "math", v: "x^2", display: false }, { t: "text", v: " b" },
  ]);
  assert.deepEqual(parseInline("$$\\frac{a}{b}$$")[0], { t: "math", v: "\\frac{a}{b}", display: true });
  assert.equal(parseInline("$a \\$ b$")[0].v, "a \\$ b");
});

test("escapes and unclosed delimiters stay literal", () => {
  assert.deepEqual(parseInline("costs \\$5"), [{ t: "text", v: "costs $5" }]);
  assert.deepEqual(parseInline("costs $5"), [{ t: "text", v: "costs $5" }]);
  assert.deepEqual(parseInline("[[open"), [{ t: "text", v: "[[open" }]);
});

test("glossary terms", () => {
  const [tok] = parseInline("[[viscosity]]");
  assert.equal(tok.term, "viscosity");
  assert.deepEqual(tok.children, [{ t: "text", v: "viscosity" }]);
  const [custom] = parseInline("[[viscosity|*thick* fluid]]");
  assert.equal(custom.term, "viscosity");
  assert.deepEqual(custom.children.map((c) => c.t), ["em", "text"]);
});

test("emphasis, variables, footnotes", () => {
  assert.deepEqual(types("**bold** and *it*"), ["strong", "text", "em"]);
  assert.deepEqual(types("2 * 3 * 4"), ["text"]);
  assert.deepEqual(types("*has $a*b$ inside*"), ["em"]);
  assert.deepEqual(parseInline("h = {{ h }}")[1], { t: "var", name: "h" });
  const [, note] = parseInline("Petroff^[1883 [see] $x$]");
  assert.equal(note.t, "footnote");
  assert.deepEqual(note.children.map((c) => c.t), ["text", "math"]);
});

test("blocks: paragraphs and lists", () => {
  const blocks = parseBlocks("Intro line\nsecond line\n\n- one\n- two\n  wrapped\n\n1. first\n2. second");
  assert.deepEqual(blocks, [
    { t: "p", v: "Intro line\nsecond line" },
    { t: "ul", items: ["one", "two wrapped"] },
    { t: "ol", items: ["first", "second"] },
  ]);
});
