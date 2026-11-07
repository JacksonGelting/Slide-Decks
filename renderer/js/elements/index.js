// Element registry. Each element type is one module exporting:
//   render(el, ctx) -> HTMLElement      required
//   update(node, el, ctx)               optional, called when variables change (Phase 3)
// Add a type by writing its module and registering it here (and in the schema).

import * as text from "./text.js";

export const ELEMENTS = { text };

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
