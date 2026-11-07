// The viewer: builds every slide once, scales the 1920x1080 canvas to the
// window, and handles navigation. Python never sends HTML; this file and the
// element modules draw everything from deck data.

import { LAYOUTS } from "./layouts.js";
import { renderElement } from "./elements/index.js";
import { createContext, renderInline } from "./richtext.js";
import { installHoverCards } from "./interactions.js";
import { notifySlide, onGoToSlide } from "./api.js";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export class DeckViewer {
  constructor({ stage, canvas, nav, devPanel, dev }) {
    Object.assign(this, { stage, canvas, nav, devPanel, dev });
    this.index = 0;
    this.slides = [];
    this.warnings = [];
    this.scale = 1;
  }

  mount(deck) {
    this.deck = deck;
    this.warnings = [];
    this.ctx = createContext(deck, (msg) => this.warn(msg));
    this.canvas.replaceChildren();
    this.slides = deck.slides.map((slide, i) => this.buildSlide(slide, i));
    this.canvas.append(...this.slides);
    this.cards = installHoverCards(this.canvas, this.ctx, () => this.scale);

    this.fit();
    window.addEventListener("resize", () => this.fit());
    this.go(this.initialIndex(), { instant: true });
    this.nav.hidden = false;
    document.title = `${deck.title} · Slide Decks`;
    if (this.dev) requestAnimationFrame(() => this.checkOverflow());
  }

  warn(msg) {
    const where = this._building ? `Slide ${this._building.index + 1} ("${this._building.id}"): ` : "";
    this.warnings.push(where + msg);
  }

  buildSlide(slide, index) {
    this._building = { index, id: slide.id };
    this.ctx.footnotes = { n: 0 };
    const layout = LAYOUTS[slide.layout] || LAYOUTS["title-body"];

    const section = document.createElement("section");
    section.className = `slide layout-${slide.layout} header-${layout.header}`;
    section.id = `slide-${slide.id}`;
    section.dataset.index = String(index);
    section.setAttribute("aria-roledescription", "slide");
    section.setAttribute("aria-label", `Slide ${index + 1} of ${this.deck.slides.length}`);

    if (slide.title || slide.subtitle) {
      const header = document.createElement("header");
      header.className = "slide-header";
      if (slide.title) {
        const h = document.createElement(index === 0 ? "h1" : "h2");
        h.className = "slide-title";
        h.append(renderInline(slide.title, this.ctx));
        header.append(h);
      }
      if (slide.subtitle) {
        const p = document.createElement("p");
        p.className = "slide-subtitle";
        p.append(renderInline(slide.subtitle, this.ctx));
        header.append(p);
      }
      section.append(header);
    }

    const slots = {};
    for (const name of layout.slots) {
      const slot = document.createElement("div");
      slot.className = `slot slot-${name}`;
      slot.dataset.slot = name;
      slots[name] = slot;
      section.append(slot);
    }
    for (const el of slide.elements || []) {
      const slot = slots[el.slot];
      if (!slot) { this.warn(`No "${el.slot}" slot in the ${slide.layout} layout.`); continue; }
      slot.append(renderElement(el, this.ctx));
    }
    for (const slot of Object.values(slots)) if (!slot.childElementCount) slot.classList.add("is-empty");

    const footer = document.createElement("footer");
    footer.className = "slide-footer";
    const deckTitle = document.createElement("span");
    deckTitle.append(renderInline(this.deck.title, this.ctx));
    const num = document.createElement("span");
    num.className = "slide-number";
    num.textContent = `${index + 1} / ${this.deck.slides.length}`;
    footer.append(deckTitle, num);
    section.append(footer);

    this._building = null;
    return section;
  }

  // ---------------------------------------------------------- navigation

  initialIndex() {
    const m = /slide=(\d+)/.exec(location.hash);
    return m ? Math.min(Math.max(Number(m[1]) - 1, 0), this.slides.length - 1) : 0;
  }

  go(target, { instant = false } = {}) {
    const next = Math.min(Math.max(target, 0), this.slides.length - 1);
    this.cards?.hide();
    this.slides.forEach((s, i) => {
      s.classList.toggle("is-current", i === next);
      s.classList.toggle("no-motion", instant);
      s.setAttribute("aria-hidden", i === next ? "false" : "true");
      s.inert = i !== next;
    });
    this.index = next;
    history.replaceState(null, "", `${location.pathname}${location.search}#slide=${next + 1}`);
    this.nav.querySelector("#nav-count").textContent = `${next + 1} / ${this.slides.length}`;
    notifySlide(next);
  }

  next() { this.go(this.index + 1); }
  prev() { this.go(this.index - 1); }

  bindInput() {
    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const keys = {
        ArrowRight: () => this.next(), ArrowDown: () => this.next(), PageDown: () => this.next(),
        " ": () => this.next(), ArrowLeft: () => this.prev(), ArrowUp: () => this.prev(),
        PageUp: () => this.prev(), Home: () => this.go(0), End: () => this.go(this.slides.length - 1),
      };
      const action = keys[e.key];
      if (action) { e.preventDefault(); action(); }
    });
    this.stage.addEventListener("click", (e) => {
      if (window.getSelection()?.toString()) return; // let people select text
      if (e.target.closest("a, button, input, .rt-term, .rt-footnote, .hovercard")) return;
      const rect = this.stage.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width * 0.25) this.prev(); else this.next();
    });
    let touchX = null;
    this.stage.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    this.stage.addEventListener("touchend", (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 60) (dx < 0 ? this.next() : this.prev());
      touchX = null;
    });
    onGoToSlide((i) => this.go(i));
    this.nav.querySelector("#nav-prev").addEventListener("click", () => this.prev());
    this.nav.querySelector("#nav-next").addEventListener("click", () => this.next());
  }

  // ------------------------------------------------------------- scaling

  fit() {
    const { clientWidth: w, clientHeight: h } = this.stage;
    this.scale = Math.min(w / CANVAS_W, h / CANVAS_H);
    const x = (w - CANVAS_W * this.scale) / 2;
    const y = (h - CANVAS_H * this.scale) / 2;
    this.canvas.style.transform = `translate(${x}px, ${y}px) scale(${this.scale})`;
  }

  // ---------------------------------------------------------- dev checks

  checkOverflow() {
    for (const [i, slide] of this.slides.entries()) {
      for (const slot of slide.querySelectorAll(".slot")) {
        if (slot.scrollHeight > slot.clientHeight + 2 || slot.scrollWidth > slot.clientWidth + 2) {
          slot.classList.add("is-overflowing");
          this.warnings.push(`Slide ${i + 1} ("${this.deck.slides[i].id}"): content overflows the `
            + `"${slot.dataset.slot}" slot. Shorten it, use size "small", or split the slide.`);
        }
      }
    }
    this.showDevPanel();
  }

  showDevPanel() {
    if (!this.dev) return;
    const panel = this.devPanel;
    panel.replaceChildren();
    const head = document.createElement("strong");
    head.textContent = this.warnings.length ? `${this.warnings.length} authoring warning(s)` : "No authoring warnings";
    panel.append(head);
    if (this.warnings.length) {
      const ul = document.createElement("ul");
      for (const w of this.warnings) {
        const li = document.createElement("li");
        li.textContent = w;
        ul.append(li);
      }
      panel.append(ul);
    }
    panel.classList.toggle("is-clean", !this.warnings.length);
    panel.hidden = false;
  }
}
