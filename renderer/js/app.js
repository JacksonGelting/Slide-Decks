// Boot: ask Python for the deck, then show either the viewer or a readable
// error screen. Press R to reload the deck from disk.

import { getDeck, getSettings } from "./api.js";
import { DeckViewer } from "./deck.js";

const $ = (id) => document.getElementById(id);

function showMessage({ title, intro, errors = [], path }) {
  const box = $("message");
  box.replaceChildren();
  const card = document.createElement("div");
  card.className = "message-card";

  const h = document.createElement("h1");
  h.textContent = title;
  card.append(h);
  if (intro) {
    const p = document.createElement("p");
    p.className = "message-intro";
    p.textContent = intro;
    card.append(p);
  }
  if (path) {
    const code = document.createElement("code");
    code.className = "message-path";
    code.textContent = path;
    card.append(code);
  }
  if (errors.length) {
    const ol = document.createElement("ol");
    ol.className = "message-errors";
    for (const err of errors) {
      const li = document.createElement("li");
      if (err.where) {
        const where = document.createElement("span");
        where.className = "message-where";
        where.textContent = err.where;
        li.append(where);
      }
      const msg = document.createElement("span");
      msg.className = "message-text";
      msg.textContent = err.message;
      li.append(msg);
      ol.append(li);
    }
    card.append(ol);
  }
  const hint = document.createElement("p");
  hint.className = "message-hint";
  hint.textContent = "Fix the deck file, then press R to reload. "
    + "To check decks without opening the app, run: python app/validate.py";
  card.append(hint);

  box.append(card);
  box.hidden = false;
  $("stage").hidden = true;
  $("nav").hidden = true;
  document.title = "Deck error · Slide Decks";
}

async function boot() {
  document.addEventListener("keydown", (e) => {
    if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey) location.reload();
  });

  let settings = { dev: false };
  let result;
  try {
    [settings, result] = await Promise.all([getSettings(), getDeck()]);
  } catch (err) {
    showMessage({ title: "The viewer couldn't reach the app", intro: String(err.message || err) });
    return;
  }
  if (settings.dev) document.documentElement.dataset.dev = "true";

  if (!result.ok) {
    const n = result.errors.length;
    showMessage({
      title: "This deck can't be opened",
      intro: `The deck file has ${n === 1 ? "a problem" : `${n} problems`}. Nothing was shown so you don't see a half-broken deck.`,
      errors: result.errors,
      path: result.deckPath,
    });
    return;
  }

  const viewer = new DeckViewer({
    stage: $("stage"), canvas: $("canvas"), nav: $("nav"), devPanel: $("dev-panel"), dev: settings.dev,
  });
  viewer.mount(result.deck, { assetBase: result.assetBase });
  viewer.bindInput();
  window.slideDecks = viewer; // handy in the dev tools console
}

boot();
