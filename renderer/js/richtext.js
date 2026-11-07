// The one rich-text engine every element uses for every text field.
//
// Inline markup (see docs/AUTHORING.md):
//   $...$            inline math (KaTeX)
//   $$...$$          display math, on its own line
//   **bold**  *italic*
//   [[term]]         glossary hover card;  [[term|shown text]] custom visible text
//   {{var}}          current value of a deck variable
//   ^[note]          footnote marker with hover text (note is rich text)
//   \$ \* \[ \] \{ \} \^ \\   literal characters
//
// Block structure (renderBlocks): blank lines split paragraphs, a single
// newline is a line break, and blocks whose lines start with "- " or "1. "
// become bulleted or numbered lists.
//
// Output is built with DOM APIs (never innerHTML of deck text), so deck text
// can't inject markup. KaTeX output is the only HTML inserted.

const ESCAPABLE = new Set(["$", "*", "[", "]", "{", "}", "^", "\\", "@"]);

// ------------------------------------------------------------------ parsing

/** Parse inline markup into a token tree. Pure: no DOM, no context. */
export function parseInline(src) {
  const tokens = [];
  let text = "";
  let i = 0;
  const flush = () => {
    if (text) tokens.push({ t: "text", v: text });
    text = "";
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\\" && i + 1 < src.length && ESCAPABLE.has(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === "$") {
      const display = src.startsWith("$$", i);
      const delim = display ? "$$" : "$";
      const end = findMathEnd(src, i + delim.length, delim);
      if (end !== -1) {
        flush();
        tokens.push({ t: "math", v: src.slice(i + delim.length, end).trim(), display });
        i = end + delim.length;
        continue;
      }
    }

    if (src.startsWith("[[", i)) {
      const end = src.indexOf("]]", i + 2);
      if (end !== -1) {
        const inner = src.slice(i + 2, end);
        const bar = inner.indexOf("|");
        const term = (bar === -1 ? inner : inner.slice(0, bar)).trim();
        const shown = bar === -1 ? term : inner.slice(bar + 1);
        flush();
        tokens.push({ t: "term", term, children: parseInline(shown) });
        i = end + 2;
        continue;
      }
    }

    if (src.startsWith("{{", i)) {
      const end = src.indexOf("}}", i + 2);
      if (end !== -1) {
        flush();
        tokens.push({ t: "var", name: src.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    if (src.startsWith("^[", i)) {
      const end = findBracketEnd(src, i + 1);
      if (end !== -1) {
        flush();
        tokens.push({ t: "footnote", children: parseInline(src.slice(i + 2, end)) });
        i = end + 1;
        continue;
      }
    }

    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        tokens.push({ t: "strong", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*" && i + 1 < src.length && !/\s/.test(src[i + 1])) {
      const end = findItalicEnd(src, i + 1);
      if (end !== -1) {
        flush();
        tokens.push({ t: "em", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    text += ch;
    i += 1;
  }
  flush();
  return tokens;
}

function findMathEnd(src, from, delim) {
  for (let j = from; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src.startsWith(delim, j)) return j;
  }
  return -1;
}

function findBracketEnd(src, open) {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === "[") depth++;
    else if (src[j] === "]" && --depth === 0) return j;
  }
  return -1;
}

function findItalicEnd(src, from) {
  for (let j = from; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === "$") { // skip math so a * inside $a*b$ doesn't close italics
      const display = src.startsWith("$$", j);
      const end = findMathEnd(src, j + (display ? 2 : 1), display ? "$$" : "$");
      if (end !== -1) { j = end + (display ? 1 : 0); continue; }
    }
    if (src[j] === "*" && src[j + 1] !== "*" && src[j - 1] !== "*" && !/\s/.test(src[j - 1])) return j;
  }
  return -1;
}

/** Split block text into paragraphs and lists. */
export function parseBlocks(src) {
  const blocks = [];
  for (const chunk of src.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    const bullet = /^\s*[-•]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    const kind = bullet.test(lines[0]) ? "ul" : numbered.test(lines[0]) ? "ol" : null;
    if (!kind) {
      blocks.push({ t: "p", v: lines.join("\n") });
      continue;
    }
    const marker = kind === "ul" ? bullet : numbered;
    const items = [];
    for (const line of lines) {
      if (marker.test(line)) items.push(line.replace(marker, ""));
      else if (items.length) items[items.length - 1] += " " + line.trim();
    }
    blocks.push({ t: kind, items });
  }
  return blocks;
}

// --------------------------------------------------------------- rendering

/**
 * Render context shared by all elements on a deck.
 *   glossary   {term: definition}
 *   variables  {name: {value, unit, label, ...}}
 *   warn(msg)  collects authoring warnings (shown in --dev)
 *   footnotes  per-slide counter object {n}
 *   inCard     true while rendering hover-card content (no nested cards)
 */
export function createContext(deck, warn = () => {}) {
  const glossary = new Map();
  for (const [term, def] of Object.entries(deck.glossary || {})) glossary.set(term.toLowerCase(), { term, def });
  return { glossary, variables: deck.variables || {}, warn, footnotes: { n: 0 }, inCard: false };
}

/** Render inline markup to a DocumentFragment. */
export function renderInline(src, ctx) {
  const frag = document.createDocumentFragment();
  appendTokens(frag, parseInline(String(src ?? "")), ctx);
  return frag;
}

/** Render block text (paragraphs, lists) to a DocumentFragment. */
export function renderBlocks(src, ctx) {
  const frag = document.createDocumentFragment();
  for (const block of parseBlocks(String(src ?? ""))) {
    if (block.t === "p") {
      const p = document.createElement("p");
      p.append(renderInline(block.v, ctx));
      frag.append(p);
    } else {
      const list = document.createElement(block.t);
      for (const item of block.items) {
        const li = document.createElement("li");
        li.append(renderInline(item, ctx));
        list.append(li);
      }
      frag.append(list);
    }
  }
  return frag;
}

function appendTokens(parent, tokens, ctx) {
  for (const tok of tokens) parent.append(renderToken(tok, ctx));
}

function renderToken(tok, ctx) {
  switch (tok.t) {
    case "text": return textWithBreaks(tok.v);
    case "math": return renderMath(tok.v, tok.display, ctx);
    case "strong": return wrap("strong", tok.children, ctx);
    case "em": return wrap("em", tok.children, ctx);
    case "term": return renderTerm(tok, ctx);
    case "var": return renderVar(tok.name, ctx);
    case "footnote": return renderFootnote(tok, ctx);
    default: return document.createTextNode("");
  }
}

function textWithBreaks(text) {
  const frag = document.createDocumentFragment();
  text.split("\n").forEach((part, idx) => {
    if (idx) frag.append(document.createElement("br"));
    if (part) frag.append(document.createTextNode(part));
  });
  return frag;
}

function wrap(tag, children, ctx) {
  const el = document.createElement(tag);
  appendTokens(el, children, ctx);
  return el;
}

const KATEX_OPTIONS = {
  throwOnError: true,
  strict: "ignore",
  // Allow only the commands decks use to tag equation terms for hovering.
  trust: ({ command }) => command === "\\htmlId" || command === "\\htmlClass" || command === "\\htmlData",
};

export function renderMath(tex, display, ctx) {
  const span = document.createElement("span");
  span.className = display ? "rt-math rt-math-display" : "rt-math";
  if (!window.katex) {
    span.textContent = tex;
    ctx.warn("KaTeX failed to load; math is shown as source.");
    return span;
  }
  try {
    window.katex.render(tex, span, { ...KATEX_OPTIONS, displayMode: display });
  } catch (err) {
    span.className += " rt-math-error";
    span.textContent = tex;
    span.title = err.message;
    ctx.warn(`Math error in "${tex}": ${err.message}`);
  }
  return span;
}

function renderTerm(tok, ctx) {
  const entry = ctx.glossary.get(tok.term.toLowerCase());
  if (ctx.inCard || !entry) {
    if (!entry) ctx.warn(`[[${tok.term}]] has no glossary entry.`);
    return wrap("span", tok.children, ctx);
  }
  const span = document.createElement("span");
  span.className = "rt-term";
  span.tabIndex = 0;
  span.setAttribute("role", "button");
  span.dataset.term = entry.term;
  appendTokens(span, tok.children, ctx);
  span._card = { title: entry.term, body: entry.def }; // read by interactions.js
  return span;
}

function renderVar(name, ctx) {
  const span = document.createElement("span");
  span.className = "rt-var";
  span.dataset.var = name;
  const variable = ctx.variables[name];
  if (!variable) {
    ctx.warn(`{{${name}}} is not a deck variable.`);
    span.textContent = `{{${name}}}`;
  } else {
    span.textContent = formatNumber(variable.value);
  }
  return span;
}

export function formatNumber(value) {
  if (typeof value !== "number" || !isFinite(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

function renderFootnote(tok, ctx) {
  if (ctx.inCard) return document.createTextNode("");
  const n = ++ctx.footnotes.n;
  const sup = document.createElement("sup");
  sup.className = "rt-footnote";
  sup.tabIndex = 0;
  sup.setAttribute("role", "button");
  sup.textContent = String(n);
  sup._card = { title: `Note ${n}`, tokens: tok.children };
  return sup;
}

/** Render hover-card content (terms inside cards render as plain text). */
export function renderCardBody(card, ctx) {
  const inner = { ...ctx, inCard: true };
  if (card.tokens) {
    const frag = document.createDocumentFragment();
    appendTokens(frag, card.tokens, inner);
    return frag;
  }
  return renderBlocks(card.body, inner);
}
