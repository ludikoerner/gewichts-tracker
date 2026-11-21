// --- PWA MANIFEST ---
(function setupPWA() {
  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="110" fill="#2563eb"/>
    <path d="M110 340 L200 240 L280 285 L402 155" fill="none" stroke="#ffffff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="402" cy="155" r="26" fill="#4ade80"/>
  </svg>`;
  const iconUrl = "data:image/svg+xml;base64," + btoa(svgIcon);
  const manifest = {
    name: "Gewichts-Tracker",
    short_name: "Gewicht",
    start_url: window.location.href,
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#2563eb",
    icons: [{ src: iconUrl, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }]
  };
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
  document.head.appendChild(link);
})();

// --- STATE ---
let authSession = JSON.parse(localStorage.getItem("wt_auth_session") || "null"); // { username, hash }
let appStore = JSON.parse(localStorage.getItem("wt_app_store") || "null"); // { me, allUsernames, profiles, subgroups }
let activeMainTab = "mine"; // "mine" | "team"
let viewedProfile = null;   // Derzeit betrachtetes Profil (eigenes oder fremdes)
let openedFromTeam = false; // Steuert, ob das fremde Profil im Team-Modus geöffnet ist
let chartZoom = localStorage.getItem("wt_chart_zoom") || "all";
let teamSortBy = localStorage.getItem("wt_team_sort") || "streak"; // "streak" | "progress"
let chartInstance = null;
let teamChartInstance = null;
let rewardQueue = [];

function isOwnProfile() {
  return authSession && viewedProfile === authSession.username;
}

// --- SHA-256 PASSWORT HASHING ---
async function hashPassword(plain) {
  const data = new TextEncoder().encode("wt_salt_2026_" + plain);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function setSyncBadge(text, isOk = false) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.innerText = text;
  el.className = isOk ? "sync-badge sync-ok" : "sync-badge";
}

// --- PERSÖNLICHE MEILENSTEIN-DEFINITIONEN ---
function getMilestoneDefinitions(prof) {
  const isHannah = prof === "Hannah";
  return [
    {
      id: "streak_5", type: "streak", threshold: 5, shelfIcon: "🔥", shelfLabel: "5 Tage",
      tag: "5-TAGE-STREAK", modalIcon: "🔥", title: "5 Tage in Folge!",
      text: `Stark gestartet, ${prof}! Die erste Hürde ist genommen – Routine schlägt Motivation.`
    },
    {
      id: "streak_10", type: "streak", threshold: 10, shelfIcon: "⚡", shelfLabel: "10 Tage",
      tag: "10-TAGE-STREAK", modalIcon: "⚡", title: "10 Tage Streak!",
      text: "Zweistellig! Zehn Tage lückenlos drangeblieben. Das wird langsam zur Gewohnheit."
    },
    {
      id: "streak_25", type: "streak", threshold: 25, shelfIcon: "🥉", shelfLabel: "25 Tage",
      tag: "25-TAGE-STREAK", modalIcon: "🏅", title: "25 Tage am Stück!",
      text: `Ein Vierteljahrhundert! Deine Konstanz ist beeindruckend, ${prof}.`
    },
    {
      id: "streak_50", type: "streak", threshold: 50, shelfIcon: "🥈", shelfLabel: "50 Tage",
      tag: "50-TAGE-STREAK", modalIcon: "🚀", title: "50 Tage Streak!",
      text: "50 Tage ohne Ausnahme – absolute Maschinen-Mentalität!"
    },
    {
      id: "streak_100", type: "streak", threshold: 100, shelfIcon: "👑", shelfLabel: "100 Tage",
      tag: "100-TAGE-STREAK", modalIcon: "👑", title: "100 Tage Legende!",
      text: "Dreistellig! 100 Tage durchgezogen – das macht dir so schnell keiner nach."
    },
    {
      id: "pct_10", type: "pct", threshold: 10, shelfIcon: "🌱", shelfLabel: "10 %",
      tag: "10 % ZIEL ERREICHT", modalIcon: isHannah ? "😘" : "🌱",
      title: isHannah ? "Aller Anfang ist schwer 😘" : "10 % geschafft!",
      text: isHannah ? "Hier ein Bussi damit du dran bleibst 😘" : `Der Anfang ist gemacht, ${prof}! Die ersten 10 % liegen hinter dir.`
    },
    {
      id: "pct_25", type: "pct", threshold: 25, shelfIcon: isHannah ? "😘" : "🎯", shelfLabel: "25 %",
      tag: "25 % ZIEL ERREICHT", modalIcon: isHannah ? "😘😘" : "🎯",
      title: isHannah ? "Jetzt geht es richtig los 😘😘" : "Viertel-Meile: 25 %!",
      text: isHannah ? "Bleib dran Schatzimausibussibärli 😘😘" : "Ein Viertel des Weges ist geschafft – dein Kurs stimmt!"
    },
    {
      id: "pct_50", type: "pct", threshold: 50, shelfIcon: isHannah ? "❤️" : "🏔️", shelfLabel: "50 %",
      tag: "50 % ZIEL ERREICHT", modalIcon: isHannah ? "❤️" : "🏔️",
      title: isHannah ? "Zur Hälfte hast du es geschafft ❤️" : "Bergfest: 50 %!",
      text: isHannah ? "Ich glaub an dich ❤️" : `Halbzeit, ${prof}! Ab jetzt geht es auf der Zielgeraden bergab (im besten Sinne).`
    },
    {
      id: "pct_100", type: "pct", threshold: 100, shelfIcon: "🏆", shelfLabel: "100 %",
      tag: "100 % ZIEL ERREICHT", modalIcon: isHannah ? "❤️❤️❤️" : "🏆",
      title: isHannah ? "Du hast es geschafft ❤️❤️❤️" : "ZIEL ERREICHT: 100 %!",
      text: isHannah ? "Ich bin soooo stolz auf dich ❤️❤️❤️" : `Wahnsinn, ${prof}! Du hast dein Zielgewicht geknackt. Zeit zum Feiern!`
    },
    {
      id: "group_streak_5", type: "group_streak", threshold: 5, shelfIcon: "🤝", shelfLabel: "Team 5d",
      tag: "GRUPPEN-STREAK · 5 TAGE", modalIcon: "🤝", title: "5 Tage Team-Power!",
      text: `Stark, ${prof}! Du hast mit einer Gruppe 5 Tage in Folge gemeinsam durchgezogen.`
    },
    {
      id: "group_streak_10", type: "group_streak", threshold: 10, shelfIcon: "💪", shelfLabel: "Team 10d",
      tag: "GRUPPEN-STREAK · 10 TAGE", modalIcon: "🤜🤛", title: "10 Tage im Gleichschritt!",
      text: `Zweistellig im Team! Du hast mit einer Gruppe 10 Tage lückenlos gemeinsam gewogen.`
    },
    {
      id: "group_streak_25", type: "group_streak", threshold: 25, shelfIcon: "🛡️", shelfLabel: "Team 25d",
      tag: "GRUPPEN-STREAK · 25 TAGE", modalIcon: "🛡️", title: "25 Tage Team-Bund!",
      text: `Echter Zusammenhalt, ${prof}! 25 Tage am Stück hat niemand aus eurer Gruppe einen Tag ausgelassen.`
    },
    {
      id: "group_streak_50", type: "group_streak", threshold: 50, shelfIcon: "⚔️", shelfLabel: "Team 50d",
      tag: "GRUPPEN-STREAK · 50 TAGE", modalIcon: "⚔️", title: "50 Tage unzertrennlich!",
      text: `50 Tage gemeinsame Disziplin – auf dich und deine Gruppe ist absolut Verlass!`
    },
    {
      id: "group_streak_100", type: "group_streak", threshold: 100, shelfIcon: "🌟", shelfLabel: "Team 100d",
      tag: "GRUPPEN-STREAK · 100 TAGE", modalIcon: "🌟", title: "100 Tage Dream-Team!",
      text: `Legendär, ${prof}! 100 Tage in Folge gemeinsam am Start – das ist Teamgeist auf höchstem Niveau.`
    }
  ];
}

// --- API KOMMUNIKATION ---
async function callApi(payload) {
  if (typeof API_URL === "undefined" || !API_URL.startsWith("http")) {
    throw new Error("API_URL fehlt in config.js");
  }
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function callAuthedApi(payload) {
  if (!authSession) throw new Error("Nicht angemeldet");
  payload.authUser = authSession.username;
  payload.authHash = authSession.hash;
  return await callApi(payload);
}

// --- AUTH LOGIK ---
function switchAuthMode(mode) {
  document.getElementById("auth-tab-login").classList.toggle("active", mode === "login");
  document.getElementById("auth-tab-register").classList.toggle("active", mode === "register");
  document.getElementById("auth-login-box").classList.toggle("hidden", mode !== "login");
  document.getElementById("auth-register-box").classList.toggle("hidden", mode !== "register");
}

async function submitLogin() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  if (!username || !password) {
    alert("Bitte Profilname und Passwort eingeben.");
    return;
  }

  setSyncBadge("Prüfe...");
  try {
    const hash = await hashPassword(password);
    const res = await callApi({ action: "fetchAll", authUser: username, authHash: hash });
    if (res.status !== "ok") {
      setSyncBadge("Fehler");
      alert(res.message || "Anmeldung fehlgeschlagen.");
      return;
    }

    authSession = { username: res.me.username, hash };
    localStorage.setItem("wt_auth_session", JSON.stringify(authSession));
    appStore = res;
    localStorage.setItem("wt_app_store", JSON.stringify(appStore));
    viewedProfile = authSession.username;
    activeMainTab = "mine";
    openedFromTeam = false;

    setSyncBadge("✓ Cloud", true);
    enterAuthenticatedApp();
    await checkAndUnlockMilestones();
  } catch (err) {
    setSyncBadge("Fehler");
    alert("Verbindungsfehler zum Server.");
  }
}

async function submitRegister() {
  const rawName = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value;
  const shareTeam = document.getElementById("reg-share-team").checked;

  if (!rawName || password.length < 4) {
    alert("Bitte einen Namen und ein Passwort (mind. 4 Zeichen) eingeben.");
    return;
  }

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

    authSession = { username: regRes.username, hash };
    localStorage.setItem("wt_auth_session", JSON.stringify(authSession));
    viewedProfile = authSession.username;
    activeMainTab = "mine";
    openedFromTeam = false;

    await syncAllFromCloud();
    enterAuthenticatedApp();
  } catch (err) {
    setSyncBadge("Fehler");
    alert("Verbindungsfehler zum Server.");
  }
}

function logout() {
  if (!confirm("Wirklich abmelden?")) return;
  localStorage.removeItem("wt_auth_session");
  localStorage.removeItem("wt_app_store");
  authSession = null;
  appStore = null;
  viewedProfile = null;
  openedFromTeam = false;
  showAuthScreen();
}

function showAuthScreen() {
  document.getElementById("auth-view").classList.remove("hidden");
  document.getElementById("privacy-view").classList.add("hidden");
  document.getElementById("main-nav").classList.add("hidden");
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("logged-user-label").classList.add("hidden");
  document.getElementById("btn-privacy").classList.add("hidden");
  document.getElementById("btn-logout").classList.add("hidden");
  document.getElementById("btn-header-back").classList.add("hidden");
  document.getElementById("header-title").innerText = "Gewichts-Tracker";
  setSyncBadge("Nicht angemeldet");
}

// --- CLOUD SYNC ---
async function syncAllFromCloud() {
  if (!authSession) return;
  setSyncBadge("Sync...");
  try {
    const res = await callAuthedApi({ action: "fetchAll" });
    if (res.status === "ok") {
      appStore = res;
      localStorage.setItem("wt_app_store", JSON.stringify(appStore));
      setSyncBadge("✓ Cloud", true);
      refreshCurrentScreen();
      await checkAndUnlockMilestones();
    } else {
      logout();
    }
  } catch (err) {
    setSyncBadge("Offline");
  }
}

// --- DATEN-ZUGRIFF AUS STORE ---
function getProfileData(prof = viewedProfile) {
  if (!appStore || !appStore.profiles || !appStore.profiles[prof]) {
    return { username: prof, shareTeam: false, goals: null, entries: [], rewards: [] };
  }
  const p = appStore.profiles[prof];
  p.entries = (p.entries || []).sort((a, b) => a.date.localeCompare(b.date));
  return p;
}

function getGoals(prof = viewedProfile) { return getProfileData(prof).goals; }
function getEntries(prof = viewedProfile) { return getProfileData(prof).entries; }
function getUnlockedRewards(prof = viewedProfile) { return getProfileData(prof).rewards || []; }

// --- BERECHNUNGEN ---
function calculateStreak(prof) {
  const entries = getEntries(prof);
  if (entries.length === 0) return 0;

  const dateSet = new Set(entries.map(e => e.date));
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);

  let checkDate = null;
  if (dateSet.has(today)) checkDate = today;
  else if (dateSet.has(yesterday)) checkDate = yesterday;
  else return 0;

  let streak = 0;
  while (dateSet.has(checkDate)) {
    streak++;
    checkDate = addDaysISO(checkDate, -1);
  }
  return streak;
}

function calculateSubgroupStats(memberNames) {
  if (!Array.isArray(memberNames) || memberNames.length === 0) {
    return { current: 0, best: 0 };
  }

  const dateSets = memberNames.map(name => new Set(getEntries(name).map(e => e.date)));
  if (dateSets.some(s => s.size === 0)) {
    return { current: 0, best: 0 };
  }

  let commonDates = new Set(dateSets[0]);
  for (let i = 1; i < dateSets.length; i++) {
    commonDates = new Set([...commonDates].filter(d => dateSets[i].has(d)));
  }

  if (commonDates.size === 0) return { current: 0, best: 0 };

  const sortedDates = Array.from(commonDates).sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    if (addDaysISO(sortedDates[i - 1], 1) === sortedDates[i]) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  let checkDate = null;
  if (commonDates.has(today)) checkDate = today;
  else if (commonDates.has(yesterday)) checkDate = yesterday;

  let current = 0;
  if (checkDate) {
    while (commonDates.has(checkDate)) {
      current++;
      checkDate = addDaysISO(checkDate, -1);
    }
  }

  return { current, best: Math.max(best, current) };
}

function getMaxUserGroupStreak(prof) {
  if (!appStore || !Array.isArray(appStore.subgroups)) return 0;
  let maxBest = 0;
  for (const sg of appStore.subgroups) {
    if (Array.isArray(sg.members) && sg.members.includes(prof)) {
      const stats = calculateSubgroupStats(sg.members);
      if (stats.best > maxBest) maxBest = stats.best;
    }
  }
  return maxBest;
}

function calculateProgressPctForWeight(weight, goals) {
  if (!goals) return 0;
  const isLossGoal = goals.goalWeight <= goals.startWeight;
  const totalDelta = Math.abs(goals.startWeight - goals.goalWeight);
  if (totalDelta <= 0) return 0;
  const achievedDelta = isLossGoal ? (goals.startWeight - weight) : (weight - goals.startWeight);
  return (achievedDelta / totalDelta) * 100;
}

function calculateProgressPct(prof) {
  const goals = getGoals(prof);
  const entries = getEntries(prof);
  if (!goals || entries.length === 0) return 0;
  return calculateProgressPctForWeight(entries[entries.length - 1].weight, goals);
}

function calculate7DayComparison(prof) {
  const entries = getEntries(prof);
  const today = todayISO();
  const startCurr = addDaysISO(today, -6);
  const startPrev = addDaysISO(today, -13);

  const currEntries = entries.filter(e => e.date >= startCurr && e.date <= today);
  const prevEntries = entries.filter(e => e.date >= startPrev && e.date < startCurr);

  const avgCurr = currEntries.length > 0 ? currEntries.reduce((s, e) => s + e.weight, 0) / currEntries.length : null;
  const avgPrev = prevEntries.length > 0 ? prevEntries.reduce((s, e) => s + e.weight, 0) / prevEntries.length : null;

  return { avgCurr, avgPrev, countCurr: currEntries.length, countPrev: prevEntries.length };
}

// --- NAVIGATION & SCREENS ---
function enterAuthenticatedApp() {
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("privacy-view").classList.add("hidden");
  document.getElementById("btn-privacy").classList.remove("hidden");
  document.getElementById("btn-logout").classList.remove("hidden");

  if (!viewedProfile) viewedProfile = authSession.username;
  refreshCurrentScreen();
}

function updateHeaderState() {
  const own = isOwnProfile();
  const canAccessTeam = Boolean(appStore && appStore.me && appStore.me.shareTeam);
  const backBtn = document.getElementById("btn-header-back");
  const titleEl = document.getElementById("header-title");
  const subEl = document.getElementById("logged-user-label");

  if (own || activeMainTab === "team") {
    backBtn.classList.add("hidden");
    titleEl.innerText = "Gewichts-Tracker";
    subEl.classList.remove("hidden");
    subEl.innerText = `Hallo, ${authSession.username}`;
  } else {
    backBtn.classList.remove("hidden");
    backBtn.innerText = (openedFromTeam && canAccessTeam) ? "← Team" : `← ${authSession.username}`;
    titleEl.innerText = `Profil: ${viewedProfile}`;
    subEl.classList.remove("hidden");
    subEl.innerText = "Nur-Lese-Ansicht";
  }
}

function refreshCurrentScreen() {
  if (!authSession || !appStore) return;

  const canAccessTeam = Boolean(appStore.me && appStore.me.shareTeam);
  const navEl = document.getElementById("main-nav");
  navEl.classList.toggle("hidden", !canAccessTeam);

  const mineBtn = document.getElementById("tab-mine");
  const myStreak = calculateStreak(authSession.username);
  mineBtn.innerHTML = myStreak >= 5
    ? `${authSession.username} <span class="streak-pill">🔥 ${myStreak}</span>`
    : authSession.username;

  // Wenn ein fremdes Profil geöffnet ist, bleibt der Team-Tab aktiv (falls sichtbar)
  const teamTabShouldBeActive = canAccessTeam && ((activeMainTab === "team") || (!isOwnProfile() && openedFromTeam));
  mineBtn.classList.toggle("active", !teamTabShouldBeActive);
  document.getElementById("tab-team").classList.toggle("active", teamTabShouldBeActive);

  updateHeaderState();

  if (activeMainTab === "team" && canAccessTeam) {
    showTeamView();
  } else {
    activeMainTab = "mine";
    if (isOwnProfile() && !getGoals(authSession.username)) {
      openSetup();
    } else {
      showProfileView(viewedProfile || authSession.username);
    }
  }
}

function switchMainTab(tab) {
  activeMainTab = tab;
  openedFromTeam = false;
  if (tab === "mine") {
    viewedProfile = authSession.username;
  }
  refreshCurrentScreen();
  syncAllFromCloud();
}

function backFromOtherProfile() {
  const canAccessTeam = Boolean(appStore && appStore.me && appStore.me.shareTeam);
  viewedProfile = authSession.username;
  if (openedFromTeam && canAccessTeam) {
    activeMainTab = "team";
  } else {
    activeMainTab = "mine";
  }
  openedFromTeam = false;
  refreshCurrentScreen();
}

// Öffnet ein anderes Profil immer im Team-Modus
function openOtherProfile(username) {
  viewedProfile = username;
  openedFromTeam = true;
  activeMainTab = "mine";
  refreshCurrentScreen();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- PRIVATSPHÄRE & TEAM EINSTELLUNGEN ---
function openPrivacySettings() {
  document.getElementById("privacy-view").classList.remove("hidden");
  document.getElementById("main-nav").classList.add("hidden");
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");

  document.getElementById("priv-share-team").checked = Boolean(appStore.me.shareTeam);
  const others = (appStore.allUsernames || []).filter(u => u !== authSession.username);
  const allowed = new Set(appStore.me.allowedViewers || []);

  const listEl = document.getElementById("priv-viewers-list");
  if (others.length === 0) {
    listEl.innerHTML = `<div class="sub">Noch keine weiteren Nutzer registriert.</div>`;
  } else {
    listEl.innerHTML = others.map(u => `
      <label class="checkbox-row">
        <input type="checkbox" class="priv-viewer-cb" value="${u}" ${allowed.has(u) ? "checked" : ""} />
        <span>${u}</span>
      </label>
    `).join("");
  }
}

function closePrivacySettings() {
  document.getElementById("privacy-view").classList.add("hidden");
  refreshCurrentScreen();
}

async function savePrivacySettings() {
  const shareTeam = document.getElementById("priv-share-team").checked;
  const allowedViewers = Array.from(document.querySelectorAll(".priv-viewer-cb:checked")).map(cb => cb.value);

  setSyncBadge("Speichere...");
  try {
    const res = await callAuthedApi({ action: "updateSettings", shareTeam, allowedViewers });
    if (res.status === "ok") {
      document.getElementById("privacy-view").classList.add("hidden");
      await syncAllFromCloud();
    }
  } catch (err) {
    setSyncBadge("Fehler");
  }
}

// --- SETUP (NUR EIGENES PROFIL) ---
function openSetup() {
  if (!isOwnProfile()) return;
  document.getElementById("setup-view").classList.remove("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("setup-heading").innerText = `Ziele festlegen (${authSession.username})`;

  const goals = getGoals(authSession.username);
  document.getElementById("btn-cancel-setup").classList.toggle("hidden", !goals);
  document.getElementById("setup-start-date").value = goals ? goals.startDate : todayISO();
  document.getElementById("setup-end-date").value = goals ? goals.endDate : "2026-12-31";
  document.getElementById("setup-start-weight").value = goals ? goals.startWeight : "";
  document.getElementById("setup-goal-weight").value = goals ? goals.goalWeight : "";
}

function cancelSetup() {
  if (getGoals(authSession.username)) {
    showProfileView(authSession.username);
  }
}

async function saveSetup() {
  const startDate = document.getElementById("setup-start-date").value;
  const endDate = document.getElementById("setup-end-date").value;
  const startWeight = parseFloat(document.getElementById("setup-start-weight").value);
  const goalWeight = parseFloat(document.getElementById("setup-goal-weight").value);

  if (!startDate || !endDate || isNaN(startWeight) || isNaN(goalWeight) || endDate <= startDate) {
    alert("Bitte prüfe Datum und Gewichtsangaben!");
    return;
  }

  const goalsObj = { startDate, endDate, startWeight, goalWeight };
  const myData = getProfileData(authSession.username);
  myData.goals = goalsObj;
  localStorage.setItem("wt_app_store", JSON.stringify(appStore));

  setSyncBadge("Speichere...");
  await callAuthedApi({ action: "saveGoals", goals: goalsObj });

  if (!myData.entries.some(e => e.date === startDate)) {
    const firstEntry = { date: startDate, weight: startWeight };
    myData.entries.push(firstEntry);
    localStorage.setItem("wt_app_store", JSON.stringify(appStore));
    await callAuthedApi({ action: "saveEntry", entry: firstEntry });
  }

  setSyncBadge("✓ Cloud", true);
  refreshCurrentScreen();
}

// --- EINZELPROFIL ANZEIGEN (EIGENES ODER NUR-LESE) ---
function showProfileView(prof) {
  viewedProfile = prof;
  const own = isOwnProfile();

  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");

  document.getElementById("entry-input-card").classList.toggle("hidden", !own);
  document.getElementById("btn-edit-goals").classList.toggle("hidden", !own);

  if (own) {
    document.getElementById("entry-date").value = todayISO();
    const entries = getEntries(prof);
    document.getElementById("entry-weight").value = entries.length > 0 ? entries[entries.length - 1].weight.toFixed(1) : "";
  }

  document.getElementById("hist-heading").innerText = `Letzte Messungen (${prof})`;

  const sharedBox = document.getElementById("shared-private-box");
  if (own && appStore && appStore.profiles) {
    const otherVisible = Object.keys(appStore.profiles).filter(u => u !== authSession.username);
    if (otherVisible.length > 0) {
      sharedBox.classList.remove("hidden");
      document.getElementById("shared-private-list").innerHTML = otherVisible.map(u => `
        <button type="button" class="shared-pill-btn" onclick="openOtherProfile('${u}')">👁️ ${u}</button>
      `).join("");
    } else {
      sharedBox.classList.add("hidden");
    }
  } else {
    sharedBox.classList.add("hidden");
  }

  renderProfileData(prof);
}

function renderProfileData(prof) {
  const goals = getGoals(prof);
  const entries = getEntries(prof);
  const own = isOwnProfile();

  renderTrophyShelf(prof);

  if (goals) {
    document.getElementById("st-goal").innerText = `${goals.goalWeight.toFixed(1)} kg`;
    document.getElementById("st-goal-date").innerText = `bis ${formatDE(goals.endDate)}`;
  } else {
    document.getElementById("st-goal").innerText = "Kein Ziel";
    document.getElementById("st-goal-date").innerText = "Noch nicht eingerichtet";
  }

  const histEl = document.getElementById("history-list");
  histEl.innerHTML = [...entries].reverse().map(e => `
    <div class="hist-item">
      <div ${own ? `onclick="editEntry('${e.date}', ${e.weight})" style="cursor:pointer;"` : ""}>
        <strong>${formatDE(e.date)}</strong> &nbsp;·&nbsp; ${e.weight.toFixed(1)} kg
      </div>
      ${own ? `<button class="btn-danger" onclick="deleteEntry('${e.date}')">Löschen</button>` : ""}
    </div>
  `).join("");

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
    if (chartInstance) chartInstance.destroy();
    return;
  }

  const latest = entries[entries.length - 1];
  const targetToday = calcTargetAt(latest.date, goals);
  const diff = latest.weight - targetToday;
  const isLossGoal = goals.goalWeight <= goals.startWeight;
  const onTrack = isLossGoal ? diff <= 0 : diff >= 0;

  // Kachel 1: Soll-Abweichung
  const tileStatus = document.getElementById("tile-status");
  tileStatus.className = `stat-tile ${onTrack ? "status-good" : "status-bad"}`;
  const sign = diff > 0 ? "+" : "";
  const statusShort = onTrack ? (isLossGoal ? "unter Soll" : "im Plan") : (isLossGoal ? "über Soll" : "unter Soll");
  document.getElementById("st-diff").innerText = `${sign}${diff.toFixed(2)} kg`;
  document.getElementById("st-target").innerText = `Soll: ${targetToday.toFixed(2)} kg (${statusShort})`;

  // Kachel 2: 7-Tage-Schnitt vs. davor
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

  // Kachel 3: Wochentempo
  const trendValues = entries.map((_, i) => {
    const slice = entries.slice(Math.max(0, i - 6), i + 1);
    return slice.reduce((s, e) => s + e.weight, 0) / slice.length;
  });

  let prognosisPoint = null;
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
      const kcalLabel = kcalPerDay < 0
        ? `Ø ${Math.abs(kcalPerDay)} kcal Defizit/Tag`
        : `Ø +${kcalPerDay} kcal Überschuss/Tag`;

      document.getElementById("st-rate").innerText = `${weekRate >= 0 ? "+" : ""}${weekRate.toFixed(2)} kg / Wo`;
      document.getElementById("st-kcal").innerText = kcalLabel;

      const remDays = (new Date(goals.endDate) - dLast) / 86400000;
      if (remDays > 0) {
        prognosisPoint = { date: goals.endDate, weight: gLast + slopePerDay * remDays };
      }
    }
  } else {
    document.getElementById("st-rate").innerText = "–";
    document.getElementById("st-kcal").innerText = "mind. 2 Messungen nötig";
  }

  // Fortschritts-Karte
  const rawPct = calculateProgressPct(prof);
  const clampedPct = Math.max(0, Math.min(100, rawPct));
  const remainingKg = Math.max(0, isLossGoal ? (latest.weight - goals.goalWeight) : (goals.goalWeight - latest.weight));

  document.getElementById("prog-pct").innerText = `${Math.round(rawPct)} % geschafft`;
  document.getElementById("prog-rem").innerText = remainingKg === 0 ? "Ziel erreicht! 🎉" : `noch ${remainingKg.toFixed(1)} kg`;
  const progFill = document.getElementById("prog-fill");
  progFill.style.width = `${clampedPct}%`;
  progFill.className = `progress-fill ${onTrack ? "good" : "bad"}`;

  // Chart
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  const linePrimary = isDark ? "#3b82f6" : "#2563eb";

  let xMin = undefined;
  let xMax = undefined;
  let sollData = [
    { x: goals.startDate, y: goals.startWeight },
    { x: goals.endDate, y: goals.goalWeight }
  ];

  if (chartZoom === "30") {
    const thirtyDaysAgo = addDaysISO(todayISO(), -30);
    xMin = thirtyDaysAgo > goals.startDate ? thirtyDaysAgo : goals.startDate;
    xMax = addDaysISO(todayISO(), 3);
    if (xMax > goals.endDate) xMax = goals.endDate;

    sollData = [
      { x: xMin, y: calcTargetAt(xMin, goals) },
      { x: xMax, y: calcTargetAt(xMax, goals) }
    ];
  }

  const istData = entries.map(e => ({ x: e.date, y: e.weight }));
  const trendData = entries.map((e, idx) => ({ x: e.date, y: trendValues[idx] }));
  const progData = (prognosisPoint && chartZoom === "all")
    ? [{ x: latest.date, y: trendValues[trendValues.length - 1] }, { x: prognosisPoint.date, y: prognosisPoint.weight }]
    : [];

  if (chartInstance) chartInstance.destroy();
  const ctx = document.getElementById("weightChart").getContext("2d");
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        { label: "Soll", data: sollData, borderColor: "#94a3b8", borderDash: [6, 6], borderWidth: 2, pointRadius: 0 },
        { label: "Messwerte", data: istData, borderColor: linePrimary, backgroundColor: linePrimary, borderWidth: 1.5, pointRadius: 3 },
        { label: "7-Tage-Trend", data: trendData, borderColor: "#f97316", borderWidth: 2.8, pointRadius: 0 },
        { label: "Prognose", data: progData, borderColor: "#f97316", borderDash: [4, 4], borderWidth: 2, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 }, color: tickColor } },
        tooltip: { callbacks: { title: (items) => formatDE(items[0].raw.x) } }
      },
      scales: {
        x: {
          type: "time", min: xMin, max: xMax,
          time: { unit: "day", tooltipFormat: "dd.MM.yyyy" },
          grid: { color: gridColor },
          ticks: {
            maxTicksLimit: 6, font: { size: 10 }, color: tickColor,
            callback: (val) => new Date(val).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
          }
        },
        y: { grid: { color: gridColor }, ticks: { font: { size: 10 }, color: tickColor } }
      }
    }
  });
}

// --- TEAM-ANSICHT & UNTERGRUPPEN ---
function getTeamMembers() {
  if (!appStore || !appStore.profiles) return [];
  return Object.values(appStore.profiles).filter(p => p.shareTeam);
}

function setTeamSort(mode) {
  teamSortBy = mode;
  localStorage.setItem("wt_team_sort", mode);
  document.getElementById("sort-streak").classList.toggle("active", mode === "streak");
  document.getElementById("sort-progress").classList.toggle("active", mode === "progress");
  if (activeMainTab === "team") {
    showTeamView();
  }
}

function toggleSubgroupCreator() {
  const box = document.getElementById("subgroup-creator");
  const isOpening = box.classList.contains("hidden");
  box.classList.toggle("hidden");

  if (isOpening) {
    document.getElementById("sg-name-input").value = "";
    const others = getTeamMembers().map(m => m.username).filter(u => u !== authSession.username);
    const listEl = document.getElementById("sg-members-checklist");
    if (others.length === 0) {
      listEl.innerHTML = `<div class="sub">Keine weiteren Teammitglieder verfügbar.</div>`;
    } else {
      listEl.innerHTML = others.map(u => `
        <label class="checkbox-row">
          <input type="checkbox" class="sg-member-cb" value="${u}" />
          <span>${u}</span>
        </label>
      `).join("");
    }
  }
}

async function createSubgroup() {
  const name = document.getElementById("sg-name-input").value.trim();
  const selected = Array.from(document.querySelectorAll(".sg-member-cb:checked")).map(cb => cb.value);

  if (!name) {
    alert("Bitte einen Namen für die Untergruppe eingeben.");
    return;
  }
  if (selected.length === 0) {
    alert("Bitte wähle mindestens ein weiteres Teammitglied aus.");
    return;
  }

  setSyncBadge("Erstelle...");
  try {
    const res = await callAuthedApi({
      action: "createSubgroup",
      name,
      members: [authSession.username, ...selected]
    });
    if (res.status === "ok") {
      document.getElementById("subgroup-creator").classList.add("hidden");
      await syncAllFromCloud();
    } else {
      alert(res.message || "Fehler beim Erstellen.");
    }
  } catch (err) {
    setSyncBadge("Fehler");
  }
}

async function deleteSubgroup(id, name) {
  if (!confirm(`Untergruppe "${name}" wirklich auflösen?`)) return;
  setSyncBadge("Lösche...");
  try {
    const res = await callAuthedApi({ action: "deleteSubgroup", id });
    if (res.status === "ok") {
      await syncAllFromCloud();
    }
  } catch (err) {
    setSyncBadge("Fehler");
  }
}

function renderSubgroupsList() {
  const listEl = document.getElementById("subgroups-list");
  const subgroups = (appStore && Array.isArray(appStore.subgroups)) ? appStore.subgroups : [];

  if (subgroups.length === 0) {
    listEl.innerHTML = `<div class="sub" style="padding:4px 0;">Noch keine Untergruppe angelegt. Tippe auf <strong>+ Neu</strong>, um eine gemeinsame strenge Streak zu starten.</div>`;
    return;
  }

  listEl.innerHTML = subgroups.map(sg => {
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
  }).join("");
}

function showTeamView() {
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("team-view").classList.remove("hidden");

  document.getElementById("sort-streak").classList.toggle("active", teamSortBy === "streak");
  document.getElementById("sort-progress").classList.toggle("active", teamSortBy === "progress");

  renderSubgroupsList();

  const members = getTeamMembers();
  const today = todayISO();

  let sumPct = 0;
  let activeGoalsCount = 0;

  // Daten für alle Mitglieder vorbereiten und nach gewähltem Kriterium sortieren
  const enrichedMembers = members.map(m => {
    const prof = m.username;
    const streak = calculateStreak(prof);
    const rawPct = calculateProgressPct(prof);
    const clampedPct = Math.max(0, Math.min(100, rawPct));
    if (m.goals) {
      sumPct += clampedPct;
      activeGoalsCount++;
    }
    return { member: m, prof, streak, rawPct, clampedPct };
  }).sort((a, b) => {
    if (teamSortBy === "progress") {
      return b.rawPct - a.rawPct || b.streak - a.streak;
    }
    return b.streak - a.streak || b.rawPct - a.rawPct;
  });

  const totalDefs = getMilestoneDefinitions(authSession.username).length;
  const medals = ["🥇", "🥈", "🥉"];

  const cardsHtml = enrichedMembers.map((item, idx) => {
    const { member: m, prof, streak, rawPct, clampedPct } = item;
    const goals = m.goals;
    const entries = m.entries || [];
    const rankIcon = medals[idx] || `${idx + 1}.`;

    const weighedToday = entries.some(e => e.date === today);
    const comp = calculate7DayComparison(prof);
    const avg7Str = comp.avgCurr !== null ? `${comp.avgCurr.toFixed(1)} kg` : "–";

    let delta7Str = "";
    if (comp.avgCurr !== null && comp.avgPrev !== null) {
      const d7 = comp.avgCurr - comp.avgPrev;
      delta7Str = ` (${d7 > 0 ? "+" : ""}${d7.toFixed(2)} kg vs. davor)`;
    }

    const isLossGoal = goals ? goals.goalWeight <= goals.startWeight : true;
    const latest = entries.length > 0 ? entries[entries.length - 1] : null;
    const remKg = (goals && latest)
      ? Math.max(0, isLossGoal ? (latest.weight - goals.goalWeight) : (goals.goalWeight - latest.weight))
      : null;

    const unlockedCount = (m.rewards || []).length;

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
          <span>${goals ? `${Math.round(rawPct)} % geschafft` : "Noch kein Ziel"}</span>
          <span>${remKg !== null ? (remKg === 0 ? "Ziel erreicht! 🎉" : `noch ${remKg.toFixed(1)} kg`) : ""}</span>
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
  }).join("");

  const teamPct = activeGoalsCount > 0 ? (sumPct / activeGoalsCount) : 0;
  document.getElementById("team-total-pct").innerText = `${Math.round(teamPct)} %`;
  document.getElementById("team-member-count").innerText = `${members.length} ${members.length === 1 ? "Teammitglied" : "Teammitglieder"}`;
  document.getElementById("team-total-fill").style.width = `${Math.max(0, Math.min(100, teamPct))}%`;
  document.getElementById("team-cards-container").innerHTML = cardsHtml;

  renderTeamChart();
}

function renderTeamChart() {
  const ctx = document.getElementById("teamChart");
  if (!ctx) return;

  const activeMembers = getTeamMembers().filter(m => m.goals && m.entries && m.entries.length > 0);
  if (activeMembers.length === 0) {
    if (teamChartInstance) teamChartInstance.destroy();
    return;
  }

  const allDatesSet = new Set();
  activeMembers.forEach(m => m.entries.forEach(e => allDatesSet.add(e.date)));
  const sortedDates = Array.from(allDatesSet).sort();

  const teamSeries = sortedDates.map(date => {
    let sumPct = 0;
    for (const m of activeMembers) {
      let lastEntry = null;
      for (const e of m.entries) {
        if (e.date <= date) lastEntry = e;
        else break;
      }
      const w = lastEntry ? lastEntry.weight : m.goals.startWeight;
      const pct = Math.max(0, Math.min(100, calculateProgressPctForWeight(w, m.goals)));
      sumPct += pct;
    }
    return { x: date, y: Math.round((sumPct / activeMembers.length) * 10) / 10 };
  });

  const minStart = activeMembers.reduce((min, m) => m.goals.startDate < min ? m.goals.startDate : min, activeMembers[0].goals.startDate);
  const maxEnd = activeMembers.reduce((max, m) => m.goals.endDate > max ? m.goals.endDate : max, activeMembers[0].goals.endDate);

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tickColor = isDark ? "#94a3b8" : "#64748b";

  if (teamChartInstance) teamChartInstance.destroy();
  teamChartInstance = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: {
      datasets: [
        {
          label: "Soll-Kurs",
          data: [{ x: minStart, y: 0 }, { x: maxEnd, y: 100 }],
          borderColor: "#94a3b8", borderDash: [6, 6], borderWidth: 2, pointRadius: 0
        },
        {
          label: "Team-Fortschritt (%)",
          data: teamSeries,
          borderColor: "#8b5cf6", backgroundColor: "rgba(139, 92, 246, 0.14)",
          fill: true, borderWidth: 2.8, pointRadius: 3, pointBackgroundColor: "#8b5cf6"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 }, color: tickColor } },
        tooltip: {
          callbacks: {
            title: (items) => formatDE(items[0].raw.x),
            label: (item) => `${item.dataset.label}: ${item.raw.y.toFixed(1)} %`
          }
        }
      },
      scales: {
        x: {
          type: "time", time: { unit: "day", tooltipFormat: "dd.MM.yyyy" },
          grid: { color: gridColor },
          ticks: {
            maxTicksLimit: 6, font: { size: 10 }, color: tickColor,
            callback: (val) => new Date(val).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
          }
        },
        y: {
          min: 0, max: 100, grid: { color: gridColor },
          ticks: { font: { size: 10 }, color: tickColor, callback: (val) => `${val} %` }
        }
      }
    }
  });
}

// --- EIGENE EINTRÄGE SPEICHERN & LÖSCHEN ---
function stepWeight(delta) {
  if (!isOwnProfile()) return;
  const input = document.getElementById("entry-weight");
  let current = parseFloat(input.value.replace(",", "."));
  if (isNaN(current)) {
    const entries = getEntries(authSession.username);
    current = entries.length > 0 ? entries[entries.length - 1].weight : 80.0;
  }
  const next = Math.round((current + delta) * 10) / 10;
  input.value = next.toFixed(1);
}

async function addEntry() {
  if (!isOwnProfile()) return;
  const date = document.getElementById("entry-date").value;
  const weight = parseFloat(document.getElementById("entry-weight").value.replace(",", "."));
  if (!date || isNaN(weight)) {
    alert("Bitte gültiges Datum und Gewicht eingeben.");
    return;
  }

  const entryObj = { date, weight };
  const myData = getProfileData(authSession.username);
  myData.entries = myData.entries.filter(e => e.date !== date);
  myData.entries.push(entryObj);
  localStorage.setItem("wt_app_store", JSON.stringify(appStore));
  document.getElementById("entry-weight").value = weight.toFixed(1);

  refreshCurrentScreen();
  setSyncBadge("Speichere...");
  await callAuthedApi({ action: "saveEntry", entry: entryObj });
  setSyncBadge("✓ Cloud", true);
  await checkAndUnlockMilestones();
}

async function deleteEntry(date) {
  if (!isOwnProfile()) return;
  if (!confirm(`Messung vom ${formatDE(date)} löschen?`)) return;
  const myData = getProfileData(authSession.username);
  myData.entries = myData.entries.filter(e => e.date !== date);
  localStorage.setItem("wt_app_store", JSON.stringify(appStore));

  refreshCurrentScreen();
  setSyncBadge("Lösche...");
  await callAuthedApi({ action: "deleteEntry", date });
  setSyncBadge("✓ Cloud", true);
}

function editEntry(date, weight) {
  if (!isOwnProfile()) return;
  document.getElementById("entry-date").value = date;
  document.getElementById("entry-weight").value = weight.toFixed(1);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- PERSÖNLICHE TROPHÄEN & BELOHNUNGEN ---
function renderTrophyShelf(prof) {
  const unlocked = new Set(getUnlockedRewards(prof));
  const defs = getMilestoneDefinitions(prof);
  const unlockedCount = defs.filter(d => unlocked.has(d.id)).length;

  document.getElementById("trophy-count").innerText = `${unlockedCount} / ${defs.length}`;
  document.getElementById("trophy-grid").innerHTML = defs.map(m => {
    const isUnlocked = unlocked.has(m.id);
    const clickAttr = isUnlocked ? `onclick="previewReward('${prof}', '${m.id}')"` : "";
    return `
      <div class="trophy-item ${isUnlocked ? "unlocked" : ""}" ${clickAttr} title="${m.title}">
        <div class="trophy-icon">${m.shelfIcon}</div>
        <div class="trophy-label">${m.shelfLabel}</div>
      </div>
    `;
  }).join("");
}

function previewReward(prof, rewardId) {
  const def = getMilestoneDefinitions(prof).find(m => m.id === rewardId);
  if (def) showRewardPopup(def, false, prof);
}

async function checkAndUnlockMilestones() {
  if (!authSession || !appStore) return;
  const prof = authSession.username;
  const streak = calculateStreak(prof);
  const pct = calculateProgressPct(prof);
  const maxGroupStreak = getMaxUserGroupStreak(prof);
  const myData = getProfileData(prof);
  const unlocked = myData.rewards || [];
  const defs = getMilestoneDefinitions(prof);

  const newlyUnlocked = [];
  for (const m of defs) {
    if (unlocked.includes(m.id)) continue;
    const hit = (m.type === "streak" && streak >= m.threshold) ||
                (m.type === "pct" && pct >= m.threshold) ||
                (m.type === "group_streak" && maxGroupStreak >= m.threshold);
    if (hit) {
      unlocked.push(m.id);
      newlyUnlocked.push(m);
    }
  }

  if (newlyUnlocked.length > 0) {
    myData.rewards = unlocked;
    localStorage.setItem("wt_app_store", JSON.stringify(appStore));
    if (viewedProfile === prof) {
      renderTrophyShelf(prof);
    }

    rewardQueue.push(...newlyUnlocked);
    if (document.getElementById("reward-modal").classList.contains("hidden")) {
      showNextRewardInQueue();
    }

    for (const m of newlyUnlocked) {
      await callAuthedApi({ action: "unlockReward", rewardId: m.id });
    }
  }
}

function showNextRewardInQueue() {
  if (rewardQueue.length === 0) return;
  showRewardPopup(rewardQueue.shift(), true, authSession.username);
}

function showRewardPopup(milestone, withConfetti = true, prof = viewedProfile) {
  document.getElementById("modal-icon").innerText = milestone.modalIcon;
  document.getElementById("modal-tag").innerText = milestone.tag;
  document.getElementById("modal-title").innerText = milestone.title;
  document.getElementById("modal-text").innerText = milestone.text;
  document.getElementById("reward-modal").classList.remove("hidden");

  if (withConfetti) {
    launchConfetti(prof === "Hannah" ? ["❤️", "😘", "✨", "🎉"] : ["🔥", "🏆", "⭐", "🎉"]);
  }
}

function closeRewardModal() {
  document.getElementById("reward-modal").classList.add("hidden");
  document.getElementById("confetti-layer").innerHTML = "";
  if (rewardQueue.length > 0) {
    setTimeout(showNextRewardInQueue, 250);
  }
}

function launchConfetti(symbols) {
  const layer = document.getElementById("confetti-layer");
  layer.innerHTML = "";
  for (let i = 0; i < 28; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.innerText = symbols[i % symbols.length];
    el.style.left = `${Math.random() * 100}%`;
    el.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    el.style.animationDelay = `${Math.random() * 0.4}s`;
    layer.appendChild(el);
  }
}

function setZoom(mode) {
  chartZoom = mode;
  localStorage.setItem("wt_chart_zoom", mode);
  document.getElementById("zoom-all").classList.toggle("active", mode === "all");
  document.getElementById("zoom-30").classList.toggle("active", mode === "30");
  if (viewedProfile) renderProfileData(viewedProfile);
}

// --- DATUM & START ---
function formatDE(dateInput) {
  if (!dateInput) return "";
  const str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-");
    return `${d}.${m}.${y}`;
  }
  const dObj = new Date(str);
  if (!isNaN(dObj.getTime())) {
    return dObj.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return str;
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDaysISO(isoStr, days) {
  const d = new Date(isoStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function calcTargetAt(dateStr, goals) {
  const dStart = new Date(goals.startDate);
  const dEnd = new Date(goals.endDate);
  const dCurr = new Date(dateStr);
  const totalDays = (dEnd - dStart) / 86400000;
  if (totalDays <= 0) return goals.goalWeight;
  const passed = (dCurr - dStart) / 86400000;
  return goals.startWeight + (goals.goalWeight - goals.startWeight) * (passed / totalDays);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && authSession) {
    const dateInput = document.getElementById("entry-date");
    if (dateInput) dateInput.value = todayISO();
    syncAllFromCloud();
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!authSession) return;
  if (activeMainTab === "team") renderTeamChart();
  else if (viewedProfile) renderProfileData(viewedProfile);
});

async function init() {
  document.getElementById("zoom-all").classList.toggle("active", chartZoom === "all");
  document.getElementById("zoom-30").classList.toggle("active", chartZoom === "30");

  if (authSession && appStore) {
    viewedProfile = authSession.username;
    enterAuthenticatedApp();
    await syncAllFromCloud();
  } else {
    showAuthScreen();
  }
}

init();
