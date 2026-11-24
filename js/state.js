export const HOLD_TOLERANCE_KG = 1.0;

export const state = {
  authSession: JSON.parse(localStorage.getItem("wt_auth_session") || "null"),
  appStore: JSON.parse(localStorage.getItem("wt_app_store") || "null"),
  activeMainTab: "verlauf", // "verlauf" | "trophies" | "team"
  viewedProfile: null,
  openedFromTeam: false,
  showAllHistory: false,
  chartZoom: localStorage.getItem("wt_chart_zoom") || "all",
  teamChartZoom: localStorage.getItem("wt_team_chart_zoom") || "all",
  teamSortBy: localStorage.getItem("wt_team_sort") || "streak",
  setupMode: "goal",
  lastSyncTime: 0,
  isSyncing: false
};

export function haptic(pattern = 10) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }
}

export function persistAuth() {
  if (state.authSession) {
    localStorage.setItem("wt_auth_session", JSON.stringify(state.authSession));
  } else {
    localStorage.removeItem("wt_auth_session");
  }
}

export function persistStore() {
  if (state.appStore) {
    localStorage.setItem("wt_app_store", JSON.stringify(state.appStore));
  } else {
    localStorage.removeItem("wt_app_store");
  }
}

export function isOwnProfile() {
  return Boolean(state.authSession && state.viewedProfile === state.authSession.username);
}

export function isMaintenanceMode(goals) {
  if (!goals) return false;
  return Math.abs(goals.startWeight - goals.goalWeight) < 0.05;
}

export function getProfileData(prof = state.viewedProfile) {
  if (!state.appStore || !state.appStore.profiles || !state.appStore.profiles[prof]) {
    return { username: prof, shareTeam: false, goals: null, entries: [], rewards: [] };
  }
  const p = state.appStore.profiles[prof];
  p.entries = (p.entries || []).sort((a, b) => a.date.localeCompare(b.date));
  return p;
}

export function getGoals(prof = state.viewedProfile) {
  return getProfileData(prof).goals;
}

export function getEntries(prof = state.viewedProfile) {
  return getProfileData(prof).entries;
}

export function getUnlockedRewards(prof = state.viewedProfile) {
  return getProfileData(prof).rewards || [];
}

export function getTeamMembers() {
  if (!state.appStore || !state.appStore.profiles) return [];
  return Object.values(state.appStore.profiles).filter((p) => p.shareTeam);
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(isoStr, days) {
  const d = new Date(isoStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function formatDE(dateInput) {
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

export function calcTargetAt(dateStr, goals) {
  if (isMaintenanceMode(goals)) return goals.goalWeight;
  const dStart = new Date(goals.startDate);
  const dEnd = new Date(goals.endDate);
  const dCurr = new Date(dateStr);
  const totalDays = (dEnd - dStart) / 86400000;
  if (totalDays <= 0) return goals.goalWeight;
  const passed = (dCurr - dStart) / 86400000;
  return goals.startWeight + (goals.goalWeight - goals.startWeight) * (passed / totalDays);
}

export function calculateStreak(prof) {
  const entries = getEntries(prof);
  if (entries.length === 0) return 0;

  const dateSet = new Set(entries.map((e) => e.date));
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

export function calculateSubgroupStats(memberNames) {
  if (!Array.isArray(memberNames) || memberNames.length === 0) {
    return { current: 0, best: 0 };
  }

  const dateSets = memberNames.map((name) => new Set(getEntries(name).map((e) => e.date)));
  if (dateSets.some((s) => s.size === 0)) {
    return { current: 0, best: 0 };
  }

  let commonDates = new Set(dateSets[0]);
  for (let i = 1; i < dateSets.length; i++) {
    commonDates = new Set([...commonDates].filter((d) => dateSets[i].has(d)));
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

export function getMaxUserGroupStreak(prof) {
  if (!state.appStore || !Array.isArray(state.appStore.subgroups)) return 0;
  let maxBest = 0;
  for (const sg of state.appStore.subgroups) {
    if (Array.isArray(sg.members) && sg.members.includes(prof)) {
      const stats = calculateSubgroupStats(sg.members);
      if (stats.best > maxBest) maxBest = stats.best;
    }
  }
  return maxBest;
}

export function calculateProgressPctForWeight(weight, goals) {
  if (!goals) return 0;
  if (isMaintenanceMode(goals)) {
    const dev = Math.abs(weight - goals.goalWeight);
    if (dev <= HOLD_TOLERANCE_KG) return 100;
    return Math.max(0, 100 - (dev - HOLD_TOLERANCE_KG) * 20);
  }
  const isLossGoal = goals.goalWeight <= goals.startWeight;
  const totalDelta = Math.abs(goals.startWeight - goals.goalWeight);
  if (totalDelta <= 0) return 0;
  const achievedDelta = isLossGoal ? goals.startWeight - weight : weight - goals.startWeight;
  return (achievedDelta / totalDelta) * 100;
}

export function calculateProgressPct(prof) {
  const goals = getGoals(prof);
  const entries = getEntries(prof);
  if (!goals || entries.length === 0) return 0;
  return calculateProgressPctForWeight(entries[entries.length - 1].weight, goals);
}

export function calculate7DayComparison(prof) {
  const entries = getEntries(prof);
  const today = todayISO();
  const startCurr = addDaysISO(today, -6);
  const startPrev = addDaysISO(today, -13);

  const currEntries = entries.filter((e) => e.date >= startCurr && e.date <= today);
  const prevEntries = entries.filter((e) => e.date >= startPrev && e.date < startCurr);

  const avgCurr = currEntries.length > 0 ? currEntries.reduce((s, e) => s + e.weight, 0) / currEntries.length : null;
  const avgPrev = prevEntries.length > 0 ? prevEntries.reduce((s, e) => s + e.weight, 0) / prevEntries.length : null;

  return { avgCurr, avgPrev, countCurr: currEntries.length, countPrev: prevEntries.length };
}
