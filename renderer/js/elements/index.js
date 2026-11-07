// Element registry. Each element type is one module exporting:
//   render(el, ctx) -> HTMLElement      required
// Elements that show deck variables redraw themselves by registering a
// watcher with ctx.vars.watch(names, fn) (see variables.js). Work that needs
// the element on the page (sizing a chart) waits for ctx.whenMounted.
// Add a type by writing its module and registering it here (and in the schema).

import * as text from "./text.js";
import * as chart from "./chart.js";
import * as control from "./control.js";
import * as steps from "./steps.js";

export const ELEMENTS = { text, chart, control, steps };

export function renderElement(el, ctx) {
  const type = ELEMENTS[el.type];
  let node;
  if (!type) {
    node = document.createElement("div");
    node.className = "el el-unknown";
    node.textContent = `Unsupported element type "${el.type}".`;
    ctx.warn(`Element type "${el.type}" is not supported by this renderer.`);
  } else {
    node = type.render(el, ctx);
    node.classList.add("el", `el-${el.type}`);
  }
  if (el.id) node.id = `el-${el.id}`;
  node.dataset.type = el.type;
  return node;
}
