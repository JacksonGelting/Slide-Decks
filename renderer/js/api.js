// Talks to the Python Bridge (app/bridge.py).
//
// In the app window, pywebview injects window.pywebview.api and the page URL
// carries ?host=pywebview. In --browser mode the same Bridge answers over the
// local server at /api/<method>. Both return the same data.

const inPywebview = new URLSearchParams(location.search).get("host") === "pywebview";

function pywebviewReady(timeoutMs = 5000) {
  if (window.pywebview && window.pywebview.api) return Promise.resolve(window.pywebview.api);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The app bridge did not start.")), timeoutMs);
    window.addEventListener("pywebviewready", () => {
      clearTimeout(timer);
      resolve(window.pywebview.api);
    }, { once: true });
  });
}

async function call(method) {
  if (inPywebview) {
    const api = await pywebviewReady();
    return api[method]();
  }
  const response = await fetch(`/api/${method}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Bridge call ${method} failed (${response.status}).`);
  return response.json();
}

export const getDeck = () => call("get_deck");
export const getSettings = () => call("get_settings");
