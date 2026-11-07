// Talks to Python.
//
// In the app (PySide6 window, URL has ?host=qt) this goes over QWebChannel to
// the Bridge object in app/bridge.py. In the developer browser preview
// (python app/main.py --browser) the same calls go to /api/<name> on the
// preview server, and slide-sync calls are no-ops.

const inQt = new URLSearchParams(location.search).get("host") === "qt";

let bridgePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

function qtBridge() {
  bridgePromise ??= loadScript("qwebchannel.js").then(() => new Promise((resolve, reject) => {
    if (!window.qt || !window.qt.webChannelTransport) {
      reject(new Error("The app bridge is not available."));
      return;
    }
    new window.QWebChannel(window.qt.webChannelTransport, (channel) => resolve(channel.objects.bridge));
  }));
  return bridgePromise;
}

async function call(method) {
  if (inQt) {
    const bridge = await qtBridge();
    const json = await new Promise((resolve) => bridge[method](resolve));
    return JSON.parse(json);
  }
  const response = await fetch(`/api/${method}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Bridge call ${method} failed (${response.status}).`);
  return response.json();
}

export const getDeck = () => call("getDeck");
export const getSettings = () => call("getSettings");

/** Tell Python which slide is showing (keeps the outline sidebar in sync). */
export function notifySlide(index) {
  if (inQt) qtBridge().then((b) => b.slideChanged(index)).catch(() => {});
}

/** Run fn(index) when Python asks for a slide (outline sidebar clicks). */
export function onGoToSlide(fn) {
  if (inQt) qtBridge().then((b) => b.goToSlide.connect(fn)).catch(() => {});
}
