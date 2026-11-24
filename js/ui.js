import {
  state,
  HOLD_TOLERANCE_KG,
  persistAuth,
  persistStore,
  isOwnProfile,
  isMaintenanceMode,
  getProfileData,
  getGoals,
  getEntries,
  getTeamMembers,
  todayISO,
  addDaysISO,
  formatDE,
  calcTargetAt,
  calculateStreak,
  calculateSubgroupStats,
  calculateProgressPct,
  calculate7DayComparison,
  haptic
} from "./state.js";
import {
  hashPassword,
  setSyncBadge,
  callApi,
  callAuthedApi,
  syncAllFromCloud
} from "./api.js";
import { renderWeightChart, renderTeamChart, destroyWeightChart } from "./charts.js";
import {
  getMilestoneDefinitions,
  renderTrophyShelf,
  checkAndUnlockMilestones
} from "./milestones.js";

// --- BOTTOM SHEET FÜR GEWICHTSEINGABE ---
export function openWeightSheet(prefillDate = null, prefillWeight = null) {
  if (!state.authSession) return;
  haptic(10);

  const dateInput = document.getElementById("entry-date");
  const weightInput = document.getElementById("entry-weight");

  if (prefillDate && prefillWeight !== null) {
    dateInput.value = prefillDate;
    weightInput.value = Number(prefillWeight).toFixed(1);
  } else {
    dateInput.value = todayISO();
    const entries = getEntries(state.authSession.username);
    weightInput.value = entries.length > 0 ? entries[entries.length - 1].weight.toFixed(1) : "";
  }

  document.getElementById("weight-sheet-backdrop").classList.remove("hidden");
}

export function closeWeightSheet() {
  document.getElementById("weight-sheet-backdrop").classList.add("hidden");
}

// --- AUTH ---
export function switchAuthMode(mode) {
  haptic(10);
  document.getElementById("auth-tab-login").classList.toggle("active", mode === "login");
  document.getElementById("auth-tab-register").classList.toggle("active", mode === "register");
  document.getElementById("auth-login-box").classList.toggle("hidden", mode !== "login");
  document.getElementById("auth-register-box").classList.toggle("hidden", mode !== "register");
}

export async function submitLogin() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  if (!username || !password) {
    alert("Bitte Profilname und Passwort eingeben.");
    return;
  }

  haptic(15);
  setSyncBadge("Prüfe...");
  try {
    const hash = await hashPassword(password);
    const res = await callApi({ action: "fetchAll", authUser: username, authHash: hash });
    if (res.status !== "ok") {
      setSyncBadge("Fehler");
      alert(res.message || "Anmeldung fehlgeschlagen.");
      return;
    }

    state.authSession = { username: res.me.username, hash };
    persistAuth();
    state.appStore = res;
    state.lastSyncTime = Date.now();
    persistStore();
    state.viewedProfile = state.authSession.username;
    state.activeMainTab = "verlauf";
    state.openedFromTeam = false;

    setSyncBadge("✓ Cloud", true);
    enterAuthenticatedApp();
    await checkAndUnlockMilestones();
  } catch (_) {
    setSyncBadge("Fehler");
    alert("Verbindungsfehler zum Server.");
  }
}

export async function submitRegister() {
  const rawName = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value;
  const shareTeam = document.getElementById("reg-share-team").checked;

  if (!rawName || password.length < 4) {
    alert("Bitte einen Namen und ein Passwort (mind. 4 Zeichen) eingeben.");
    return;
  }

  haptic(15);
  setSyncBadge("Erstelle...");
  try {
    const hash = await hashPassword(password);
    const regRes = await callApi({
      action: "register",
      username: rawName,
      passwordHash: hash,
      shareTeam
    });

    if (regRes.status !== "ok") {
      setSyncBadge("Fehler");
      alert(regRes.message || "Registrierung fehlgeschlagen.");
      return;
    }

    state.authSession = { username: regRes.username, hash };
    persistAuth();
    state.viewedProfile = state.authSession.username;
    state.activeMainTab = "verlauf";
    state.openedFromTeam = false;

    await syncAllFromCloud({ force: true });
    enterAuthenticatedApp();
  } catch (_) {
    setSyncBadge("Fehler");
    alert("Verbindungsfehler zum Server.");
  }
}

export function logout(skipConfirm = false) {
  if (!skipConfirm && !confirm("Wirklich abmelden?")) return;
  haptic(15);
  state.authSession = null;
  state.appStore = null;
  state.viewedProfile = null;
  state.openedFromTeam = false;
  state.lastSyncTime = 0;
  persistAuth();
  persistStore();
  showAuthScreen();
}

export function showAuthScreen() {
  closeWeightSheet();
  document.getElementById("auth-view").classList.remove("hidden");
  document.getElementById("privacy-view").classList.add("hidden");
  document.getElementById("bottom-nav").classList.add("hidden");
  document.getElementById("fab-weigh").classList.add("hidden");
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("trophies-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("logged-user-label").classList.add("hidden");
  document.getElementById("btn-privacy").classList.add("hidden");
  document.getElementById("btn-logout").classList.add("hidden");
  document.getElementById("btn-header-back").classList.add("hidden");
  document.getElementById("header-title").innerText = "Gewichts-Tracker";
  setSyncBadge("Nicht angemeldet");
}

// --- NAVIGATION ---
export function enterAuthenticatedApp() {
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("privacy-view").classList.add("hidden");
  document.getElementById("btn-privacy").classList.remove("hidden");
  document.getElementById("btn-logout").classList.remove("hidden");

  if (!state.viewedProfile) state.viewedProfile = state.authSession.username;
  refreshCurrentScreen();
}

export function updateHeaderState() {
  const own = isOwnProfile();
  const canAccessTeam = Boolean(state.appStore && state.appStore.me && state.appStore.me.shareTeam);
  const backBtn = document.getElementById("btn-header-back");
  const titleEl = document.getElementById("header-title");
  const subEl = document.getElementById("logged-user-label");

  if (own || state.activeMainTab === "team" || state.activeMainTab === "trophies") {
    backBtn.classList.add("hidden");
    const myStreak = calculateStreak(state.authSession.username);
    if (state.activeMainTab === "trophies") {
      titleEl.innerText = "Trophäen";
    } else if (state.activeMainTab === "team") {
      titleEl.innerText = "Team";
    } else {
      titleEl.innerText = "Gewichts-Tracker";
    }
    subEl.classList.remove("hidden");
    subEl.innerHTML =
      myStreak >= 5
        ? `${state.authSession.username} · <span class="streak-pill">🔥 ${myStreak} Tage</span>`
        : `Hallo, ${state.authSession.username}`;
  } else {
    backBtn.classList.remove("hidden");
    backBtn.innerText = state.openedFromTeam && canAccessTeam ? "← Team" : `← ${state.authSession.username}`;
    titleEl.innerText = state.viewedProfile;
    subEl.classList.remove("hidden");
    subEl.innerText = "Nur-Lese-Ansicht";
  }
}

export function refreshCurrentScreen() {
  if (!state.authSession || !state.appStore) return;

  const canAccessTeam = Boolean(state.appStore.me && state.appStore.me.shareTeam);
  const navEl = document.getElementById("bottom-nav");
  const teamNavBtn = document.getElementById("nav-team");

  navEl.classList.remove("hidden");
  navEl.classList.toggle("two-tabs", !canAccessTeam);
  teamNavBtn.classList.toggle("hidden", !canAccessTeam);

  if (state.activeMainTab === "team" && !canAccessTeam) {
    state.activeMainTab = "verlauf";
  }

  const viewingOther = !isOwnProfile() && state.activeMainTab === "verlauf";
  const teamActive = canAccessTeam && (state.activeMainTab === "team" || (viewingOther && state.openedFromTeam));
  const trophiesActive = state.activeMainTab === "trophies";
  const verlaufActive = !teamActive && !trophiesActive;

  document.getElementById("nav-verlauf").classList.toggle("active", verlaufActive);
  document.getElementById("nav-trophies").classList.toggle("active", trophiesActive);
  teamNavBtn.classList.toggle("active", teamActive);

  updateHeaderState();

  const needsSetup = isOwnProfile() && !getGoals(state.authSession.username) && state.activeMainTab === "verlauf";
  const fabEl = document.getElementById("fab-weigh");
  const showFab = !needsSetup && isOwnProfile() && (state.activeMainTab === "verlauf" || state.activeMainTab === "trophies");
  fabEl.classList.toggle("hidden", !showFab);

  if (needsSetup) {
    navEl.classList.add("hidden");
    openSetup();
    return;
  }

  if (state.activeMainTab === "team" && canAccessTeam) {
    showTeamView();
  } else if (state.activeMainTab === "trophies") {
    showTrophiesView();
  } else {
    state.activeMainTab = "verlauf";
    showProfileView(state.viewedProfile || state.authSession.username);
  }
}

export function switchMainTab(tab) {
  haptic(10);
  state.activeMainTab = tab;
  state.openedFromTeam = false;
  state.showAllHistory = false;
  if (tab === "verlauf" || tab === "trophies") {
    state.viewedProfile = state.authSession.username;
  }
  refreshCurrentScreen();
  syncAllFromCloud({ force: false });
}

export function backFromOtherProfile() {
  haptic(10);
  const canAccessTeam = Boolean(state.appStore && state.appStore.me && state.appStore.me.shareTeam);
  state.viewedProfile = state.authSession.username;
  state.activeMainTab = state.openedFromTeam && canAccessTeam ? "team" : "verlauf";
  state.openedFromTeam = false;
  state.showAllHistory = false;
  refreshCurrentScreen();
}

export function openOtherProfile(username) {
  haptic(10);
  state.viewedProfile = username;
  state.openedFromTeam = true;
  state.showAllHistory = false;
  state.activeMainTab = "verlauf";
  refreshCurrentScreen();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- PRIVATSPHÄRE ---
export function openPrivacySettings() {
  haptic(10);
  document.getElementById("privacy-view").classList.remove("hidden");
  document.getElementById("bottom-nav").classList.add("hidden");
  document.getElementById("fab-weigh").classList.add("hidden");
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("trophies-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");

  document.getElementById("priv-share-team").checked = Boolean(state.appStore.me.shareTeam);
  const others = (state.appStore.allUsernames || []).filter((u) => u !== state.authSession.username);
  const allowed = new Set(state.appStore.me.allowedViewers || []);

  const listEl = document.getElementById("priv-viewers-list");
  if (others.length === 0) {
    listEl.innerHTML = `<div class="sub">Noch keine weiteren Nutzer registriert.</div>`;
  } else {
    listEl.innerHTML = others
      .map(
        (u) => `
      <label class="checkbox-row">
        <input type="checkbox" class="priv-viewer-cb" value="${u}" ${allowed.has(u) ? "checked" : ""} />
        <span>${u}</span>
      </label>
    `
      )
      .join("");
  }
}

export function closePrivacySettings() {
  haptic(10);
  document.getElementById("privacy-view").classList.add("hidden");
  refreshCurrentScreen();
}

export async function savePrivacySettings() {
  haptic(15);
  const shareTeam = document.getElementById("priv-share-team").checked;
  const allowedViewers = Array.from(document.querySelectorAll(".priv-viewer-cb:checked")).map((cb) => cb.value);

  setSyncBadge("Speichere...");
  try {
    const res = await callAuthedApi({ action: "updateSettings", shareTeam, allowedViewers });
    if (res.status === "ok") {
      document.getElementById("privacy-view").classList.add("hidden");
      await syncAllFromCloud({ force: true });
    }
  } catch (_) {
    setSyncBadge("Fehler");
  }
}

// --- SETUP ---
export function setSetupMode(mode) {
  haptic(10);
  state.setupMode = mode;
  document.getElementById("mode-btn-goal").classList.toggle("active", mode === "goal");
  document.getElementById("mode-btn-hold").classList.toggle("active", mode === "hold");
  document.getElementById("setup-fields-goal").classList.toggle("hidden", mode !== "goal");
  document.getElementById("setup-fields-hold").classList.toggle("hidden", mode !== "hold");
}

export function openSetup() {
  if (!isOwnProfile()) return;
  haptic(10);
  document.getElementById("setup-view").classList.remove("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("trophies-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("fab-weigh").classList.add("hidden");
  document.getElementById("setup-heading").innerText = `Ziele festlegen (${state.authSession.username})`;

  const goals = getGoals(state.authSession.username);
  const entries = getEntries(state.authSession.username);
  const latestWeight = entries.length > 0 ? entries[entries.length - 1].weight : "";

  document.getElementById("btn-cancel-setup").classList.toggle("hidden", !goals);
  document.getElementById("setup-start-date").value = goals ? goals.startDate : todayISO();
  document.getElementById("setup-end-date").value = goals ? goals.endDate : "2026-12-31";
  document.getElementById("setup-start-weight").value = goals ? goals.startWeight : latestWeight;
  document.getElementById("setup-goal-weight").value = goals ? goals.goalWeight : "";
  document.getElementById("setup-hold-weight").value = goals ? goals.goalWeight : latestWeight;

  setSetupMode(isMaintenanceMode(goals) ? "hold" : "goal");
}

export function cancelSetup() {
  if (getGoals(state.authSession.username)) {
    haptic(10);
    refreshCurrentScreen();
  }
}

export async function saveSetup() {
  let goalsObj = null;

  if (state.setupMode === "hold") {
    const holdWeight = parseFloat(document.getElementById("setup-hold-weight").value.replace(",", "."));
    if (isNaN(holdWeight) || holdWeight <= 0) {
      alert("Bitte ein gültiges Haltegewicht eingeben!");
      return;
    }
    const today = todayISO();
    goalsObj = {
      startDate: today,
      endDate: addDaysISO(today, 365),
      startWeight: holdWeight,
      goalWeight: holdWeight
    };
  } else {
    const startDate = document.getElementById("setup-start-date").value;
    const endDate = document.getElementById("setup-end-date").value;
    const startWeight = parseFloat(document.getElementById("setup-start-weight").value.replace(",", "."));
    const goalWeight = parseFloat(document.getElementById("setup-goal-weight").value.replace(",", "."));

    if (!startDate || !endDate || isNaN(startWeight) || isNaN(goalWeight) || endDate <= startDate) {
      alert("Bitte prüfe Datum und Gewichtsangaben!");
      return;
    }
    if (Math.abs(startWeight - goalWeight) < 0.05) {
      alert("Wenn Start- und Zielgewicht gleich sind, wähle bitte oben 'Gewicht halten (±1 kg)'.");
      return;
    }
    goalsObj = { startDate, endDate, startWeight, goalWeight };
  }

  haptic(15);
  const myData = getProfileData(state.authSession.username);
  myData.goals = goalsObj;
  persistStore();

  setSyncBadge("Speichere...");
  await callAuthedApi({ action: "saveGoals", goals: goalsObj });

  if (state.setupMode === "goal" && !myData.entries.some((e) => e.date === goalsObj.startDate)) {
    const firstEntry = { date: goalsObj.startDate, weight: goalsObj.startWeight };
    myData.entries.push(firstEntry);
    persistStore();
    await callAuthedApi({ action: "saveEntry", entry: firstEntry });
  }

  setSyncBadge("✓ Cloud", true);
  refreshCurrentScreen();
}

export async function activateHoldModeNow() {
  if (!isOwnProfile()) return;
  const goals = getGoals(state.authSession.username);
  if (!goals) return;
  if (!confirm(`Möchtest du jetzt in den Halte-Modus wechseln (${goals.goalWeight.toFixed(1)} kg ± ${HOLD_TOLERANCE_KG.toFixed(1)} kg)?`)) return;

  haptic(15);
  const today = todayISO();
  const holdGoals = {
    startDate: today,
    endDate: addDaysISO(today, 365),
    startWeight: goals.goalWeight,
    goalWeight: goals.goalWeight
  };

  const myData = getProfileData(state.authSession.username);
  myData.goals = holdGoals;
  persistStore();

  refreshCurrentScreen();
  setSyncBadge("Speichere...");
  await callAuthedApi({ action: "saveGoals", goals: holdGoals });
  setSyncBadge("✓ Cloud", true);
}

// --- REITER 2: TROPHÄEN ---
export function showTrophiesView() {
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("trophies-view").classList.remove("hidden");

  renderTrophyShelf(state.authSession.username, "trophy-grid", "trophy-count");
}

// --- REITER 1: VERLAUF / PROFIL ---
export function toggleShowAllHistory() {
  haptic(10);
  state.showAllHistory = !state.showAllHistory;
  if (state.viewedProfile) {
    renderProfileData(state.viewedProfile);
  }
}

export function showProfileView(prof) {
  state.viewedProfile = prof;
  const own = isOwnProfile();

  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("trophies-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");

  document.getElementById("btn-edit-goals").classList.toggle("hidden", !own);
  document.getElementById("other-profile-trophies-card").classList.toggle("hidden", own);

  if (!own) {
    renderTrophyShelf(prof, "other-trophy-grid", "other-trophy-count");
  }

  document.getElementById("hist-heading").innerText = own ? "Letzte Messungen" : `Messungen (${prof})`;

  const sharedBox = document.getElementById("shared-private-box");
  if (own && state.appStore && state.appStore.profiles) {
    const otherVisible = Object.keys(state.appStore.profiles).filter((u) => u !== state.authSession.username);
    if (otherVisible.length > 0) {
      sharedBox.classList.remove("hidden");
      document.getElementById("shared-private-list").innerHTML = otherVisible
        .map((u) => `<button type="button" class="shared-pill-btn" onclick="openOtherProfile('${u}')">👁️ ${u}</button>`)
        .join("");
    } else {
      sharedBox.classList.add("hidden");
    }
  } else {
    sharedBox.classList.add("hidden");
  }

  renderProfileData(prof);
}

export function renderProfileData(prof) {
  const goals = getGoals(prof);
  const entries = getEntries(prof);
  const own = isOwnProfile();
  const holdMode = isMaintenanceMode(goals);

  if (goals) {
    document.getElementById("st-goal-label").innerText = holdMode ? "Haltegewicht" : "Zielgewicht";
    document.getElementById("st-goal").innerText = `${goals.goalWeight.toFixed(1)} kg`;
    document.getElementById("st-goal-date").innerText = holdMode
      ? `Korridor ± ${HOLD_TOLERANCE_KG.toFixed(1)} kg`
      : `bis ${formatDE(goals.endDate)}`;
  } else {
    document.getElementById("st-goal-label").innerText = "Zielgewicht";
    document.getElementById("st-goal").innerText = "Kein Ziel";
    document.getElementById("st-goal-date").innerText = "Noch nicht eingerichtet";
  }

  // Historie: letzte 4 offen, mit "Alle anzeigen"-Button
  const reversed = [...entries].reverse();
  const visibleEntries = state.showAllHistory ? reversed : reversed.slice(0, 4);
  document.getElementById("hist-total-count").innerText = entries.length > 0 ? `${entries.length} gesamt` : "";

  const histEl = document.getElementById("history-list");
  if (visibleEntries.length === 0) {
    histEl.innerHTML = `<div class="sub" style="padding:6px 0;">Noch keine Messungen eingetragen.</div>`;
  } else {
    histEl.innerHTML = visibleEntries
      .map(
        (e) => `
      <div class="hist-item">
        <div ${own ? `onclick="editEntry('${e.date}', ${e.weight})" style="cursor:pointer;"` : ""}>
          <strong>${formatDE(e.date)}</strong> &nbsp;·&nbsp; ${e.weight.toFixed(1)} kg
        </div>
        ${own ? `<button class="btn-danger" onclick="deleteEntry('${e.date}')">Löschen</button>` : ""}
      </div>
    `
      )
      .join("");
  }

  const toggleHistBtn = document.getElementById("btn-toggle-history");
  if (entries.length > 4) {
    toggleHistBtn.classList.remove("hidden");
    toggleHistBtn.innerText = state.showAllHistory ? "Weniger anzeigen" : `Alle anzeigen (${entries.length})`;
  } else {
    toggleHistBtn.classList.add("hidden");
  }

  if (!goals || entries.length === 0) {
    document.getElementById("st-diff").innerText = "–";
    document.getElementById("st-target").innerText = "Noch keine Messungen";
    document.getElementById("st-avg7").innerText = "–";
    document.getElementById("st-avg7-diff").innerText = "–";
    document.getElementById("st-rate").innerText = "–";
    document.getElementById("st-kcal").innerText = "–";
    document.getElementById("prog-pct").innerText = "0 % geschafft";
    document.getElementById("prog-rem").innerText = "noch -- kg";
    document.getElementById("prog-fill").style.width = "0%";
    document.getElementById("btn-switch-hold").classList.add("hidden");
    destroyWeightChart();
    return;
  }

  const latest = entries[entries.length - 1];
  const targetToday = calcTargetAt(latest.date, goals);
  const diff = latest.weight - targetToday;
  const isLossGoal = goals.goalWeight <= goals.startWeight;
  const onTrack = holdMode ? Math.abs(diff) <= HOLD_TOLERANCE_KG : isLossGoal ? diff <= 0 : diff >= 0;

  const tileStatus = document.getElementById("tile-status");
  tileStatus.className = `ov-cell ${onTrack ? "status-good" : "status-bad"}`;
  const sign = diff > 0 ? "+" : "";
  if (holdMode) {
    const corrStatus = onTrack ? `im Korridor (±${HOLD_TOLERANCE_KG} kg)` : "außerhalb Korridor";
    document.getElementById("st-diff").innerText = `${sign}${diff.toFixed(2)} kg`;
    document.getElementById("st-target").innerText = corrStatus;
  } else {
    const statusShort = onTrack ? (isLossGoal ? "unter Soll" : "im Plan") : isLossGoal ? "über Soll" : "unter Soll";
    document.getElementById("st-diff").innerText = `${sign}${diff.toFixed(2)} kg`;
    document.getElementById("st-target").innerText = `Soll: ${targetToday.toFixed(2)} kg (${statusShort})`;
  }

  const comp7 = calculate7DayComparison(prof);
  if (comp7.avgCurr !== null) {
    document.getElementById("st-avg7").innerText = `${comp7.avgCurr.toFixed(2)} kg`;
    if (comp7.avgPrev !== null) {
      const diff7 = comp7.avgCurr - comp7.avgPrev;
      const d7Sign = diff7 > 0 ? "+" : "";
      document.getElementById("st-avg7-diff").innerText = `${d7Sign}${diff7.toFixed(2)} kg vs. davor (${comp7.avgPrev.toFixed(1)})`;
    } else {
      document.getElementById("st-avg7-diff").innerText = `${comp7.countCurr} Messung(en) · keine Vorwoche`;
    }
  } else {
    document.getElementById("st-avg7").innerText = "–";
    document.getElementById("st-avg7-diff").innerText = "Keine Messung in 7 Tagen";
  }

  const trendValues = entries.map((_, i) => {
    const slice = entries.slice(Math.max(0, i - 6), i + 1);
    return slice.reduce((s, e) => s + e.weight, 0) / slice.length;
  });

  if (entries.length >= 2) {
    const winLen = Math.min(7, entries.length);
    const dRef = new Date(entries[entries.length - winLen].date);
    const dLast = new Date(latest.date);
    const daysDiff = (dLast - dRef) / 86400000;
    const gRef = trendValues[trendValues.length - winLen];
    const gLast = trendValues[trendValues.length - 1];

    if (daysDiff > 0) {
      const slopePerDay = (gLast - gRef) / daysDiff;
      const weekRate = slopePerDay * 7;
      const kcalPerDay = Math.round(slopePerDay * 7000);
      const kcalLabel =
        kcalPerDay < 0 ? `Ø ${Math.abs(kcalPerDay)} kcal Defizit/Tag` : `Ø +${kcalPerDay} kcal Überschuss/Tag`;

      document.getElementById("st-rate").innerText = `${weekRate >= 0 ? "+" : ""}${weekRate.toFixed(2)} kg / Wo`;
      document.getElementById("st-kcal").innerText = kcalLabel;
    }
  } else {
    document.getElementById("st-rate").innerText = "–";
    document.getElementById("st-kcal").innerText = "mind. 2 Messungen nötig";
  }

  const rawPct = calculateProgressPct(prof);
  const clampedPct = Math.max(0, Math.min(100, rawPct));
  const progFill = document.getElementById("prog-fill");
  const holdSwitchBtn = document.getElementById("btn-switch-hold");

  if (holdMode) {
    document.getElementById("prog-pct").innerText = onTrack ? "Halte-Modus aktiv" : "Außerhalb Toleranz";
    document.getElementById("prog-rem").innerText = `${(goals.goalWeight - HOLD_TOLERANCE_KG).toFixed(1)} – ${(goals.goalWeight + HOLD_TOLERANCE_KG).toFixed(1)} kg`;
    progFill.style.width = `${clampedPct}%`;
    progFill.className = `progress-fill ${onTrack ? "good" : "bad"}`;
    holdSwitchBtn.classList.add("hidden");
  } else {
    const remainingKg = Math.max(0, isLossGoal ? latest.weight - goals.goalWeight : goals.goalWeight - latest.weight);
    document.getElementById("prog-pct").innerText = `${Math.round(rawPct)} % geschafft`;
    document.getElementById("prog-rem").innerText = remainingKg === 0 ? "Ziel erreicht! 🎉" : `noch ${remainingKg.toFixed(1)} kg`;
    progFill.style.width = `${clampedPct}%`;
    progFill.className = `progress-fill ${onTrack ? "good" : "bad"}`;
    holdSwitchBtn.classList.toggle("hidden", !(own && remainingKg === 0));
  }

  renderWeightChart(prof);
}

// --- REITER 3: TEAM & UNTERGRUPPEN ---
export function setTeamSort(mode) {
  haptic(10);
  state.teamSortBy = mode;
  localStorage.setItem("wt_team_sort", mode);
  document.getElementById("sort-streak").classList.toggle("active", mode === "streak");
  document.getElementById("sort-progress").classList.toggle("active", mode === "progress");
  if (state.activeMainTab === "team") {
    showTeamView();
  }
}

export function toggleSubgroupCreator() {
  haptic(10);
  const box = document.getElementById("subgroup-creator");
  const isOpening = box.classList.contains("hidden");
  box.classList.toggle("hidden");

  if (isOpening) {
    const nameInput = document.getElementById("sg-name-input");
    nameInput.value = "";
    const others = getTeamMembers()
      .map((m) => m.username)
      .filter((u) => u !== state.authSession.username);
    const listEl = document.getElementById("sg-members-checklist");
    if (others.length === 0) {
      listEl.innerHTML = `<div class="sub">Keine weiteren Teammitglieder verfügbar.</div>`;
    } else {
      listEl.innerHTML = others
        .map(
          (u) => `
        <label class="checkbox-row">
          <input type="checkbox" class="sg-member-cb" value="${u}" />
          <span>${u}</span>
        </label>
      `
        )
        .join("");
    }
    setTimeout(() => nameInput.focus(), 50);
  }
}

export async function createSubgroup() {
  const name = document.getElementById("sg-name-input").value.trim();
  const selected = Array.from(document.querySelectorAll(".sg-member-cb:checked")).map((cb) => cb.value);

  if (!name) {
    alert("Bitte einen Namen für die Untergruppe eingeben.");
    return;
  }
  if (selected.length === 0) {
    alert("Bitte wähle mindestens ein weiteres Teammitglied aus.");
    return;
  }

  haptic(15);
  setSyncBadge("Erstelle...");
  try {
    const res = await callAuthedApi({
      action: "createSubgroup",
      name,
      members: [state.authSession.username, ...selected]
    });
    if (res.status === "ok") {
      document.getElementById("subgroup-creator").classList.add("hidden");
      await syncAllFromCloud({ force: true });
    } else {
      alert(res.message || "Fehler beim Erstellen.");
    }
  } catch (_) {
    setSyncBadge("Fehler");
  }
}

export async function deleteSubgroup(id, name) {
  if (!confirm(`Untergruppe "${name}" wirklich auflösen?`)) return;
  haptic([20, 30, 20]);
  setSyncBadge("Lösche...");
  try {
    const res = await callAuthedApi({ action: "deleteSubgroup", id });
    if (res.status === "ok") {
      await syncAllFromCloud({ force: true });
    }
  } catch (_) {
    setSyncBadge("Fehler");
  }
}

function renderSubgroupsList() {
  const listEl = document.getElementById("subgroups-list");
  const subgroups = state.appStore && Array.isArray(state.appStore.subgroups) ? state.appStore.subgroups : [];

  if (subgroups.length === 0) {
    listEl.innerHTML = `<div class="sub" style="padding:4px 0;">Noch keine Untergruppe angelegt. Tippe auf <strong>+ Neu</strong>, um eine gemeinsame strenge Streak zu starten.</div>`;
    return;
  }

  listEl.innerHTML = subgroups
    .map((sg) => {
      const stats = calculateSubgroupStats(sg.members);
      const safeName = sg.name.replace(/'/g, "");
      return `
      <div class="subgroup-item">
        <div>
          <div class="sg-title">${sg.name}</div>
          <div class="sg-members">${sg.members.join(" · ")}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="sg-streak-pill">🤝 ${stats.current} ${stats.current === 1 ? "Tag" : "Tage"}</span>
          <button type="button" class="btn-ghost" style="text-decoration:none; font-size:0.9rem;" onclick="deleteSubgroup('${sg.id}', '${safeName}')" title="Untergruppe löschen">✕</button>
        </div>
      </div>
    `;
    })
    .join("");
}

export function showTeamView() {
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("trophies-view").classList.add("hidden");
  document.getElementById("team-view").classList.remove("hidden");

  document.getElementById("sort-streak").classList.toggle("active", state.teamSortBy === "streak");
  document.getElementById("sort-progress").classList.toggle("active", state.teamSortBy === "progress");
  document.getElementById("team-zoom-all").classList.toggle("active", state.teamChartZoom === "all");
  document.getElementById("team-zoom-30").classList.toggle("active", state.teamChartZoom === "30");

  renderSubgroupsList();

  const members = getTeamMembers();
  const today = todayISO();

  let sumPct = 0;
  let activeGoalsCount = 0;

  const enrichedMembers = members
    .map((m) => {
      const prof = m.username;
      const streak = calculateStreak(prof);
      const rawPct = calculateProgressPct(prof);
      const clampedPct = Math.max(0, Math.min(100, rawPct));
      if (m.goals) {
        sumPct += clampedPct;
        activeGoalsCount++;
      }
      return { member: m, prof, streak, rawPct, clampedPct };
    })
    .sort((a, b) => {
      if (state.teamSortBy === "progress") {
        return b.rawPct - a.rawPct || b.streak - a.streak;
      }
      return b.streak - a.streak || b.rawPct - a.rawPct;
    });

  const totalDefs = getMilestoneDefinitions(state.authSession.username).length;
  const medals = ["🥇", "🥈", "🥉"];

  const cardsHtml = enrichedMembers
    .map((item, idx) => {
      const { member: m, prof, streak, rawPct, clampedPct } = item;
      const goals = m.goals;
      const entries = m.entries || [];
      const rankIcon = medals[idx] || `${idx + 1}.`;
      const holdMode = isMaintenanceMode(goals);

      const weighedToday = entries.some((e) => e.date === today);
      const comp = calculate7DayComparison(prof);
      const avg7Str = comp.avgCurr !== null ? `${comp.avgCurr.toFixed(1)} kg` : "–";

      let delta7Str = "";
      if (comp.avgCurr !== null && comp.avgPrev !== null) {
        const d7 = comp.avgCurr - comp.avgPrev;
        delta7Str = ` (${d7 > 0 ? "+" : ""}${d7.toFixed(2)} kg vs. davor)`;
      }

      const isLossGoal = goals ? goals.goalWeight <= goals.startWeight : true;
      const latest = entries.length > 0 ? entries[entries.length - 1] : null;
      const remKg =
        !holdMode && goals && latest
          ? Math.max(0, isLossGoal ? latest.weight - goals.goalWeight : goals.goalWeight - latest.weight)
          : null;

      const unlockedCount = (m.rewards || []).length;

      let leftProgressLabel = "Noch kein Ziel";
      let rightProgressLabel = "";
      if (goals) {
        if (holdMode) {
          leftProgressLabel = `Halte-Modus (${goals.goalWeight.toFixed(1)} kg)`;
          rightProgressLabel = `± ${HOLD_TOLERANCE_KG.toFixed(1)} kg`;
        } else {
          leftProgressLabel = `${Math.round(rawPct)} % geschafft`;
          rightProgressLabel = remKg !== null ? (remKg === 0 ? "Ziel erreicht! 🎉" : `noch ${remKg.toFixed(1)} kg`) : "";
        }
      }

      return `
      <div class="card partner-card" onclick="openOtherProfile('${prof}')">
        <div class="partner-header">
          <div class="partner-name">
            <span class="rank-badge">${rankIcon}</span>
            <span>${prof}</span>
            <span class="streak-pill">🔥 ${streak}</span>
          </div>
          <span class="today-badge ${weighedToday ? "today-done" : "today-open"}">
            ${weighedToday ? "✅ Heute gewogen" : "⏳ Heute offen"}
          </span>
        </div>

        <div class="progress-labels">
          <span>${leftProgressLabel}</span>
          <span>${rightProgressLabel}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${clampedPct}%;"></div>
        </div>

        <div class="partner-stats">
          <span>Ø 7 Tage: <strong>${avg7Str}</strong>${delta7Str}</span>
          <span>🏆 ${unlockedCount} / ${totalDefs}</span>
        </div>
      </div>
    `;
    })
    .join("");

  const teamPct = activeGoalsCount > 0 ? sumPct / activeGoalsCount : 0;
  document.getElementById("team-total-pct").innerText = `${Math.round(teamPct)} %`;
  document.getElementById("team-member-count").innerText = `${members.length} ${members.length === 1 ? "Teammitglied" : "Teammitglieder"}`;
  document.getElementById("team-total-fill").style.width = `${Math.max(0, Math.min(100, teamPct))}%`;
  document.getElementById("team-cards-container").innerHTML = cardsHtml;

  renderTeamChart();
}

// --- EINTRÄGE SPEICHERN / LÖSCHEN / BEARBEITEN ---
export function stepWeight(delta) {
  haptic(8);
  const input = document.getElementById("entry-weight");
  let current = parseFloat(input.value.replace(",", "."));
  if (isNaN(current)) {
    const entries = getEntries(state.authSession.username);
    current = entries.length > 0 ? entries[entries.length - 1].weight : 80.0;
  }
  const next = Math.round((current + delta) * 10) / 10;
  input.value = next.toFixed(1);
}

export async function addEntry() {
  if (!state.authSession) return;
  const date = document.getElementById("entry-date").value;
  const weightInput = document.getElementById("entry-weight");
  const weight = parseFloat(weightInput.value.replace(",", "."));
  if (!date || isNaN(weight)) {
    alert("Bitte gültiges Datum und Gewicht eingeben.");
    return;
  }

  haptic(15);
  weightInput.blur();
  closeWeightSheet();

  const entryObj = { date, weight };
  const myData = getProfileData(state.authSession.username);
  myData.entries = myData.entries.filter((e) => e.date !== date);
  myData.entries.push(entryObj);
  persistStore();

  state.viewedProfile = state.authSession.username;
  if (state.activeMainTab !== "trophies") {
    state.activeMainTab = "verlauf";
  }
  refreshCurrentScreen();

  setSyncBadge("Speichere...");
  await callAuthedApi({ action: "saveEntry", entry: entryObj });
  setSyncBadge("✓ Cloud", true);
  await checkAndUnlockMilestones();
}

export async function deleteEntry(date) {
  if (!isOwnProfile()) return;
  if (!confirm(`Messung vom ${formatDE(date)} löschen?`)) return;
  haptic([20, 30, 20]);
  const myData = getProfileData(state.authSession.username);
  myData.entries = myData.entries.filter((e) => e.date !== date);
  persistStore();

  refreshCurrentScreen();
  setSyncBadge("Lösche...");
  await callAuthedApi({ action: "deleteEntry", date });
  setSyncBadge("✓ Cloud", true);
}

export function editEntry(date, weight) {
  if (!isOwnProfile()) return;
  openWeightSheet(date, weight);
}
