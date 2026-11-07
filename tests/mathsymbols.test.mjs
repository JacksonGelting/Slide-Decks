// Tests for equation symbol hover tips. Run: node --test tests/*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { annotateTex, compileSymbols } from "../renderer/js/mathsymbols.js";

const SYMBOLS = compileSymbols({
  W: "Load", "\\mu": "Viscosity", h: "Film thickness", h_o: "Outlet gap", "\\propto": "Proportional to",
  p: "Pressure", x: "Position", t: "Time", "Re^*": "Modified Reynolds number", "\\frac{dh}{dx}": "Gap slope",
});
const run = (tex) => annotateTex(tex, SYMBOLS);
const tips = (tex) => run(tex).tips.map((t) => `${t.tex} => ${t.tip}`);

test("variables and operators", () => {
  const out = run("W \\propto \\mu / h^2");
  assert.deepEqual(out.tips.map((t) => t.tip), ["Load", "Proportional to", "Viscosity", "Film thickness"]);
  assert.match(out.tex, /\\mathrel\{\\htmlData\{sym=1\}\{\\propto\}\}/); // relation keeps its spacing
  assert.match(out.tex, /\{\\htmlData\{sym=3\}\{h\}\}\^2/);
});

test("longest match wins and braces are normalised", () => {
  assert.deepEqual(tips("h_o + h_{o} + h"), ["h_o => Outlet gap", "h_{o} => Outlet gap", "h => Film thickness"]);
  assert.deepEqual(tips("Re^* \\ll 1"), ["Re^* => Modified Reynolds number"]);
});

test("derivatives get automatic tips from symbol names", () => {
  assert.deepEqual(tips("\\frac{dp}{dx}"), ["\\frac{dp}{dx} => Change in pressure with position"]);
  assert.deepEqual(tips("\\dfrac{dq}{dx}"), ["\\dfrac{dq}{dx} => Change in $q$ with position"]);
  assert.deepEqual(tips("\\frac{\\partial (\\rho h)}{\\partial t}"),
    ["\\frac{\\partial (\\rho h)}{\\partial t} => Change in $\\rho h$ with time"]);
  assert.deepEqual(tips("\\frac{d}{dx}"), ["\\frac{d}{dx} => Change with position"]);
  assert.deepEqual(tips("dh/dx = 0"), ["dh/dx => Change in film thickness with position"]);
  // An explicit entry beats the automatic tip, and \dfrac matches a \frac key.
  assert.deepEqual(tips("\\dfrac{dh}{dx}"), ["\\dfrac{dh}{dx} => Gap slope"]);
});

test("derivative inner symbols are not tipped separately; operators wrap around inner derivatives", () => {
  const out = tips("\\frac{d}{dx}\\!\\left(h^3\\,\\frac{dp}{dx}\\right)");
  assert.deepEqual(out, [
    "\\frac{d}{dx} => Change with position",
    "h => Film thickness",
    "\\frac{dp}{dx} => Change in pressure with position",
  ]);
});

test("text, ids and environments are left alone", () => {
  const out = run("\\underbrace{h}_{\\text{height h}} \\begin{aligned} x \\end{aligned}");
  assert.deepEqual(out.tips.map((t) => t.tex), ["h", "x"]);
  assert.match(out.tex, /\\text\{height h\}/);
  assert.match(out.tex, /\\begin\{aligned\}/);
});

test("nothing to annotate leaves the source unchanged", () => {
  const src = "a + b = \\sqrt{c}";
  assert.deepEqual(run(src), { tex: src, tips: [] });
});
