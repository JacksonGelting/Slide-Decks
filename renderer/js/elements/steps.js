// `steps`: content revealed one step at a time (derivations, build-ups).
// The viewer calls advance()/retreat() (via node._steps) before changing
// slides, so the → key, click, Space and the scroll wheel reveal the next
// step first and only move on once every step is showing.

import { renderBlocks } from "../richtext.js";

export function render(el, ctx) {
  const node = document.createElement("div");
  const items = el.items || [];
  const initial = Math.min(Math.max(el.initial ?? 1, 0), items.length);
  const list = document.createElement(el.numbered === false ? "div" : "ol");
  list.className = "steps-list";
  const parts = items.map((item, i) => {
    const step = document.createElement(el.numbered === false ? "div" : "li");
    step.className = "step";
    step.dataset.step = String(i + 1);
    step.append(renderBlocks(item, ctx));
    list.append(step);
    return step;
  });

  const dots = document.createElement("div");
  dots.className = "steps-progress";
  dots.setAttribute("aria-hidden", "true");
  const dotEls = items.map(() => {
    const d = document.createElement("span");
    dots.append(d);
    return d;
  });
  node.append(list);
  if (items.length > 1) node.append(dots);

  let shown = initial;
  const draw = () => {
    parts.forEach((p, i) => {
      const visible = i < shown;
      p.classList.toggle("is-shown", visible);
      p.setAttribute("aria-hidden", visible ? "false" : "true");
    });
    dotEls.forEach((d, i) => d.classList.toggle("is-on", i < shown));
    node.classList.toggle("is-complete", shown >= items.length);
  };
  draw();

  node._steps = {
    advance() { if (shown >= items.length) return false; shown++; draw(); return true; },
    retreat() { if (shown <= initial) return false; shown--; draw(); return true; },
    reset() { shown = initial; draw(); },
    revealAll() { shown = items.length; draw(); },
  };
  return node;
}
