// Shared interactions. Phase 1: the hover card used by [[term]] and ^[note].
//
// One card element lives inside the 1920x1080 canvas, so it scales with the
// slide and looks the same everywhere. Any element with a `_card` property
// ({title, body} or {title, tokens}) gets a card on hover, keyboard focus or
// click/tap (click pins it open; Escape or clicking elsewhere closes it).

import { renderCardBody, renderInline } from "./richtext.js";

const SHOW_DELAY = 80;
const HIDE_DELAY = 140;

export function installHoverCards(canvas, ctx, getScale) {
  const card = document.createElement("div");
  card.className = "hovercard";
  card.setAttribute("role", "tooltip");
  card.id = "hovercard";
  card.hidden = true;
  canvas.append(card);

  let anchor = null;
  let pinned = false;
  let showTimer = 0;
  let hideTimer = 0;

  const targetOf = (node) => {
    for (let el = node; el && el !== canvas; el = el.parentElement) if (el._card) return el;
    return null;
  };

  function show(target) {
    clearTimeout(hideTimer);
    if (anchor === target && !card.hidden) return;
    anchor?.removeAttribute("aria-describedby");
    anchor = target;
    card.replaceChildren();
    const title = document.createElement("div");
    title.className = "hovercard-title";
    title.append(renderInline(target._card.title, { ...ctx, inCard: true }));
    const body = document.createElement("div");
    body.className = "hovercard-body";
    body.append(renderCardBody(target._card, ctx));
    card.append(title, body);
    card.hidden = false;
    target.setAttribute("aria-describedby", card.id);
    target.classList.add("is-active");
    position(target);
  }

  function hide() {
    clearTimeout(showTimer);
    if (!anchor) return;
    anchor.classList.remove("is-active");
    anchor.removeAttribute("aria-describedby");
    anchor = null;
    pinned = false;
    card.hidden = true;
  }

  function position(target) {
    const scale = getScale();
    const base = canvas.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const toCanvas = (v) => v / scale;
    const gap = 18;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const left = toCanvas(r.left - base.left);
    const top = toCanvas(r.top - base.top);
    const bottom = toCanvas(r.bottom - base.top);
    const width = toCanvas(r.width);

    let x = Math.min(Math.max(left + width / 2 - cw / 2, 24), W - cw - 24);
    let y = bottom + gap;
    let below = true;
    if (y + ch > H - 24) { y = top - gap - ch; below = false; }
    y = Math.max(24, y);
    card.style.transform = `translate(${x}px, ${y}px)`;
    card.dataset.side = below ? "below" : "above";
  }

  canvas.addEventListener("pointerover", (e) => {
    const target = targetOf(e.target);
    if (target && !pinned) {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(target), SHOW_DELAY);
    } else if (card.contains(e.target)) {
      clearTimeout(hideTimer);
    }
  });
  canvas.addEventListener("pointerout", (e) => {
    if (pinned) return;
    const leaving = targetOf(e.target) || (card.contains(e.target) ? card : null);
    const entering = e.relatedTarget && (targetOf(e.relatedTarget) || card.contains(e.relatedTarget));
    if (leaving && !entering) {
      clearTimeout(showTimer);
      hideTimer = setTimeout(hide, HIDE_DELAY);
    }
  });
  canvas.addEventListener("click", (e) => {
    const target = targetOf(e.target);
    if (target) {
      e.stopPropagation(); // don't advance the slide
      if (pinned && anchor === target) { hide(); return; }
      show(target);
      pinned = true;
    } else if (!card.contains(e.target) && anchor) {
      e.stopPropagation();
      hide();
    }
  }, true);
  canvas.addEventListener("focusin", (e) => {
    const target = targetOf(e.target);
    if (target) show(target);
  });
  canvas.addEventListener("focusout", (e) => {
    if (!pinned && targetOf(e.target)) hideTimer = setTimeout(hide, HIDE_DELAY);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
    else if ((e.key === "Enter" || e.key === " ") && targetOf(document.activeElement)) {
      e.preventDefault();
      e.stopPropagation();
      show(document.activeElement);
      pinned = true;
    }
  }, true);

  return { hide, isOpen: () => !card.hidden };
}
