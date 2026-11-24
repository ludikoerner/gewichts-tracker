import { state, persistStore, haptic } from "./state.js";

const SYNC_COOLDOWN_MS = 60 * 1000; // 60 Sekunden Cooldown für automatischen Sync
let onSyncCompleteCallback = null;
let onAuthExpiredCallback = null;

export function registerSyncHooks({ onSyncComplete, onAuthExpired }) {
  onSyncCompleteCallback = onSyncComplete;
  onAuthExpiredCallback = onAuthExpired;
}

function getApiUrl() {
  if (typeof API_URL !== "undefined" && API_URL) return API_URL;
  if (typeof window !== "undefined" && window.API_URL) return window.API_URL;
  return "";
}

export async function hashPassword(plain) {
  const data = new TextEncoder().encode("wt_salt_2026_" + plain);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function setSyncBadge(text, isOk = false) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.innerText = text;
  el.className = isOk ? "sync-badge sync-ok" : "sync-badge";
}

export async function callApi(payload) {
  const url = getApiUrl();
  if (!url || !url.startsWith("http")) {
    throw new Error("API_URL fehlt in config.js");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

export async function callAuthedApi(payload) {
  if (!state.authSession) throw new Error("Nicht angemeldet");
  payload.authUser = state.authSession.username;
  payload.authHash = state.authSession.hash;
  const res = await callApi(payload);
  state.lastSyncTime = Date.now();
  return res;
}

export async function syncAllFromCloud({ force = false } = {}) {
  if (!state.authSession || state.isSyncing) return;

  const age = Date.now() - state.lastSyncTime;
  if (!force && state.lastSyncTime > 0 && age < SYNC_COOLDOWN_MS) {
    return;
  }

  state.isSyncing = true;
  setSyncBadge("Sync...");
  try {
    const res = await callAuthedApi({ action: "fetchAll" });
    if (res.status === "ok") {
      state.appStore = res;
      state.lastSyncTime = Date.now();
      persistStore();
      setSyncBadge("✓ Cloud", true);
      if (onSyncCompleteCallback) {
        await onSyncCompleteCallback();
      }
    } else if (onAuthExpiredCallback) {
      onAuthExpiredCallback();
    }
  } catch (_) {
    setSyncBadge("Offline");
  } finally {
    state.isSyncing = false;
  }
}

export async function manualSync() {
  if (!state.authSession) return;
  haptic(12);
  await syncAllFromCloud({ force: true });
}
