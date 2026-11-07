// `chart`: function plots (from expressions) and data plots (from a CSV asset
// or inline columns), drawn with the bundled Plotly.js. Charts that read deck
// variables redraw live when a slider moves. Colors, fonts and sizes come from
// the theme; decks only say what to plot.

import { compile, namesIn, parseExpression } from "../expr.js";
import { renderInline } from "../richtext.js";

let plotlyPromise = null;
function loadPlotly() {
  plotlyPromise ??= window.Plotly ? Promise.resolve(window.Plotly) : new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/plotly/plotly.min.js";
    s.onload = () => resolve(window.Plotly);
    s.onerror = () => reject(new Error("Plotly.js failed to load."));
    document.head.append(s);
  });
  return plotlyPromise;
}

const csvCache = new Map();

export function render(el, ctx) {
  const node = document.createElement("figure");
  node.classList.add(`chart-${el.kind}`);
  const plot = document.createElement("div");
  plot.className = "chart-plot";
  node.append(plot);
  if (el.caption) {
    const cap = document.createElement("figcaption");
    cap.className = "chart-caption";
    cap.append(renderInline(el.caption, ctx));
    node.append(cap);
  }

  let model;
  try {
    model = prepare(el, ctx);
  } catch (err) {
    return fail(node, plot, el, ctx, err);
  }

  ctx.whenMounted.then(async () => {
    try {
      const [Plotly, data] = await Promise.all([loadPlotly(), loadData(el, ctx)]);
      model.data = data;
      checkColumns(model, data);
      const draw = () => Plotly.react(plot, ...figure(model, plot, ctx));
      await draw();
      if (model.names.size) {
        let queued = false;
        ctx.vars.watch(model.names, () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => { queued = false; draw(); });
        });
      }
      node.classList.add("is-drawn");
    } catch (err) {
      fail(node, plot, el, ctx, err);
    }
  });
  return node;
}

function fail(node, plot, el, ctx, err) {
  ctx.warn(`Chart "${el.id || el.kind}": ${err.message}`);
  plot.classList.add("chart-error");
  plot.textContent = `This chart couldn't be drawn: ${err.message}`;
  return node;
}

// ------------------------------------------------------------- model

function prepare(el, ctx) {
  const specs = el.series || (el.expr ? [{ expr: el.expr }] : []);
  if (!specs.length) throw new Error("it has no series (add \"expr\" or \"series\").");
  const names = new Set();
  const xVar = el.x;
  const xIsDeckVar = Boolean(xVar && ctx.vars.has(xVar));

  const series = specs.map((s, i) => {
    const out = { ...s, index: i };
    if (typeof s.expr === "string") {
      const tree = parseExpression(s.expr);
      out.fn = compile(tree);
      for (const n of namesIn(tree)) {
        if (n !== xVar && !ctx.vars.has(n)) throw new Error(`"${n}" in "${s.expr}" is not a deck variable or the chart's x.`);
        if (n !== xVar) names.add(n);
      }
    }
    return out;
  });
  if (xIsDeckVar && el.track !== false) names.add(xVar);
  // Sweeping x through derived variables: when x is a deck variable, the
  // curve also depends on whatever those derived variables read.
  for (const n of [...names]) for (const d of depsOf(n, ctx)) if (d !== xVar) names.add(d);

  let domain = el.domain;
  if (!domain && xIsDeckVar) {
    const def = ctx.deck.variables[xVar];
    if (typeof def.min === "number" && typeof def.max === "number") domain = [def.min, def.max];
  }
  if (series.some((s) => s.fn) && !domain) throw new Error("function charts need a \"domain\" when x is not a slider variable.");
  return { el, series, names, xVar, xIsDeckVar, domain, data: null };
}

function depsOf(name, ctx, seen = new Set()) {
  const item = ctx.vars.derived.find((d) => d.name === name);
  if (!item || seen.has(name)) return seen;
  seen.add(name);
  for (const d of item.deps) { seen.add(d); depsOf(d, ctx, seen); }
  return seen;
}

async function loadData(el, ctx) {
  if (!el.data) return null;
  if (typeof el.data === "object") return el.data;
  const url = (ctx.assetBase || "/deck/") + el.data;
  if (!csvCache.has(url)) {
    csvCache.set(url, fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`could not load ${el.data} (${r.status}).`);
      return r.text();
    }).then(parseCsv));
  }
  return csvCache.get(url);
}

/** Minimal CSV: header row, comma separated, optional "quoted" cells. Numbers become numbers. */
export function parseCsv(text) {
  const rows = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map(splitCsvLine);
  if (!rows.length) return {};
  const [header, ...body] = rows;
  const cols = {};
  header.forEach((h, j) => {
    const name = h.trim();
    const raw = body.map((r) => (r[j] ?? "").trim());
    const numeric = raw.every((v) => v === "" || isFinite(Number(v)));
    cols[name] = numeric ? raw.map((v) => (v === "" ? null : Number(v))) : raw;
  });
  return cols;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function checkColumns(model, data) {
  for (const s of model.series) {
    if (s.fn) continue;
    if (!data) throw new Error(`series ${s.index + 1} reads columns but the chart has no "data".`);
    for (const key of ["x", "y"]) {
      if (!(s[key] in data)) throw new Error(`no column "${s[key]}" in the chart's data.`);
    }
  }
}

// ------------------------------------------------------------- figure

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const DEFAULT_MARK = { function: "line", line: "line", scatter: "points", bar: "bar" };

function figure(model, plot, ctx) {
  const { el, series, xVar, xIsDeckVar, domain } = model;
  const transpose = Boolean(el.transpose);
  const palette = [1, 2, 3, 4, 5, 6].map((i) => token(`--series-${i}`));
  const ink = token("--ink-soft");
  const muted = token("--muted");
  const rule = token("--rule");
  const font = token("--font-sans");
  const xLog = el.xScale === "log";
  const traces = [];
  let colorIndex = 0;
  const needsRight = series.some((s) => s.axis === "right");
  const named = series.filter((s) => s.name).length;
  const fmt = (label) => (label ? `${label}: ` : "");

  for (const s of series) {
    const reference = s.role === "reference";
    const color = reference ? muted : palette[colorIndex++ % palette.length];
    const mark = s.mark || DEFAULT_MARK[el.kind] || "line";
    let xs; let ys;
    if (s.fn) {
      const n = Math.max(2, Math.min(el.samples || 200, 2000));
      const [lo, hi] = domain;
      xs = []; ys = [];
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const t = xLog && lo > 0 ? lo * Math.pow(hi / lo, f) : lo + (hi - lo) * f;
        let y;
        try { y = s.fn(ctx.vars.envWith({ [xVar]: t })); } catch { y = NaN; }
        xs.push(t);
        ys.push(Number.isFinite(y) ? y : null);
      }
    } else {
      xs = model.data[s.x];
      ys = model.data[s.y];
    }
    const yAxisLabel = s.axis === "right" ? el.y2Label : el.yLabel;
    const trace = {
      name: s.name || "",
      showlegend: Boolean(s.name) && named > 1,
      x: transpose && s.fn ? ys : xs,
      y: transpose && s.fn ? xs : ys,
      yaxis: s.axis === "right" ? "y2" : "y",
      hovertemplate: `${fmt(el.xLabel)}%{x:.3~g}<br>${fmt(yAxisLabel)}%{y:.3~g}<extra>${s.name || ""}</extra>`,
    };
    if (mark === "bar") {
      Object.assign(trace, { type: "bar", marker: { color }, hovertemplate: `%{x}<br>${fmt(yAxisLabel)}%{y:.3~g}<extra>${s.name || ""}</extra>` });
    } else {
      trace.type = "scatter";
      trace.mode = mark === "points" ? "markers" : mark === "line+points" ? "lines+markers" : "lines";
      trace.line = { color, width: reference ? 3 : 5, dash: reference ? "dash" : "solid", shape: "linear" };
      trace.marker = { color, size: 16, line: { color: token("--surface"), width: 2 } };
      if (mark === "area") { trace.fill = transpose ? "tozerox" : "tozeroy"; trace.fillcolor = hexAlpha(color, 0.14); }
      trace.connectgaps = false;
      trace.cliponaxis = mark === "line" || mark === "area"; // keep end points whole
    }
    traces.push(trace);

    // Tracking dot: where the slider's current value sits on this curve.
    if (s.fn && xIsDeckVar && el.track !== false && !reference) {
      const t = ctx.vars.get(xVar);
      let y;
      try { y = s.fn(ctx.vars.envWith({})); } catch { y = NaN; }
      if (Number.isFinite(y)) {
        traces.push({
          type: "scatter", mode: "markers", showlegend: false, hoverinfo: "skip", cliponaxis: false,
          x: [transpose ? y : t], y: [transpose ? t : y], yaxis: trace.yaxis,
          marker: { color, size: 30, line: { color: token("--surface"), width: 5 } },
        });
      }
    }
  }

  const axis = (title, range, type) => ({
    title: { text: title || "", font: { size: 28, color: ink }, standoff: 18 },
    range: range ? (type === "log" ? range.map(Math.log10) : range) : undefined,
    autorange: range ? false : true,
    type: type || "linear",
    gridcolor: rule,
    linecolor: rule,
    zerolinecolor: rule,
    tickfont: { size: 24, color: muted },
    ticks: "outside",
    tickcolor: rule,
    ticklen: 8,
    hoverformat: ".3~g",
    automargin: true,
    fixedrange: true,
  });

  let xRange = el.xRange;
  if (!xRange && domain && series.every((s) => s.fn) && !transpose) xRange = domain;
  let yRange = el.yRange;
  if (!yRange && domain && transpose) yRange = domain;

  const layout = {
    width: plot.clientWidth || 800,
    height: plot.clientHeight || 500,
    margin: { l: 24, r: needsRight ? 24 : 36, t: named > 1 ? 16 : 24, b: 24 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: font, size: 24, color: ink },
    xaxis: axis(el.xLabel, xRange, el.xScale),
    yaxis: axis(el.yLabel, yRange, el.yScale),
    showlegend: named > 1,
    legend: { orientation: "h", x: 0, xanchor: "left", y: 1.0, yanchor: "bottom", font: { size: 24, color: ink } },
    // Function curves: hover anywhere along x (or y, when transposed).
    hovermode: series.every((s) => s.fn) ? (transpose ? "y" : "x") : "closest",
    hoverdistance: 40,
    hoverlabel: { font: { family: font, size: 22, color: token("--ink") }, bgcolor: token("--surface"), bordercolor: rule },
    dragmode: false,
    bargap: 0.35,
  };
  if (needsRight) {
    layout.yaxis2 = { ...axis(el.y2Label, el.y2Range, el.yScale), overlaying: "y", side: "right", showgrid: false };
  }
  const config = { displayModeBar: false, scrollZoom: false, doubleClick: false, showTips: false, responsive: false };
  return [traces, layout, config];
}

function hexAlpha(color, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
