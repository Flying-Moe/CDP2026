console.log("stats.js loaded");

/* =========================
   LOCAL / CORE IMPORTS
========================= */

import {
  calculateAgeAtDeath,
  calculateHitPoints,
  calculatePlayerTotals,
  buildScoreTable
} from "./admin.core.js";

import { evaluateBadges } from "./badges.engine.js";

import { db } from "./firebase.js";

/* =========================
   EXTERNAL LIBRARIES FIREBASE
========================= */

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   HELPERS
===================================================== */

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/* =====================================================
   TAB SYSTEM (FIXED)
===================================================== */

function initTabs() {
  const buttons = document.querySelectorAll("#stats-tabs button");
  const tabs = document.querySelectorAll(".stats-tab");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      tabs.forEach(t => t.style.display = "none");
      const target = document.getElementById(`stats-${btn.dataset.tab}`);
      if (target) target.style.display = "block";
    });
  });

  // Force default
  buttons.forEach(b => b.classList.remove("active"));
  tabs.forEach(t => t.style.display = "none");

  const defaultBtn = document.querySelector('#stats-tabs button[data-tab="overall"]');
  const defaultTab = document.getElementById("stats-overall");
  if (defaultBtn && defaultTab) {
    defaultBtn.classList.add("active");
    defaultTab.style.display = "block";
  }
}

/* =====================================================
   RENDER BADGES
===================================================== */

function renderBadges(players) {
  const host = document.getElementById("badges-stats");
  if (!host) return;

  const scoreTable = buildScoreTable(players, "2026");

  const unlockedBadges = evaluateBadges(
    scoreTable.map(p => ({
      name: p.name,
      hits: p.hits,
      totalScore: p.total
    }))
  );

  if (!unlockedBadges.length) {
    host.innerHTML = `<p class="muted">No badges have been unlocked yet.</p>`;
    return;
  }

  const tierSuffix = {
    bronze: "r1_c1",
    silver: "r1_c2",
    gold: "r2_c1",
    prestige: "r2_c2"
  };

  host.innerHTML = `
    <p class="muted">
      Grim Reaper’s Ledger — unlocked achievements earned through play.
    </p>

    ${unlockedBadges.map(badge => {
      const imgSrc =
        `/assets/badges/${badge.id}_${tierSuffix[badge.tier]}_processed_by_imagy.png`;

      const winnersHtml = badge.winners
        .map(w => `<span>${w.name} (${w.value})</span>`)
        .join("<br>");

      return `
        <div class="badge">
          <div class="badge-image">
            <img src="${imgSrc}" alt="${badge.name} ${badge.tier}">
          </div>
          <div class="badge-content">
            <div class="badge-title">${badge.name}</div>
            <div class="badge-description"><em>${badge.description}</em></div>
            <div class="badge-tier">${badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1)}</div>
            <div class="badge-winners">${winnersHtml}</div>
          </div>
        </div>
      `;
    }).join("")}
  `;
}

/* =====================================================
   RENDER DEATH STATS
===================================================== */

function renderDeathStatsFromPlayers(players, peopleMap) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  const deathMap = new Map();

  players.forEach(player => {
    const entry = player.entries?.["2026"];
    if (!entry || entry.active === false) return;

    (entry.picks || []).forEach(pick => {
      if (!pick.deathDate) return;

      const key = pick.personId || pick.normalizedName;
      if (!key) return;

      if (!deathMap.has(key)) {
deathMap.set(key, {
  name:
    (pick.personId && peopleMap[pick.personId]?.name) ||
    pick.normalizedName ||
    "Unknown",
  birthDate: pick.birthDate,
  deathDate: pick.deathDate,
  players: new Set()
});

      }

      deathMap.get(key).players.add(player.name);
    });
  });

  const deaths = Array.from(deathMap.values());

  if (deaths.length === 0) {
    set("stat-deaths-count", "0");
    set("stat-deaths-average-age", "—");
    set("stat-deaths-youngest", "—");
    set("stat-deaths-oldest", "—");
    set("stat-deaths-first-blood", "—");
    return;
  }

  const deathsWithAge = deaths
    .map(d => {
      const age = calculateAgeAtDeath(d.birthDate, d.deathDate);
      return age != null ? { ...d, age } : null;
    })
    .filter(Boolean);

  set("stat-deaths-count", deathsWithAge.length);

  const avgAge = (
    deathsWithAge.reduce((sum, d) => sum + d.age, 0) /
    deathsWithAge.length
  ).toFixed(1);

  set("stat-deaths-average-age", avgAge);

  const youngest = deathsWithAge.reduce((a, b) => a.age < b.age ? a : b);
  const oldest   = deathsWithAge.reduce((a, b) => a.age > b.age ? a : b);

  set("stat-deaths-youngest", `${youngest.name} (${youngest.age})`);
  set("stat-deaths-oldest", `${oldest.name} (${oldest.age})`);

  const first = deathsWithAge.reduce((a, b) =>
    new Date(a.deathDate) < new Date(b.deathDate) ? a : b
  );

  set(
    "stat-deaths-first-blood",
    `${first.name} – ${first.deathDate} (${[...first.players].join(", ")})`
  );
}

/* =====================================================
   RENDER HALL OF FAME
===================================================== */

function renderHall() {
  const el = document.getElementById("stats-hof");
  if (!el) return;

  el.innerHTML = `
    <p class="muted">Hall of Fame will be unlocked once the season is finalized.</p>
  `;
}


/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  initTabs();

  // Overall is standalone and read-only
  renderOverallStats();

  // Load all aggregated data
  const playersSnap = await getDocs(collection(db, "players"));

  const players = [];
  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    if (p.active === false) return;
    if (p.entries?.["2026"]?.active === false) return;

    players.push({
      id: pDoc.id,
      name: p.name,
      hits: p.hits || 0,
      entries: p.entries || {}
    });
  });

   /* =========================
   BADGES — DEBUG (TEMP)
========================= */

const scoreTable = buildScoreTable(players, "2026");

const unlockedBadges = evaluateBadges(
  scoreTable.map(p => ({
    name: p.name,
    hits: p.hits,
    totalScore: p.total
  }))
);

console.group("🏅 Unlocked Badges");
unlockedBadges.forEach(b => {
  console.log(
    `${b.name} [${b.tier.toUpperCase()}]`,
    b.winners.map(w => `${w.name} (${w.value})`).join(", ")
  );
});
console.groupEnd();

   
    const peopleSnap = await getDocs(collection(db, "people"));
  const peopleMap = {};

    peopleSnap.forEach(doc => {
      peopleMap[doc.id] = doc.data();
    });

    renderDeathStatsFromPlayers(players, peopleMap);
    renderFunStats(players, peopleMap);
    renderBadges(players, peopleMap);

  renderHall();
});

/* =====================================================
   RENDER OVERALL STATS
===================================================== */

async function renderOverallStats() {
  const playersSnap = await getDocs(collection(db, "players"));

  let activePlayers = 0;
  let totalPicks = 0;
  let totalCelebrityPicks = 0;
  const uniqueCelebrities = new Set();
  let julySweepUsers = 0;

  playersSnap.forEach(docu => {
    const p = docu.data();
    if (p.active === false) return;

    activePlayers++;

    const entry = p.entries?.["2026"];
    if (!entry) return;

    const picks = entry.picks || [];

    totalPicks += picks.length;
    totalCelebrityPicks += picks.length;

    if (entry.usedJulySweep === true) {
      julySweepUsers++;
    }

    picks.forEach(pick => {
      if (pick.personId) {
        uniqueCelebrities.add(pick.personId);
      } else if (pick.normalizedName) {
        uniqueCelebrities.add(pick.normalizedName);
      }
    });
  });

  const prizePool =
    activePlayers * 15 + julySweepUsers * 15;

  // Update DOM (match existing HTML)
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set("stat-active-players", activePlayers);
  set("stat-total-picks", totalPicks);
  set("stat-total-celebrity-picks", totalCelebrityPicks);
  set("stat-unique-celebrities", uniqueCelebrities.size);
  set("stat-prize-pool", prizePool);
}

/* =====================================================
   RENDER FUN STATS
===================================================== */

function renderFunStats(players, peopleMap) {
  const scores = buildScoreTable(players, "2026");

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  /* Most picked celebrity */
  const pickCount = {};
  scores.forEach(s => {
    s.picks.forEach(pick => {
      if (pick.status !== "approved") return;
      const key = pick.personId || pick.normalizedName;
      pickCount[key] = (pickCount[key] || 0) + 1;
    });
  });

  const mostPickedKey = Object.keys(pickCount).sort(
    (a, b) => pickCount[b] - pickCount[a]
  )[0];

  set(
    "stat-fun-most-picked",
    mostPickedKey
      ? `${peopleMap[mostPickedKey]?.name || mostPickedKey} (${pickCount[mostPickedKey]})`
      : "—"
  );

  /* Highest single score */
  let highest = null;

  scores.forEach(s => {
    s.picks.forEach(pick => {
      if (!pick.birthDate || !pick.deathDate || pick.status !== "approved") return;
      const pts = calculateHitPoints(pick.birthDate, pick.deathDate);
      if (!highest || pts > highest.points) {
        highest = {
          player: s.name,
          person:
            (pick.personId && peopleMap[pick.personId]?.name) ||
            pick.normalizedName ||
            "Unknown",
          points: pts
        };
      }
    });
  });

  set(
    "stat-fun-highest-score",
    highest
      ? `${highest.player} – ${highest.person} (${highest.points})`
      : "—"
  );

  /* Most penalties */
  const worstPenalty = Math.min(...scores.map(s => s.penalty));
  const penaltyPlayers = scores.filter(s => s.penalty === worstPenalty && worstPenalty < 0);

  set(
    "stat-fun-most-penalties",
    penaltyPlayers.length
      ? penaltyPlayers.map(p => `${p.name} (${p.penalty})`).join(", ")
      : "—"
  );

  /* Placeholder stats (not implemented yet) */
  set("stat-fun-controversial", "—");
  set("stat-fun-unlucky", "—");
}
