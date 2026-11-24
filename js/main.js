import { state, todayISO } from "./state.js";
import { registerSyncHooks, syncAllFromCloud, manualSync } from "./api.js";
import { setZoom, setTeamZoom, renderWeightChart, renderTeamChart } from "./charts.js";
import { previewReward, closeRewardModal, checkAndUnlockMilestones } from "./milestones.js";
import {
  switchAuthMode,
  submitLogin,
  submitRegister,
  logout,
  showAuthScreen,
  enterAuthenticatedApp,
  refreshCurrentScreen,
  switchMainTab,
  backFromOtherProfile,
  openOtherProfile,
  openPrivacySettings,
  closePrivacySettings,
  savePrivacySettings,
  setSetupMode,
  openSetup,
  cancelSetup,
  saveSetup,
  activateHoldModeNow,
  setTeamSort,
  toggleSubgroupCreator,
  createSubgroup,
  deleteSubgroup,
  stepWeight,
  addEntry,
  deleteEntry,
  editEntry
} from "./ui.js";

// Alle HTML-Event-Handler global verfügbar machen
Object.assign(window, {
  backFromOtherProfile,
  manualSync,
  openPrivacySettings,
  logout,
  switchAuthMode,
  submitLogin,
  submitRegister,
  closePrivacySettings,
  savePrivacySettings,
  switchMainTab,
  cancelSetup,
  setSetupMode,
  saveSetup,
  stepWeight,
  addEntry,
  openSetup,
  activateHoldModeNow,
  setZoom,
  toggleSubgroupCreator,
  createSubgroup,
  setTeamZoom,
  setTeamSort,
  closeRewardModal,
  openOtherProfile,
  editEntry,
  deleteEntry,
  deleteSubgroup,
  previewReward
});

// Sync-Callbacks verknüpfen
registerSyncHooks({
  onSyncComplete: async () => {
    refreshCurrentScreen();
    await checkAndUnlockMilestones();
  },
  onAuthExpired: () => {
    logout(true);
  }
});

// Tastatur-Komfort (Enter zum Absenden / Weitergehen, Escape zum Schließen)
function bindKeyboardShortcuts() {
  const onEnter = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        fn();
      }
    });
  };

  onEnter("login-username", () => document.getElementById("login-password")?.focus());
  onEnter("login-password", submitLogin);

  onEnter("reg-username", () => document.getElementById("reg-password")?.focus());
  onEnter("reg-password", submitRegister);

  onEnter("entry-weight", addEntry);
  onEnter("entry-date", addEntry);

  onEnter("setup-hold-weight", saveSetup);
  onEnter("setup-goal-weight", saveSetup);
  onEnter("sg-name-input", createSubgroup);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = document.getElementById("reward-modal");
    if (modal && !modal.classList.contains("hidden")) {
      closeRewardModal();
      return;
    }
    const privacy = document.getElementById("privacy-view");
    if (privacy && !privacy.classList.contains("hidden")) {
      closePrivacySettings();
      return;
    }
    const sgCreator = document.getElementById("subgroup-creator");
    if (sgCreator && !sgCreator.classList.contains("hidden")) {
      toggleSubgroupCreator();
    }
  });
}

// Service Worker für Offline-Caching & Sofortstart registrieren
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.authSession) {
    const dateInput = document.getElementById("entry-date");
    if (dateInput) dateInput.value = todayISO();
    syncAllFromCloud({ force: false });
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!state.authSession) return;
  if (state.activeMainTab === "team") renderTeamChart();
  else if (state.viewedProfile) renderWeightChart(state.viewedProfile);
});

async function init() {
  registerServiceWorker();
  bindKeyboardShortcuts();

  document.getElementById("zoom-all").classList.toggle("active", state.chartZoom === "all");
  document.getElementById("zoom-30").classList.toggle("active", state.chartZoom === "30");
  document.getElementById("team-zoom-all").classList.toggle("active", state.teamChartZoom === "all");
  document.getElementById("team-zoom-30").classList.toggle("active", state.teamChartZoom === "30");

  if (state.authSession && state.appStore) {
    state.viewedProfile = state.authSession.username;
    enterAuthenticatedApp();
    await syncAllFromCloud({ force: true });
  } else {
    showAuthScreen();
  }
}

init();
