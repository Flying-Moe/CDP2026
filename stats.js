console.log("stats.js loaded");

import { db } from "./firebase.js";
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

function calculateAge(birthISO, refISO = new Date().toISOString()) {
  if (!birthISO) return null;
  const b = new Date(birthISO);
  const r = new Date(refISO);
  let age = r.getFullYear() - b.getFullYear();
  if (
    r.getMonth() < b.getMonth() ||
    (r.getMonth() === b.getMonth() && r.getDate() < b.getDate())
  ) age--;
  return age;
}

/* =====================================================
   BADGES (ALWAYS VISIBLE)
===================================================== */

const BADGES = [
  { id: "grim_favorite", icon: "🥇", name: "Grim’s Favorite", description: "Highest total score" },
  { id: "undertaker", icon: "☠️", name: "The Undertaker", description: "Most confirmed deaths" },
  { id: "vulture", icon: "🦅", name: "The Vulture", description: "Lowest average pick age" },
  { id: "pension_sniper", icon: "🐢", name: "The Pension Sniper", description: "Highest average pick age" },
  { id: "optimist", icon: "🪦", name: "The Optimist", description: "20 approved picks, no deaths" },
  { id: "glass_cannon", icon: "🧨", name: "Glass Cannon", description: "At least 2 minus points" },
  { id: "blood_thief", icon: "🩸", name: "Blood Thief", description: "First Blood without leading" }
];

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
   COMPUTE BADGES (TIES SUPPORTED)
===================================================== */

function computeBadges(players) {
  const out = {};

  function award(id, names) {
    out[id] = names;
  }

  const maxScore = Math.max(...players.map(p => p.score), 0);
  award("grim_favorite", players.filter(p => p.score === maxScore && maxScore > 0).map(p => p.name));

  const maxHits = Math.max(...players.map(p => p.hits), 0);
  award("undertaker", players.filter(p => p.hits === maxHits && maxHits > 0).map(p => p.name));

  const withAge = players.filter(p => p.avgAge > 0);
  if (withAge.length) {
    const minAge = Math.min(...withAge.map(p => p.avgAge));
    const maxAge = Math.max(...withAge.map(p => p.avgAge));
    award("vulture", withAge.filter(p => p.avgAge === minAge).map(p => p.name));
    award("pension_sniper", withAge.filter(p => p.avgAge === maxAge).map(p => p.name));
  }

  award("optimist", players.filter(p => p.approvedCount === 20 && p.hits === 0).map(p => p.name));
  award("glass_cannon", players.filter(p => p.minusPoints >= 2).map(p => p.name));
  award("blood_thief", players.filter(p => p.firstBlood && p.rank > 1).map(p => p.name));

  return out;
}

/* =====================================================
   RENDER (PLACEHOLDERS FIRST)
===================================================== */

function renderBadges(players, peopleMap) {
  const container = document.getElementById("stats-badges");
  if (!container) return;

  const badges = Array.from(container.querySelectorAll(".badge"));
  if (!badges.length) return;

  const scores = buildScoreTable(players, "2026");

  const setOwner = (index, text) => {
    const badge = badges[index];
    if (!badge) return;
    const owner = badge.querySelector(".badge-owner");
    if (owner) owner.innerHTML = text;
  };

  // 0 — The Vulture (lowest average pick age)
  const avgAges = scores.map(s => {
    const ages = s.picks
      .filter(p => p.birthDate)
      .map(p => new Date().getFullYear() - new Date(p.birthDate).getFullYear());
    if (!ages.length) return null;
    return { player: s.name, avg: ages.reduce((a, b) => a + b, 0) / ages.length };
  }).filter(Boolean);

  if (avgAges.length) {
    const lowest = Math.min(...avgAges.map(a => a.avg));
    const vulture = avgAges.filter(a => a.avg === lowest);
    setOwner(0, `<strong>${vulture.map(v => v.player).join(", ")}</strong>`);
  }

  // 1 — Blood Thief (first blood)
  let firstBlood = null;
  scores.forEach(s => {
    s.picks.forEach(p => {
      if (!p.deathDate || p.status !== "approved") return;
      const d = new Date(p.deathDate);
      if (!firstBlood || d < firstBlood.date) {
        firstBlood = { player: s.name, date: d };
      }
    });
  });

  if (firstBlood) {
    setOwner(1, `<strong>${firstBlood.player}</strong>`);
  }

  // 2 — Grim’s Favorite (highest total score)
  const maxScore = Math.max(...scores.map(s => s.total));
  if (maxScore > 0) {
    const favs = scores.filter(s => s.total === maxScore);
    setOwner(2, `<strong>${favs.map(f => f.name).join(", ")}</strong>`);
  }

  // 3 — The Undertaker (most hits)
  const maxHits = Math.max(...scores.map(s => s.hits));
  if (maxHits > 0) {
    const undertakers = scores.filter(s => s.hits === maxHits);
    setOwner(3, `<strong>${undertakers.map(u => u.name).join(", ")}</strong>`);
  }

  // 4 — Glass Cannon (highest single hit)
  let highestHit = null;
  scores.forEach(s => {
    s.picks.forEach(p => {
      if (!p.birthDate || !p.deathDate || p.status !== "approved") return;
      const pts = calculatePoints(p.birthDate, p.deathDate);
      if (!highestHit || pts > highestHit.points) {
        highestHit = { player: s.name, points: pts };
      }
    });
  });

  if (highestHit) {
    setOwner(4, `<strong>${highestHit.player}</strong>`);
  }
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
      const age = calculateAge(d.birthDate, d.deathDate);
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
  const el = document.getElementById("stats-hall");
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
  
    const peopleSnap = await getDocs(collection(db, "people"));
  const peopleMap = {};

    peopleSnap.forEach(doc => {
      peopleMap[doc.id] = doc.data();
    });

    renderDeathStatsFromPlayers(players, peopleMap);
    renderFunStats(players, peopleMap);
    renderBadges(players, peopleMap);


  // Badges + Hall
  const badgeWinners = computeBadges(players);
  renderBadges(badgeWinners);
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
      const pts = calculatePoints(pick.birthDate, pick.deathDate);
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
