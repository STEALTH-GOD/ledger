// Persistence bridge.
// In the packaged app, pywebview injects window.pywebview.api (get_data / set_data).
// In plain-browser dev (npm run dev), fall back to localStorage so the UI still works
// without running the Python backend.

const K = "ledge:v1";

function hasBridge() {
  return typeof window !== "undefined" && !!window.pywebview?.api;
}

export async function loadData() {
  if (hasBridge()) {
    return await window.pywebview.api.get_data();
  }
  try {
    return localStorage.getItem(K);
  } catch {
    return null;
  }
}

export async function saveData(json) {
  if (hasBridge()) {
    await window.pywebview.api.set_data(json);
  } else {
    try {
      localStorage.setItem(K, json);
    } catch {}
  }
}