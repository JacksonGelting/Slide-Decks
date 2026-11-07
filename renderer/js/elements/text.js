// `text`: paragraphs and lists of rich text.
import { renderBlocks } from "../richtext.js";

export function render(el, ctx) {
  const node = document.createElement("div");
  node.classList.add(`size-${el.size || "normal"}`, `align-${el.align || "start"}`);
  node.append(renderBlocks(el.content, ctx));
  return node;
}
