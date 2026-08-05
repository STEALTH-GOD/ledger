// Persistence bridge.
//

const K = "ledge:v1";

// Resolves true  → pywebview API is available, use SQLite bridge
// Resolves false → browser dev mode, use localStorage
const _bridgeReady = new Promise((resolve) => {
  // Fast path: already injected (very rare, harmless to check)
  if (window.pywebview?.api) {
    resolve(true);
    return;
  }
  // Normal path: wait for the event pywebview fires when its JS bridge is ready
  window.addEventListener("pywebviewready", () => resolve(true), { once: true });

  // Timeout fallback: in `npm run dev` (no Python), pywebviewready never fires.
  // 800 ms is plenty for pywebview to boot; in browser it just means localStorage.
  setTimeout(() => resolve(!!window.pywebview?.api), 800);
});

async function getApi() {
  await _bridgeReady;
  return window.pywebview?.api ?? null;
}

export async function loadData() {
  const api = await getApi();
  if (api) return api.get_data();
  try { return localStorage.getItem(K); } catch { return null; }
}

export async function saveData(json) {
  const api = await getApi();
  if (api) {
    await api.set_data(json);
    return;
  }
  try { localStorage.setItem(K, json); } catch {}
}