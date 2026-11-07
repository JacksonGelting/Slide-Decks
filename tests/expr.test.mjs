// Tests for the chart/variable expression language and live variables. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, namesIn, parseExpression, ExprError } from "../renderer/js/expr.js";
import { Variables } from "../renderer/js/variables.js";

const run = (src, env = {}) => compile(parseExpression(src))(env);

test("arithmetic, precedence and functions", () => {
  assert.equal(run("1 + 2*3"), 7);
  assert.equal(run("2^3^2"), 512); // right-associative
  assert.equal(run("-2^2"), -4);
  assert.equal(run("2^-1"), 0.5);
  assert.equal(run("2**3"), 8);
  assert.equal(run("max(1, x, 3)", { x: 5 }), 5);
  assert.ok(Math.abs(run("sin(pi/2) + ln(e)") - 2) < 1e-12);
  assert.equal(run("1e-3 * 1000"), 1);
});

test("names exclude constants", () => {
  assert.deepEqual([...namesIn(parseExpression("6*K*X*(1-X)/pi"))].sort(), ["K", "X"]);
});

test("readable errors", () => {
  assert.throws(() => parseExpression("2x"), /Write multiplication with \*/);
  assert.throws(() => parseExpression("foo(1)"), /Unknown function "foo"/);
  assert.throws(() => parseExpression("(1 + 2"), ExprError);
  assert.throws(() => parseExpression(""), /empty/);
  assert.throws(() => parseExpression("a # b"), /Unexpected character/);
});

test("derived variables recompute and notify watchers", () => {
  const vars = new Variables({
    h: { min: 1, max: 20, step: 0.5, value: 5 },
    W: { expr: "(5/h)^2" },
    pct: { expr: "100*W", digits: 0 },
  });
  assert.equal(vars.get("W"), 1);
  const seen = [];
  vars.watch(["pct"], (changed) => seen.push([...changed].sort().join(",")));
  vars.set("h", 2.5);
  assert.equal(vars.get("W"), 4);
  assert.equal(vars.format("pct"), "400");
  assert.equal(vars.format("h"), "2.5");
  assert.deepEqual(seen, ["W,h,pct"]);
  vars.set("W", 9); // derived values can't be set
  assert.equal(vars.get("W"), 4);
  // Sweeps evaluate with an override without changing the stored values.
  assert.equal(vars.envWith({ h: 10 }).W, 0.25);
  assert.equal(vars.get("h"), 2.5);
});

test("formatting", () => {
  const vars = new Variables({ G: { min: -3, max: 3, step: 0.1, value: -0.04 }, q: { expr: "1/3" } });
  assert.equal(vars.format("G"), "0.0"); // no "-0.0"
  assert.equal(vars.format("G", -2.5), "−2.5"); // real minus sign
  assert.equal(vars.format("q"), "0.333");
});
