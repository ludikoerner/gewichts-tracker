// HIER DEINE GOOGLE APPS SCRIPT WEB-APP-URL EINFÜGEN:
const API_URL = "DEINE_WEB_APP_URL_HIER_EINFUEGEN";

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

let currentProfile = localStorage.getItem("wt_active_profile") || "Ludwig";
let chartZoom = localStorage.getItem("wt_chart_zoom") || "all";
let chartInstance = null;

function goalsKey() { return `wt_goals_${currentProfile}`; }
function entriesKey() { return `wt_entries_${currentProfile}`; }

function setSyncBadge(text, isOk = false) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.innerText = text;
  el.className = isOk ? "sync-badge sync-ok" : "sync-badge";
}

function updateProfileTabs() {
  document.getElementById("tab-Ludwig").classList.toggle("active", currentProfile === "Ludwig");
  document.getElementById("tab-Hannah").classList.toggle("active", currentProfile === "Hannah");
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

async function switchProfile(profile) {
  currentProfile = profile;
  localStorage.setItem("wt_active_profile", profile);
  updateProfileTabs();
  
  if (getGoals()) {
    showApp(false);
  } else {
    openSetup();
  }
  await syncFromCloud();
}

async function syncFromCloud() {
  if (!API_URL.startsWith("http")) {
    setSyncBadge("Nur lokal (API_URL fehlt)");
    return;
  }
  const targetProfile = currentProfile;
  setSyncBadge(`Lade ${targetProfile} aus Cloud...`);
  try {
    const url = `${API_URL}?profile=${encodeURIComponent(targetProfile)}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (targetProfile !== currentProfile) return;

    if (data.goals) {
      localStorage.setItem(goalsKey(), JSON.stringify(data.goals));
    } else {
      localStorage.removeItem(goalsKey());
    }

    if (Array.isArray(data.entries)) {
      localStorage.setItem(entriesKey(), JSON.stringify(data.entries));
    }

    setSyncBadge(`✓ ${targetProfile} synchronisiert`, true);
    if (getGoals()) {
      showApp(false);
    } else {
      openSetup();
    }
  } catch (err) {
    setSyncBadge("Offline-Modus (lokale Daten)");
  }
}

async function pushToCloud(payload) {
  if (!API_URL.startsWith("http")) return;
  payload.profile = currentProfile;
  setSyncBadge(`Speichere (${currentProfile})...`);
  try {
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });
    setSyncBadge(`✓ ${currentProfile} gespeichert`, true);
  } catch (err) {
    setSyncBadge("Fehler beim Cloud-Sync");
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
  if (getGoals()) renderAll();
});

function getGoals() {
  const raw = localStorage.getItem(goalsKey());
  return raw ? JSON.parse(raw) : null;
}

function getEntries() {
  const raw = localStorage.getItem(entriesKey());
  const list = raw ? JSON.parse(raw) : [];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

async function init() {
  updateProfileTabs();
  document.getElementById("zoom-all").classList.toggle("active", chartZoom === "all");
  document.getElementById("zoom-30").classList.toggle("active", chartZoom === "30");

  if (getGoals()) {
    showApp(false);
  } else {
    openSetup();
  }
  await syncFromCloud();
}

function openSetup() {
  document.getElementById("setup-view").classList.remove("hidden");
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("btn-edit-goals").classList.add("hidden");
  document.getElementById("goal-subtitle").innerText = `Setup für ${currentProfile}`;
  document.getElementById("setup-heading").innerText = `Ziele festlegen (${currentProfile})`;

  const goals = getGoals();
  document.getElementById("setup-start-date").value = goals ? goals.startDate : todayISO();
  document.getElementById("setup-end-date").value = goals ? goals.endDate : "2026-12-31";
  document.getElementById("setup-start-weight").value = goals ? goals.startWeight : "";
  document.getElementById("setup-goal-weight").value = goals ? goals.goalWeight : "";
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
  showApp(false);
}

function showApp(triggerSync = true) {
  document.getElementById("setup-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");
  document.getElementById("btn-edit-goals").classList.remove("hidden");
  document.getElementById("entry-date").value = todayISO();
  
  const goals = getGoals();
  document.getElementById("goal-subtitle").innerText = `Ziel (${currentProfile}): ${goals.goalWeight.toFixed(1)} kg bis ${formatDE(goals.endDate)}`;
  document.getElementById("hist-heading").innerText = `Letzte Messungen (${currentProfile})`;

  const entries = getEntries();
  if (entries.length > 0) {
    document.getElementById("entry-weight").value = entries[entries.length - 1].weight.toFixed(1);
  } else {
    document.getElementById("entry-weight").value = "";
  }

  renderAll();
  if (triggerSync) syncFromCloud();
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
  renderAll();

  await pushToCloud({ action: "saveEntry", entry: entryObj });
}

async function deleteEntry(date) {
  if (!confirm(`Messung vom ${formatDE(date)} (${currentProfile}) löschen?`)) return;
  const entries = getEntries().filter(e => e.date !== date);
  localStorage.setItem(entriesKey(), JSON.stringify(entries));
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

  const last7 = entries.slice(-7);
  const avg7 = last7.reduce((s, e) => s + e.weight, 0) / last7.length;

  const trendValues = entries.map((_, i) => {
    const slice = entries.slice(Math.max(0, i - 6), i + 1);
    return slice.reduce((s, e) => s + e.weight, 0) / slice.length;
  });

  let rateText = "Tempo: mind. 2 Messungen nötig";
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
      const kcalLabel = kcalPerDay < 0 ? `Ø ${Math.abs(kcalPerDay)} kcal Defizit/Tag` : `Ø +${kcalPerDay} kcal Überschuss/Tag`;
      rateText = `Tempo: ${weekRate >= 0 ? "+" : ""}${weekRate.toFixed(2)} kg/Woche · ${kcalLabel}`;

      const remDays = (new Date(goals.endDate) - dLast) / 86400000;
      if (remDays > 0) {
        prognosisPoint = { date: goals.endDate, weight: gLast + slopePerDay * remDays };
      }
    }
  }

  const box = document.getElementById("status-box");
  box.className = `status-box ${onTrack ? "status-good" : "status-bad"}`;
  document.getElementById("st-title").innerText = `Status (${currentProfile}) vom ${formatDE(latest.date)}`;
  const sign = diff > 0 ? "+" : "";
  const label = onTrack ? (isLossGoal ? "leichter als Soll" : "im Plan") : (isLossGoal ? "schwerer als Soll" : "unter Soll");
  document.getElementById("st-diff").innerText = `${sign}${diff.toFixed(2)} kg (${label})`;
  document.getElementById("st-meta").innerHTML = `Soll: <strong>${targetToday.toFixed(2)} kg</strong> · Ø letzte ${last7.length}: <strong>${avg7.toFixed(2)} kg</strong><br>${rateText}`;

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

function exportCSV() {
  const entries = getEntries();
  let csv = "Datum;Gewicht\n" + entries.map(e => `${formatDE(e.date)};${e.weight}`).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gewichts_backup_${currentProfile}.csv`;
  a.click();
}

init();
