// Hover tips for the parts of an equation.
//
// Before KaTeX draws an equation, annotateTex() finds:
//   - every symbol listed in the deck's "symbols" map (W, \mu, h_o, \propto,
//     \frac{dp}{dx}, Re^*, ...), longest match first, and
//   - every derivative (\frac{dp}{dx}, \frac{\partial}{\partial x}, dq/dx)
//     that has no entry of its own, which gets an automatic tip built from
//     the symbols' own tips, e.g. "Change in pressure with position",
// and wraps each in \htmlData{sym=<n>}{...}. After drawing, the renderer
// gives those spans a short hover card. Pure string work: no DOM, so it is
// unit-tested in node (tests/mathsymbols.test.mjs).

const FRACS = new Set(["\\frac", "\\dfrac", "\\tfrac"]);
const DIFF = new Set(["d", "\\partial"]);
// Commands whose arguments are text or ids, not math to annotate: [name, argument count].
const OPAQUE = new Map([
  ["\\text", 1], ["\\textbf", 1], ["\\textit", 1], ["\\mathrm", 1], ["\\operatorname", 1],
  ["\\htmlId", 2], ["\\htmlClass", 2], ["\\htmlData", 2], ["\\htmlStyle", 2],
  ["\\begin", 1], ["\\end", 1], ["\\label", 1], ["\\tag", 1],
]);
const RELATIONS = new Set(["=", "<", ">", "\\propto", "\\approx", "\\ll", "\\gg", "\\neq", "\\ne", "\\le", "\\leq",
  "\\ge", "\\geq", "\\sim", "\\simeq", "\\equiv", "\\to", "\\rightarrow"]);
const BINARIES = new Set(["+", "-", "\\cdot", "\\times", "\\pm", "\\mp"]);

// ------------------------------------------------------------------ parsing

function tokenize(tex) {
  return tex.match(/\\[A-Za-z]+|\\.|\s+|[\s\S]/gu) || [];
}

/** Token list -> tree of {t:"tok"|"ws"|"grp", v, items}. Unbalanced braces are left as tokens. */
function parse(tex) {
  const root = [];
  const stack = [root];
  for (const v of tokenize(tex)) {
    const top = stack[stack.length - 1];
    if (v === "{") {
      const grp = { t: "grp", items: [] };
      top.push(grp);
      stack.push(grp.items);
    } else if (v === "}" && stack.length > 1) {
      stack.pop();
    } else {
      top.push({ t: /^\s+$/.test(v) ? "ws" : "tok", v });
    }
  }
  return root;
}

const solid = (items) => items.filter((it) => it.t !== "ws");

function serialize(items) {
  return items.map((it) => (it.t === "grp" ? `{${serialize(it.items)}}` : it.v)).join("");
}

/** Comparable form of one item: \dfrac == \frac, h_{o} == h_o. */
function norm(it) {
  if (it.t === "grp") {
    const inner = solid(it.items);
    if (inner.length === 1 && inner[0].t === "tok") return norm(inner[0]);
    return `{${inner.map(norm).join(" ")}}`;
  }
  return FRACS.has(it.v) ? "\\frac" : it.v;
}

/** Turn {"tex": tip} into lookup entries, longest first. */
export function compileSymbols(symbols = {}) {
  const entries = [];
  for (const [key, tip] of Object.entries(symbols)) {
    const seq = solid(parse(key)).map(norm);
    if (seq.length) entries.push({ seq, tip, key });
  }
  return entries.sort((a, b) => b.seq.length - a.seq.length);
}

// --------------------------------------------------------------- annotating

/**
 * Wrap known symbols and derivatives of `tex` in \htmlData{sym=n}{...}.
 * Returns {tex, tips}: tips[n] = {tex: the symbol's source, tip: rich text}.
 */
export function annotateTex(tex, entries, { derivatives = true } = {}) {
  const tips = [];
  const out = walk(parse(tex), entries, tips, derivatives);
  return { tex: serialize(out), tips };
}

function walk(items, entries, tips, derivatives) {
  const out = [];
  let i = 0;
  // Index of the next non-whitespace item at or after j (items.length if none).
  const next = (j) => { while (j < items.length && items[j].t === "ws") j++; return j; };
  const wrap = (from, to, tip, prev) => {
    const span = items.slice(from, to + 1);
    const n = tips.length;
    const shown = span.length === 1 && span[0].t === "grp" ? serialize(span[0].items) : serialize(span);
    tips.push({ tex: shown.trim(), tip });
    const body = `\\htmlData{sym=${n}}{${serialize(span)}}`;
    const solo = solid(span);
    const script = prev && (prev.v === "^" || prev.v === "_");
    let raw = `{${body}}`;
    if (!script && solo.length === 1 && RELATIONS.has(solo[0].v)) raw = `\\mathrel{${body}}`;
    else if (!script && solo.length === 1 && BINARIES.has(solo[0].v) && out.some((it) => it.t !== "ws")) raw = `\\mathbin{${body}}`;
    out.push({ t: "tok", v: raw });
  };
  const lastSolid = () => [...out].reverse().find((it) => it.t !== "ws");

  while (i < items.length) {
    const it = items[i];
    if (it.t === "ws") { out.push(it); i++; continue; }

    // Leave text, ids and environment names untouched.
    if (it.t === "tok" && OPAQUE.has(it.v)) {
      let j = i + 1;
      for (let k = 0; k < OPAQUE.get(it.v); k++) {
        const a = next(j);
        if (a < items.length && items[a].t === "grp") j = a + 1;
      }
      out.push(...items.slice(i, j));
      i = j;
      continue;
    }
    if (it.t === "tok" && (it.v === "\\left" || it.v === "\\right" || it.v === "\\bigl" || it.v === "\\bigr"
      || it.v === "\\Bigl" || it.v === "\\Bigr" || it.v === "\\big" || it.v === "\\Big")) {
      const a = next(i + 1);
      out.push(...items.slice(i, a + 1));
      i = a + 1;
      continue;
    }

    // 1. A symbol from the deck's list (longest first).
    const match = matchAt(items, i, entries, next);
    if (match) { wrap(i, match.end, match.tip, lastSolid()); i = match.end + 1; continue; }

    // 2. A derivative: \frac{dX}{dY} or dX/dY.
    if (derivatives) {
      const d = derivativeAt(items, i, next, entries);
      if (d) { wrap(i, d.end, d.tip, lastSolid()); i = d.end + 1; continue; }
    }

    // 3. Otherwise look inside groups.
    if (it.t === "grp") out.push({ t: "grp", items: walk(it.items, entries, tips, derivatives) });
    else out.push(it);
    i++;
  }
  return out;
}

function matchAt(items, i, entries, next) {
  for (const entry of entries) {
    let j = i;
    let end = -1;
    let ok = true;
    for (const want of entry.seq) {
      j = next(j);
      if (j >= items.length || norm(items[j]) !== want) { ok = false; break; }
      end = j;
      j++;
    }
    if (ok) return { end, tip: entry.tip };
  }
  return null;
}

function derivativeAt(items, i, next, entries) {
  const it = items[i];
  // \frac{d X}{d Y}
  if (it.t === "tok" && FRACS.has(it.v)) {
    const a = next(i + 1);
    const b = next(a + 1);
    if (items[a]?.t !== "grp" || items[b]?.t !== "grp") return null;
    const num = solid(items[a].items);
    const den = solid(items[b].items);
    if (!num.length || !den.length || !DIFF.has(num[0].v) || den[0].v !== num[0].v) return null;
    let what = num.slice(1);
    if (what[0]?.v === "^") return null; // higher derivatives: leave to an explicit entry
    if (what.length >= 2 && what[0].v === "(" && what[what.length - 1].v === ")") what = what.slice(1, -1);
    const by = den.slice(1);
    if (!by.length) return null;
    return { end: b, tip: derivativeTip(what, by, entries) };
  }
  // d X / d Y, each a single symbol
  if (it.t === "tok" && DIFF.has(it.v)) {
    const x = next(i + 1);
    const slash = next(x + 1);
    const d2 = next(slash + 1);
    const y = next(d2 + 1);
    if (y >= items.length || items[slash].v !== "/" || items[d2].v !== it.v) return null;
    if (items[x].t === "ws" || items[y].t === "ws") return null;
    return { end: y, tip: derivativeTip([items[x]], [items[y]], entries) };
  }
  return null;
}

/** Re-insert single spaces so "\rho h" doesn't become "\rhoh". */
function spaced(items) {
  const out = [];
  items.forEach((it, k) => { if (k) out.push({ t: "ws", v: " " }); out.push(it); });
  return out;
}

/** "Change in pressure with position": names from the symbols list, else the math itself. */
function derivativeTip(what, by, entries) {
  const name = (items) => {
    const seq = solid(items).map(norm);
    const hit = entries.find((e) => e.seq.length === seq.length && e.seq.every((v, k) => v === seq[k]));
    if (hit && !/[$\[\]{}]/.test(hit.tip)) return lowerFirst(hit.tip);
    return `$${serialize(spaced(solid(items)))}$`;
  };
  return solid(what).length ? `Change in ${name(what)} with ${name(by)}` : `Change with ${name(by)}`;
}

function lowerFirst(text) {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}
