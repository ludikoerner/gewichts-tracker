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

const PROFILES = ["Ludwig", "Hannah"];
let currentTab = localStorage.getItem("wt_active_profile") || "Ludwig";
let chartZoom = localStorage.getItem("wt_chart_zoom") || "all";
let chartInstance = null;
let rewardQueue = [];

function goalsKey(prof = currentTab) { return `wt_goals_${prof}`; }
function entriesKey(prof = currentTab) { return `wt_entries_${prof}`; }
function rewardsKey(prof = currentTab) { return `wt_rewards_${prof}`; }

// --- MEILENSTEIN-DEFINITIONEN ---
function getMilestoneDefinitions(prof) {
  const isHannah = prof === "Hannah";
  return [
    {
      id: "streak_5",
      type: "streak",
      threshold: 5,
      shelfIcon: "🔥",
      shelfLabel: "5 Tage",
      tag: "5-TAGE-STREAK",
      modalIcon: "🔥",
      title: "5 Tage in Folge!",
      text: `Stark gestartet, ${prof}! Die erste Hürde ist genommen – Routine schlägt Motivation.`
    },
    {
      id: "streak_10",
      type: "streak",
      threshold: 10,
      shelfIcon: "⚡",
      shelfLabel: "10 Tage",
      tag: "10-TAGE-STREAK",
      modalIcon: "⚡",
      title: "10 Tage Streak!",
      text: "Zweistellig! Zehn Tage lückenlos drangeblieben. Das wird langsam zur Gewohnheit."
    },
    {
      id: "streak_25",
      type: "streak",
      threshold: 25,
      shelfIcon: "🥉",
      shelfLabel: "25 Tage",
      tag: "25-TAGE-STREAK",
      modalIcon: "🏅",
      title: "25 Tage am Stück!",
      text: `Ein Vierteljahrhundert! Deine Konstanz ist beeindruckend, ${prof}.`
    },
    {
      id: "streak_50",
      type: "streak",
      threshold: 50,
      shelfIcon: "🥈",
      shelfLabel: "50 Tage",
      tag: "50-TAGE-STREAK",
      modalIcon: "🚀",
      title: "50 Tage Streak!",
      text: "50 Tage ohne Ausnahme – absolute Maschinen-Mentalität!"
    },
    {
      id: "streak_100",
      type: "streak",
      threshold: 100,
      shelfIcon: "👑",
      shelfLabel: "100 Tage",
      tag: "100-TAGE-STREAK",
      modalIcon: "👑",
      title: "100 Tage Legende!",
      text: "Dreistellig! 100 Tage durchgezogen – das macht euch so schnell keiner nach."
    },
    {
      id: "pct_10",
      type: "pct",
      threshold: 10,
      shelfIcon: "🌱",
      shelfLabel: "10 %",
      tag: "10 % ZIEL ERREICHT",
      modalIcon: isHannah ? "😘" : "🌱",
      title: isHannah ? "Aller Anfang ist schwer 😘" : "10 % geschafft!",
      text: isHannah
        ? "Hier ein Bussi damit du dran bleibst 😘"
        : "Der Anfang ist gemacht, Ludwig! Die ersten 10 % liegen hinter dir."
    },
    {
      id: "pct_25",
      type: "pct",
      threshold: 25,
      shelfIcon: isHannah ? "😘" : "🎯",
      shelfLabel: "25 %",
      tag: "25 % ZIEL ERREICHT",
      modalIcon: isHannah ? "😘😘" : "🎯",
      title: isHannah ? "Jetzt geht es richtig los 😘😘" : "Viertel-Meile: 25 %!",
      text: isHannah
        ? "Bleib dran Schatzimausibussibärli 😘😘"
        : "Ein Viertel des Weges ist geschafft – dein Kurs stimmt!"
    },
    {
      id: "pct_50",
      type: "pct",
      threshold: 50,
      shelfIcon: isHannah ? "❤️" : "🏔️",
      shelfLabel: "50 %",
      tag: "50 % ZIEL ERREICHT",
      modalIcon: isHannah ? "❤️" : "🏔️",
      title: isHannah ? "Zur Hälfte hast du es geschafft ❤️" : "Bergfest: 50 %!",
      text: isHannah
        ? "Ich glaub an dich ❤️"
        : "Halbzeit, Ludwig! Ab jetzt geht es auf der Zielgeraden bergab (im besten Sinne)."
    },
    {
      id: "pct_100",
      type: "pct",
      threshold: 100,
      shelfIcon: "🏆",
      shelfLabel: "100 %",
      tag: "100 % ZIEL ERREICHT",
      modalIcon: isHannah ? "❤️❤️❤️" : "🏆",
      title: isHannah ? "Du hast es geschafft ❤️❤️❤️" : "ZIEL ERREICHT: 100 %!",
      text: isHannah
        ? "Ich bin soooo stolz auf dich ❤️❤️❤️"
        : "Wahnsinn, Ludwig! Du hast dein Zielgewicht geknackt. Zeit zum Feiern!"
    }
  ];
}

function getUnlockedRewards(prof = currentTab) {
  const raw = localStorage.getItem(rewardsKey(prof));
  return raw ? JSON.parse(raw) : [];
}

function setSyncBadge(text, isOk = false) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.innerText = text;
  el.className = isOk ? "sync-badge sync-ok" : "sync-badge";
}

function calculateStreak(prof) {
  const entries = getEntries(prof);
  if (entries.length === 0) return 0;

  const dateSet = new Set(entries.map(e => e.date));
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);

  let checkDate = null;
  if (dateSet.has(today)) {
    checkDate = today;
  } else if (dateSet.has(yesterday)) {
    checkDate = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (dateSet.has(checkDate)) {
    streak++;
    checkDate = addDaysISO(checkDate, -1);
  }
  return streak;
}

function calculateProgressPct(prof) {
  const goals = getGoals(prof);
  const entries = getEntries(prof);
  if (!goals || entries.length === 0) return 0;

  const latest = entries[entries.length - 1];
  const isLossGoal = goals.goalWeight <= goals.startWeight;
  const totalDelta = Math.abs(goals.startWeight - goals.goalWeight);
  if (totalDelta <= 0) return 0;

  const achievedDelta = isLossGoal
    ? (goals.startWeight - latest.weight)
    : (latest.weight - goals.startWeight);

  return (achievedDelta / totalDelta) * 100;
}

// Berechnet Durchschnitt der letzten 7 Kalendertage (Tag 0..-6) vs. davor (Tag -7..-13)
function calculate7DayComparison(prof) {
  const entries = getEntries(prof);
  const today = todayISO();
  const startCurr = addDaysISO(today, -6);   // inkl. heute = 7 Tage
  const startPrev = addDaysISO(today, -13);  // Tag -13 bis -7 = 7 Tage davor

  const currEntries = entries.filter(e => e.date >= startCurr && e.date <= today);
  const prevEntries = entries.filter(e => e.date >= startPrev && e.date < startCurr);

  const avgCurr = currEntries.length > 0
    ? currEntries.reduce((s, e) => s + e.weight, 0) / currEntries.length
    : null;
  const avgPrev = prevEntries.length > 0
    ? prevEntries.reduce((s, e) => s + e.weight, 0) / prevEntries.length
    : null;

  return { avgCurr, avgPrev, countCurr: currEntries.length, countPrev: prevEntries.length };
}

function updateProfileTabs() {
  PROFILES.forEach(prof => {
    const btn = document.getElementById(`tab-${prof}`);
    if (!btn) return;
    btn.classList.toggle("active", currentTab === prof);
    const streak = calculateStreak(prof);
    if (streak >= 5) {
      btn.innerHTML = `${prof} <span class="streak-pill">🔥 ${streak}</span>`;
    } else {
      btn.textContent = prof;
    }
  });
  const teamBtn = document.getElementById("tab-Gemeinsam");
  if (teamBtn) {
    teamBtn.classList.toggle("active", currentTab === "Gemeinsam");
  }
}

function renderTrophyShelf() {
  const unlocked = new Set(getUnlockedRewards(currentTab));
  const defs = getMilestoneDefinitions(currentTab);
  const unlockedCount = defs.filter(d => unlocked.has(d.id)).length;

  document.getElementById("trophy-count").innerText = `${unlockedCount} / ${defs.length}`;
  const grid = document.getElementById("trophy-grid");

  grid.innerHTML = defs.map(m => {
    const isUnlocked = unlocked.has(m.id);
    const clickAttr = isUnlocked ? `onclick="previewReward('${m.id}')"` : "";
    return `
      <div class="trophy-item ${isUnlocked ? "unlocked" : ""}" ${clickAttr} title="${m.title}">
        <div class="trophy-icon">${m.shelfIcon}</div>
        <div class="trophy-label">${m.shelfLabel}</div>
      </div>
    `;
  }).join("");
}

function previewReward(rewardId) {
  const def = getMilestoneDefinitions(currentTab).find(m => m.id === rewardId);
  if (!def) return;
  showRewardPopup(def, false);
}

async function checkAndUnlockMilestones() {
  if (!PROFILES.includes(currentTab)) return;
  const streak = calculateStreak(currentTab);
  const pct = calculateProgressPct(currentTab);
  const unlocked = getUnlockedRewards(currentTab);
  const defs = getMilestoneDefinitions(currentTab);

  const newlyUnlocked = [];

  for (const m of defs) {
    if (unlocked.includes(m.id)) continue;
    const hit = (m.type === "streak" && streak >= m.threshold) ||
                (m.type === "pct" && pct >= m.threshold);
    if (hit) {
      unlocked.push(m.id);
      newlyUnlocked.push(m);
    }
  }

  if (newlyUnlocked.length > 0) {
    localStorage.setItem(rewardsKey(currentTab), JSON.stringify(unlocked));
    renderTrophyShelf();

    rewardQueue.push(...newlyUnlocked);
    if (document.getElementById("reward-modal").classList.contains("hidden")) {
      showNextRewardInQueue();
    }

    for (const m of newlyUnlocked) {
      await pushToCloud({ action: "unlockReward", rewardId: m.id });
    }
  }
}

function showNextRewardInQueue() {
  if (rewardQueue.length === 0) return;
  const next = rewardQueue.shift();
  showRewardPopup(next, true);
}

function showRewardPopup(milestone, withConfetti = true) {
  document.getElementById("modal-icon").innerText = milestone.modalIcon;
  document.getElementById("modal-tag").innerText = milestone.tag;
  document.getElementById("modal-title").innerText = milestone.title;
  document.getElementById("modal-text").innerText = milestone.text;
  document.getElementById("reward-modal").classList.remove("hidden");

  if (withConfetti) {
    launchConfetti(currentTab === "Hannah" ? ["❤️", "😘", "✨", "🎉"] : ["🔥", "🏆", "⭐", "🎉"]);
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
  renderAll();
}

function stepWeight(delta) {
  const input = document.getElementById("entry-weight");
  let current = parseFloat(input.value.replace(",", "."));
  if (isNaN(current)) {
    const entries = getEntries();
    current = entries.length > 0 ? entries[entries.length - 1].weight : 80.0;
  }
  const next = Math.round((current + delta) * 10) / 10;
  input.value = next.toFixed(1);
}

async function switchProfile(tab) {
  currentTab = tab;
  localStorage.setItem("wt_active_profile", tab);
  updateProfileTabs();

  if (tab === "Gemeinsam") {
    showTeamView();
  } else if (getGoals(tab)) {
    showApp(false);
  } else {
    openSetup();
  }
  await syncFromCloud();
}

async function fetchProfileData(prof) {
  const url = `${API_URL}?profile=${encodeURIComponent(prof)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.goals) {
    localStorage.setItem(goalsKey(prof), JSON.stringify(data.goals));
  } else {
    localStorage.removeItem(goalsKey(prof));
  }

  if (Array.isArray(data.entries)) {
    localStorage.setItem(entriesKey(prof), JSON.stringify(data.entries));
  }

  if (Array.isArray(data.rewards)) {
    const localRew = getUnlockedRewards(prof);
    const merged = Array.from(new Set([...localRew, ...data.rewards]));
    localStorage.setItem(rewardsKey(prof), JSON.stringify(merged));
  }
}

async function syncFromCloud() {
  if (typeof API_URL === "undefined" || !API_URL.startsWith("http")) {
    setSyncBadge("Lokal");
    return;
  }
  setSyncBadge("Sync...");
  try {
    await Promise.all(PROFILES.map(p => fetchProfileData(p)));
    updateProfileTabs();
    setSyncBadge("✓ Cloud", true);

    if (currentTab === "Gemeinsam") {
      showTeamView();
    } else if (getGoals(currentTab)) {
      showApp(false);
    } else {
      openSetup();
    }
  } catch (err) {
    setSyncBadge("Offline");
  }
}

async function pushToCloud(payload) {
  if (typeof API_URL === "undefined" || !API_URL.startsWith("http")) return;
  payload.profile = currentTab;
  setSyncBadge("Speichere...");
  try {
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });
    setSyncBadge("✓ Cloud", true);
  } catch (err) {
    setSyncBadge("Sync-Fehler");
  }
}

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
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysISO(isoStr, days) {
  const d = new Date(isoStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const dateInput = document.getElementById("entry-date");
    if (dateInput) dateInput.value = todayISO();
    syncFromCloud();
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentTab !== "Gemeinsam" && getGoals()) renderAll();
});

function getGoals(prof = currentTab) {
  const raw = localStorage.getItem(goalsKey(prof));
  return raw ? JSON.parse(raw) : null;
}

function getEntries(prof = currentTab) {
  const raw = localStorage.getItem(entriesKey(prof));
  const list = raw ? JSON.parse(raw) : [];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

async function init() {
  updateProfileTabs();
  document.getElementById("zoom-all").classList.toggle("active", chartZoom === "all");
  document.getElementById("zoom-30").classList.toggle("active", chartZoom === "30");

  if (currentTab === "Gemeinsam") {
    showTeamView();
  } else if (getGoals(currentTab)) {
    showApp(false);
  } else {
    openSetup();
  }
  await syncFromCloud();
}

function openSetup() {
  document.getElementById("setup-view").classList.remove("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("setup-heading").innerText = `Ziele festlegen (${currentTab})`;

  const goals = getGoals();
  document.getElementById("btn-cancel-setup").classList.toggle("hidden", !goals);
  document.getElementById("setup-start-date").value = goals ? goals.startDate : todayISO();
  document.getElementById("setup-end-date").value = goals ? goals.endDate : "2026-12-31";
  document.getElementById("setup-start-weight").value = goals ? goals.startWeight : "";
  document.getElementById("setup-goal-weight").value = goals ? goals.goalWeight : "";
}

function cancelSetup() {
  if (getGoals()) {
    showApp(false);
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
  localStorage.setItem(goalsKey(), JSON.stringify(goalsObj));
  await pushToCloud({ action: "saveGoals", goals: goalsObj });

  const entries = getEntries();
  if (!entries.some(e => e.date === startDate)) {
    const firstEntry = { date: startDate, weight: startWeight };
    entries.push(firstEntry);
    localStorage.setItem(entriesKey(), JSON.stringify(entries));
    await pushToCloud({ action: "saveEntry", entry: firstEntry });
  }
  updateProfileTabs();
  showApp(false);
}

function showApp(triggerSync = true) {
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("team-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");
  document.getElementById("entry-date").value = todayISO();

  document.getElementById("hist-heading").innerText = `Letzte Messungen (${currentTab})`;

  const entries = getEntries();
  if (entries.length > 0) {
    document.getElementById("entry-weight").value = entries[entries.length - 1].weight.toFixed(1);
  } else {
    document.getElementById("entry-weight").value = "";
  }

  renderAll();
  if (triggerSync) syncFromCloud();
}

// --- TEAM-ANSICHT RENDERN ---
function showTeamView() {
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("team-view").classList.remove("hidden");

  const today = todayISO();
  let sumPct = 0;
  let activeCount = 0;

  const cardsHtml = PROFILES.map(prof => {
    const goals = getGoals(prof);
    const entries = getEntries(prof);
    const streak = calculateStreak(prof);
    const rawPct = calculateProgressPct(prof);
    const clampedPct = Math.max(0, Math.min(100, rawPct));

    if (goals) {
      sumPct += clampedPct;
      activeCount++;
    }

    const weighedToday = entries.some(e => e.date === today);
    const comp = calculate7DayComparison(prof);
    const avg7Str = comp.avgCurr !== null ? `${comp.avgCurr.toFixed(1)} kg` : "–";

    let delta7Str = "";
    if (comp.avgCurr !== null && comp.avgPrev !== null) {
      const d7 = comp.avgCurr - comp.avgPrev;
      delta7Str = ` (${d7 > 0 ? "+" : ""}${d7.toFixed(2)} kg vs. Vorwoche)`;
    }

    const isLossGoal = goals ? goals.goalWeight <= goals.startWeight : true;
    const latest = entries.length > 0 ? entries[entries.length - 1] : null;
    const remKg = (goals && latest)
      ? Math.max(0, isLossGoal ? (latest.weight - goals.goalWeight) : (goals.goalWeight - latest.weight))
      : null;

    const unlockedCount = getUnlockedRewards(prof).length;

    return `
      <div class="card partner-card" onclick="switchProfile('${prof}')">
        <div class="partner-header">
          <div class="partner-name">
            <span>${prof}</span>
            ${streak >= 5 ? `<span class="streak-pill">🔥 ${streak}</span>` : ""}
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
          <span>🏆 ${unlockedCount} / 9</span>
        </div>
      </div>
    `;
  }).join("");

  const teamPct = activeCount > 0 ? (sumPct / activeCount) : 0;
  document.getElementById("team-total-pct").innerText = `${Math.round(teamPct)} %`;
  document.getElementById("team-total-fill").style.width = `${Math.max(0, Math.min(100, teamPct))}%`;
  document.getElementById("team-cards-container").innerHTML = cardsHtml;
}

async function addEntry() {
  const date = document.getElementById("entry-date").value;
  const weight = parseFloat(document.getElementById("entry-weight").value.replace(",", "."));
  if (!date || isNaN(weight)) {
    alert("Bitte gültiges Datum und Gewicht eingeben.");
    return;
  }

  const entryObj = { date, weight };
  let entries = getEntries().filter(e => e.date !== date);
  entries.push(entryObj);
  localStorage.setItem(entriesKey(), JSON.stringify(entries));
  document.getElementById("entry-weight").value = weight.toFixed(1);
  
  updateProfileTabs();
  renderAll();

  await pushToCloud({ action: "saveEntry", entry: entryObj });
  await checkAndUnlockMilestones();
}

async function deleteEntry(date) {
  if (!confirm(`Messung vom ${formatDE(date)} (${currentTab}) löschen?`)) return;
  const entries = getEntries().filter(e => e.date !== date);
  localStorage.setItem(entriesKey(), JSON.stringify(entries));
  
  updateProfileTabs();
  renderAll();

  await pushToCloud({ action: "deleteEntry", date });
}

function editEntry(date, weight) {
  document.getElementById("entry-date").value = date;
  document.getElementById("entry-weight").value = weight.toFixed(1);
  window.scrollTo({ top: 0, behavior: "smooth" });
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

function renderAll() {
  const goals = getGoals();
  const entries = getEntries();

  renderTrophyShelf();

  if (goals) {
    document.getElementById("st-goal").innerText = `${goals.goalWeight.toFixed(1)} kg`;
    document.getElementById("st-goal-date").innerText = `bis ${formatDE(goals.endDate)}`;
  }

  const histEl = document.getElementById("history-list");
  histEl.innerHTML = [...entries].reverse().map(e => `
    <div class="hist-item">
      <div onclick="editEntry('${e.date}', ${e.weight})" style="cursor:pointer;">
        <strong>${formatDE(e.date)}</strong> &nbsp;·&nbsp; ${e.weight.toFixed(1)} kg
      </div>
      <button class="btn-danger" onclick="deleteEntry('${e.date}')">Löschen</button>
    </div>
  `).join("");

  if (entries.length === 0) {
    if (chartInstance) chartInstance.destroy();
    return;
  }

  const latest = entries[entries.length - 1];
  const targetToday = calcTargetAt(latest.date, goals);
  const diff = latest.weight - targetToday;
  const isLossGoal = goals.goalWeight <= goals.startWeight;
  const onTrack = isLossGoal ? diff <= 0 : diff >= 0;

  // --- KACHEL 1: SOLL-ABWEICHUNG ---
  const tileStatus = document.getElementById("tile-status");
  tileStatus.className = `stat-tile ${onTrack ? "status-good" : "status-bad"}`;
  const sign = diff > 0 ? "+" : "";
  const statusShort = onTrack ? (isLossGoal ? "unter Soll" : "im Plan") : (isLossGoal ? "über Soll" : "unter Soll");
  document.getElementById("st-diff").innerText = `${sign}${diff.toFixed(2)} kg`;
  document.getElementById("st-target").innerText = `Soll: ${targetToday.toFixed(2)} kg (${statusShort})`;

  // --- KACHEL 2: LETZTE 7 TAGE VS. DAVORIGE 7 TAGE ---
  const comp7 = calculate7DayComparison(currentTab);
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

  // --- KACHEL 3: WOCHENTEMPO ---
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

  // --- FORTSCHRITTS-KARTE ---
  const rawPct = calculateProgressPct(currentTab);
  const clampedPct = Math.max(0, Math.min(100, rawPct));
  const remainingKg = Math.max(0, isLossGoal ? (latest.weight - goals.goalWeight) : (goals.goalWeight - latest.weight));

  document.getElementById("prog-pct").innerText = `${Math.round(rawPct)} % geschafft`;
  document.getElementById("prog-rem").innerText = remainingKg === 0 ? "Ziel erreicht! 🎉" : `noch ${remainingKg.toFixed(1)} kg`;
  const progFill = document.getElementById("prog-fill");
  progFill.style.width = `${clampedPct}%`;
  progFill.className = `progress-fill ${onTrack ? "good" : "bad"}`;

  // --- CHART DATEN & ZOOM ---
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
          type: "time",
          min: xMin,
          max: xMax,
          time: { unit: "day", tooltipFormat: "dd.MM.yyyy" },
          grid: { color: gridColor },
          ticks: {
            maxTicksLimit: 6,
            font: { size: 10 },
            color: tickColor,
            callback: (val) => new Date(val).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
          }
        },
        y: {
          grid: { color: gridColor },
          ticks: { font: { size: 10 }, color: tickColor }
        }
      }
    }
  });
}

init();
