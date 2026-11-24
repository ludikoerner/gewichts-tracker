import {
  state,
  HOLD_TOLERANCE_KG,
  isMaintenanceMode,
  getGoals,
  getEntries,
  getTeamMembers,
  todayISO,
  addDaysISO,
  formatDE,
  calcTargetAt,
  calculateProgressPctForWeight,
  haptic
} from "./state.js";

let chartInstance = null;
let teamChartInstance = null;

export function destroyWeightChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

export function setZoom(mode) {
  haptic(10);
  state.chartZoom = mode;
  localStorage.setItem("wt_chart_zoom", mode);
  document.getElementById("zoom-all").classList.toggle("active", mode === "all");
  document.getElementById("zoom-30").classList.toggle("active", mode === "30");
  if (state.viewedProfile) {
    renderWeightChart(state.viewedProfile);
  }
}

export function setTeamZoom(mode) {
  haptic(10);
  state.teamChartZoom = mode;
  localStorage.setItem("wt_team_chart_zoom", mode);
  document.getElementById("team-zoom-all").classList.toggle("active", mode === "all");
  document.getElementById("team-zoom-30").classList.toggle("active", mode === "30");
  if (state.activeMainTab === "team") {
    renderTeamChart();
  }
}

export function renderWeightChart(prof) {
  const ctxEl = document.getElementById("weightChart");
  if (!ctxEl || typeof Chart === "undefined") return;

  const goals = getGoals(prof);
  const entries = getEntries(prof);
  if (!goals || entries.length === 0) {
    destroyWeightChart();
    return;
  }

  const holdMode = isMaintenanceMode(goals);
  const latest = entries[entries.length - 1];

  const trendValues = entries.map((_, i) => {
    const slice = entries.slice(Math.max(0, i - 6), i + 1);
    return slice.reduce((s, e) => s + e.weight, 0) / slice.length;
  });

  let prognosisPoint = null;
  if (!holdMode && entries.length >= 2) {
    const winLen = Math.min(7, entries.length);
    const dRef = new Date(entries[entries.length - winLen].date);
    const dLast = new Date(latest.date);
    const daysDiff = (dLast - dRef) / 86400000;
    const gRef = trendValues[trendValues.length - winLen];
    const gLast = trendValues[trendValues.length - 1];
    if (daysDiff > 0) {
      const slopePerDay = (gLast - gRef) / daysDiff;
      const remDays = (new Date(goals.endDate) - dLast) / 86400000;
      if (remDays > 0) {
        prognosisPoint = { date: goals.endDate, weight: gLast + slopePerDay * remDays };
      }
    }
  }

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  const linePrimary = isDark ? "#3b82f6" : "#2563eb";

  let xMin = undefined;
  let xMax = undefined;
  const firstDate = entries[0].date;
  const lastChartDate = holdMode
    ? (latest.date > todayISO() ? latest.date : todayISO())
    : goals.endDate;

  let sollStart = holdMode ? firstDate : goals.startDate;
  let sollEnd = lastChartDate;

  if (state.chartZoom === "30") {
    const thirtyDaysAgo = addDaysISO(todayISO(), -30);
    xMin = thirtyDaysAgo > sollStart ? thirtyDaysAgo : sollStart;
    xMax = addDaysISO(todayISO(), 3);
    if (!holdMode && xMax > goals.endDate) xMax = goals.endDate;
    sollStart = xMin;
    sollEnd = xMax;
  }

  const sollData = [
    { x: sollStart, y: calcTargetAt(sollStart, goals) },
    { x: sollEnd, y: calcTargetAt(sollEnd, goals) }
  ];

  const istData = entries.map((e) => ({ x: e.date, y: e.weight }));
  const trendData = entries.map((e, idx) => ({ x: e.date, y: trendValues[idx] }));
  const progData = (!holdMode && prognosisPoint && state.chartZoom === "all")
    ? [{ x: latest.date, y: trendValues[trendValues.length - 1] }, { x: prognosisPoint.date, y: prognosisPoint.weight }]
    : [];

  const datasets = [
    {
      label: holdMode ? "Haltegewicht" : "Soll",
      data: sollData,
      borderColor: holdMode ? "#16a34a" : "#94a3b8",
      borderDash: [6, 6],
      borderWidth: 2,
      pointRadius: 0
    },
    {
      label: "Messwerte",
      data: istData,
      borderColor: linePrimary,
      backgroundColor: linePrimary,
      borderWidth: 1.5,
      pointRadius: 3
    },
    {
      label: "7-Tage-Trend",
      data: trendData,
      borderColor: "#f97316",
      borderWidth: 2.8,
      pointRadius: 0,
      tension: 0.4,
      cubicInterpolationMode: "monotone"
    }
  ];

  if (holdMode) {
    datasets.push(
      {
        label: "Korridor (+1 kg)",
        data: [
          { x: sollStart, y: goals.goalWeight + HOLD_TOLERANCE_KG },
          { x: sollEnd, y: goals.goalWeight + HOLD_TOLERANCE_KG }
        ],
        borderColor: "rgba(34, 197, 94, 0.35)",
        borderDash: [3, 3],
        borderWidth: 1,
        pointRadius: 0
      },
      {
        label: "Korridor (-1 kg)",
        data: [
          { x: sollStart, y: goals.goalWeight - HOLD_TOLERANCE_KG },
          { x: sollEnd, y: goals.goalWeight - HOLD_TOLERANCE_KG }
        ],
        borderColor: "rgba(34, 197, 94, 0.35)",
        backgroundColor: "rgba(34, 197, 94, 0.08)",
        fill: "-1",
        borderDash: [3, 3],
        borderWidth: 1,
        pointRadius: 0
      }
    );
  } else if (progData.length > 0) {
    datasets.push({
      label: "Prognose",
      data: progData,
      borderColor: "#f97316",
      borderDash: [4, 4],
      borderWidth: 2,
      pointRadius: 0
    });
  }

  destroyWeightChart();
  chartInstance = new Chart(ctxEl.getContext("2d"), {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            boxWidth: 12,
            font: { size: 11 },
            color: tickColor,
            filter: (item) => !item.text.startsWith("Korridor")
          }
        },
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
        y: { grid: { color: gridColor }, ticks: { font: { size: 10 }, color: tickColor } }
      }
    }
  });
}

export function renderTeamChart() {
  const ctx = document.getElementById("teamChart");
  if (!ctx || typeof Chart === "undefined") return;

  const activeMembers = getTeamMembers().filter((m) => m.goals && m.entries && m.entries.length > 0);
  if (activeMembers.length === 0) {
    if (teamChartInstance) {
      teamChartInstance.destroy();
      teamChartInstance = null;
    }
    return;
  }

  const preparedMembers = activeMembers.map((m) => {
    const sorted = [...m.entries].sort((a, b) => a.date.localeCompare(b.date));
    const trendEntries = sorted.map((e, i) => {
      const slice = sorted.slice(Math.max(0, i - 6), i + 1);
      const avg = slice.reduce((s, x) => s + x.weight, 0) / slice.length;
      return { date: e.date, weight: avg };
    });
    return { goals: m.goals, rawEntries: sorted, trendEntries };
  });

  const allDatesSet = new Set();
  preparedMembers.forEach((pm) => pm.rawEntries.forEach((e) => allDatesSet.add(e.date)));
  const sortedDates = Array.from(allDatesSet).sort();

  const rawTeamSeries = [];
  const smoothTeamSeries = [];

  for (const date of sortedDates) {
    let sumRawPct = 0;
    let sumTrendPct = 0;

    for (const pm of preparedMembers) {
      let lastRaw = null;
      for (const e of pm.rawEntries) {
        if (e.date <= date) lastRaw = e;
        else break;
      }
      const rawW = lastRaw ? lastRaw.weight : pm.goals.startWeight;
      sumRawPct += Math.max(0, Math.min(100, calculateProgressPctForWeight(rawW, pm.goals)));

      let lastTrend = null;
      for (const te of pm.trendEntries) {
        if (te.date <= date) lastTrend = te;
        else break;
      }
      const trendW = lastTrend ? lastTrend.weight : pm.goals.startWeight;
      sumTrendPct += Math.max(0, Math.min(100, calculateProgressPctForWeight(trendW, pm.goals)));
    }

    rawTeamSeries.push({ x: date, y: Math.round((sumRawPct / preparedMembers.length) * 10) / 10 });
    smoothTeamSeries.push({ x: date, y: Math.round((sumTrendPct / preparedMembers.length) * 10) / 10 });
  }

  const minStart = activeMembers.reduce((min, m) => (m.goals.startDate < min ? m.goals.startDate : min), activeMembers[0].goals.startDate);
  const maxEnd = activeMembers.reduce((max, m) => (m.goals.endDate > max ? m.goals.endDate : max), activeMembers[0].goals.endDate);

  let xMin = undefined;
  let xMax = undefined;
  let sollData = [{ x: minStart, y: 0 }, { x: maxEnd, y: 100 }];

  if (state.teamChartZoom === "30") {
    const thirtyDaysAgo = addDaysISO(todayISO(), -30);
    xMin = thirtyDaysAgo > minStart ? thirtyDaysAgo : minStart;
    xMax = addDaysISO(todayISO(), 3);
    if (xMax > maxEnd) xMax = maxEnd;

    const totalSpan = (new Date(maxEnd) - new Date(minStart)) / 86400000;
    const pctAtMin = totalSpan > 0 ? Math.max(0, Math.min(100, ((new Date(xMin) - new Date(minStart)) / 86400000 / totalSpan) * 100)) : 0;
    const pctAtMax = totalSpan > 0 ? Math.max(0, Math.min(100, ((new Date(xMax) - new Date(minStart)) / 86400000 / totalSpan) * 100)) : 100;
    sollData = [{ x: xMin, y: pctAtMin }, { x: xMax, y: pctAtMax }];
  }

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
          data: sollData,
          borderColor: "#94a3b8",
          borderDash: [6, 6],
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Tageswerte",
          data: rawTeamSeries,
          borderColor: "rgba(139, 92, 246, 0.28)",
          borderWidth: 1.5,
          pointRadius: 2,
          pointBackgroundColor: "rgba(139, 92, 246, 0.35)"
        },
        {
          label: "Team-Trend",
          data: smoothTeamSeries,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.14)",
          fill: true,
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.4,
          cubicInterpolationMode: "monotone"
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
          min: 0,
          max: 100,
          grid: { color: gridColor },
          ticks: { font: { size: 10 }, color: tickColor, callback: (val) => `${val} %` }
        }
      }
    }
  });
}
