import {
  state,
  persistStore,
  getProfileData,
  getUnlockedRewards,
  calculateStreak,
  calculateProgressPct,
  getMaxUserGroupStreak,
  haptic
} from "./state.js";
import { callAuthedApi } from "./api.js";

let rewardQueue = [];

export function getMilestoneDefinitions(prof) {
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
      tag: "GRUPPEN-STREAK · 10 TAGE", modalIcon: "💪", title: "10 Tage im Gleichschritt!",
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

export function renderTrophyShelf(prof) {
  const unlocked = new Set(getUnlockedRewards(prof));
  const defs = getMilestoneDefinitions(prof);
  const unlockedCount = defs.filter((d) => unlocked.has(d.id)).length;

  document.getElementById("trophy-count").innerText = `${unlockedCount} / ${defs.length}`;
  document.getElementById("trophy-grid").innerHTML = defs
    .map((m) => {
      const isUnlocked = unlocked.has(m.id);
      const clickAttr = isUnlocked ? `onclick="previewReward('${prof}', '${m.id}')"` : "";
      return `
        <div class="trophy-item ${isUnlocked ? "unlocked" : ""}" ${clickAttr} title="${m.title}">
          <div class="trophy-icon">${m.shelfIcon}</div>
          <div class="trophy-label">${m.shelfLabel}</div>
        </div>
      `;
    })
    .join("");
}

export function previewReward(prof, rewardId) {
  const def = getMilestoneDefinitions(prof).find((m) => m.id === rewardId);
  if (def) {
    haptic(10);
    showRewardPopup(def, false, prof);
  }
}

export async function checkAndUnlockMilestones() {
  if (!state.authSession || !state.appStore) return;
  const prof = state.authSession.username;
  const streak = calculateStreak(prof);
  const pct = calculateProgressPct(prof);
  const maxGroupStreak = getMaxUserGroupStreak(prof);
  const myData = getProfileData(prof);
  const unlocked = myData.rewards || [];
  const defs = getMilestoneDefinitions(prof);

  const newlyUnlocked = [];
  for (const m of defs) {
    if (unlocked.includes(m.id)) continue;
    const hit =
      (m.type === "streak" && streak >= m.threshold) ||
      (m.type === "pct" && pct >= m.threshold) ||
      (m.type === "group_streak" && maxGroupStreak >= m.threshold);
    if (hit) {
      unlocked.push(m.id);
      newlyUnlocked.push(m);
    }
  }

  if (newlyUnlocked.length > 0) {
    myData.rewards = unlocked;
    persistStore();
    if (state.viewedProfile === prof) {
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
  showRewardPopup(rewardQueue.shift(), true, state.authSession.username);
}

export function showRewardPopup(milestone, withConfetti = true, prof = state.viewedProfile) {
  document.getElementById("modal-icon").innerText = milestone.modalIcon;
  document.getElementById("modal-tag").innerText = milestone.tag;
  document.getElementById("modal-title").innerText = milestone.title;
  document.getElementById("modal-text").innerText = milestone.text;
  document.getElementById("reward-modal").classList.remove("hidden");

  if (withConfetti) {
    haptic([30, 50, 40, 50, 70]);
    launchConfetti(prof === "Hannah" ? ["❤️", "😘", "✨", "🎉"] : ["🔥", "🏆", "⭐", "🎉"]);
  }
}

export function closeRewardModal() {
  haptic(10);
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
