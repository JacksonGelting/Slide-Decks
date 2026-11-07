// `control`: a slider (or on/off toggle) bound to an input deck variable.
// Moving it updates every {{var}}, live equation and chart that reads the
// variable, on every slide. Double-click a slider to reset it.

import { renderInline } from "../richtext.js";

export function render(el, ctx) {
  const node = document.createElement("div");
  const name = el.var;
  const def = ctx.deck.variables?.[name];
  if (!def || !ctx.vars.isInput(name)) {
    ctx.warn(`Control "${el.id || name}" needs an input variable; "${name}" is not one.`);
    node.textContent = `Control for unknown variable "${name}".`;
    return node;
  }
  const kind = el.kind || "slider";
  node.classList.add(`control-${kind}`);

  const label = document.createElement("label");
  label.className = "control-label";
  const inputId = `ctl-${el.id || name}-${Math.random().toString(36).slice(2, 7)}`;
  label.htmlFor = inputId;
  label.append(renderInline(el.label ?? def.label ?? name, ctx));

  const input = document.createElement("input");
  input.id = inputId;
  input.className = "control-input";

  const readout = document.createElement("output");
  readout.className = "control-value";
  readout.htmlFor = inputId;

  const drawReadout = () => {
    if (kind === "toggle") readout.textContent = ctx.vars.get(name) ? (el.on ?? "On") : (el.off ?? "Off");
    else readout.textContent = `${ctx.vars.format(name)}${def.unit ? ` ${def.unit}` : ""}`;
  };

  const head = document.createElement("div");
  head.className = "control-head";
  head.append(label, readout);

  if (kind === "toggle") {
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.checked = Boolean(ctx.vars.get(name));
    input.addEventListener("change", () => ctx.vars.set(name, input.checked ? 1 : 0));
    ctx.vars.watch([name], () => { input.checked = Boolean(ctx.vars.get(name)); drawReadout(); });
    const sw = document.createElement("span");
    sw.className = "control-switch";
    const wrap = document.createElement("label");
    wrap.className = "control-switch-wrap";
    wrap.append(input, sw);
    node.append(head, wrap);
  } else {
    input.type = "range";
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step ?? (def.max - def.min) / 100);
    input.value = String(ctx.vars.get(name));
    const sync = () => {
      input.value = String(ctx.vars.get(name));
      const pct = ((ctx.vars.get(name) - def.min) / (def.max - def.min)) * 100;
      input.style.setProperty("--fill", `${Math.min(Math.max(pct, 0), 100)}%`);
      drawReadout();
    };
    input.addEventListener("input", () => ctx.vars.set(name, Number(input.value)));
    input.addEventListener("dblclick", () => ctx.vars.set(name, Number(def.value)));
    ctx.vars.watch([name], sync);

    const scale = document.createElement("div");
    scale.className = "control-scale";
    const lo = document.createElement("span");
    lo.textContent = ctx.vars.format(name, def.min);
    const hi = document.createElement("span");
    hi.textContent = ctx.vars.format(name, def.max);
    scale.append(lo, hi);

    node.append(head, input, scale);
    sync();
  }
  drawReadout();

  // Keys typed on a control adjust it; they must not also change slides.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") input.blur();
    e.stopPropagation();
  });
  return node;
}
