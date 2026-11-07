// Deck variables: the backbone of dynamic content.
//
// An *input* variable has a `value` (sliders change it). A *derived* variable
// has an `expr` computed from other variables, e.g. "W": {"expr": "(5/h)^2"}.
// Anything that shows a variable (a {{name}}, live math, a chart) registers a
// watcher; when a slider moves, only watchers whose names changed run.

import { compile, namesIn, parseExpression } from "./expr.js";

export class Variables {
  constructor(defs = {}, warn = () => {}) {
    this.defs = defs;
    this.warn = warn;
    this.values = {};
    this.derived = []; // [{name, fn, deps}] in evaluation order
    this.watchers = [];

    const pending = new Map();
    for (const [name, def] of Object.entries(defs)) {
      if (typeof def.expr === "string") {
        try {
          const tree = parseExpression(def.expr);
          pending.set(name, { name, fn: compile(tree), deps: namesIn(tree) });
        } catch (err) {
          warn(`Variable "${name}": ${err.message}`);
          this.values[name] = NaN;
        }
      } else {
        this.values[name] = Number(def.value);
      }
    }
    // Order derived variables so each comes after what it reads.
    const visiting = new Set();
    const visit = (name) => {
      const item = pending.get(name);
      if (!item || this.derived.includes(item)) return;
      if (visiting.has(name)) { warn(`Variable "${name}" depends on itself.`); return; }
      visiting.add(name);
      item.deps.forEach(visit);
      visiting.delete(name);
      this.derived.push(item);
    };
    [...pending.keys()].forEach(visit);
    this.recompute(this.values);
  }

  isInput(name) { return name in this.defs && typeof this.defs[name].expr !== "string"; }
  has(name) { return name in this.defs; }
  get(name) { return this.values[name]; }

  recompute(env) {
    for (const { name, fn } of this.derived) {
      try { env[name] = fn(env); } catch { env[name] = NaN; }
    }
    return env;
  }

  /** Environment for evaluating with some inputs overridden (chart sweeps). */
  envWith(overrides) {
    return this.recompute({ ...this.values, ...overrides });
  }

  /** Set an input variable. Runs the watchers affected by the change. */
  set(name, value) {
    if (!this.isInput(name) || this.values[name] === value) return;
    const before = { ...this.values };
    this.values[name] = value;
    this.recompute(this.values);
    const changed = new Set(Object.keys(this.values).filter((k) => !Object.is(before[k], this.values[k])));
    for (const w of this.watchers) {
      if ([...w.names].some((n) => changed.has(n))) {
        try { w.fn(changed); } catch (err) { console.error(err); }
      }
    }
  }

  /** Call fn whenever any of `names` changes. */
  watch(names, fn) {
    const set = new Set(names);
    if (set.size) this.watchers.push({ names: set, fn });
  }

  /** Display string for a variable's current value. */
  format(name, value = this.values[name]) {
    const def = this.defs[name] || {};
    if (typeof value !== "number" || !isFinite(value)) return "–";
    let s;
    if (Number.isInteger(def.digits)) s = value.toFixed(def.digits);
    else if (typeof def.expr === "string") s = String(Number(value.toPrecision(3)));
    else if (typeof def.step === "number") s = value.toFixed(decimalsOf(def.step));
    else s = String(Number(value.toPrecision(6)));
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1); // "-0.00" reads oddly on a slide
    return s.replace(/^-/, "\u2212"); // a real minus sign
  }
}

function decimalsOf(step) {
  const s = String(step);
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  return s.includes(".") ? s.split(".")[1].length : 0;
}
