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

const BADGE_PLAYER_STORAGE_KEY = "badgeSelectedPlayer";
const STATS_TAB_STORAGE_KEY = "statsActiveTab";

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

      // 🔑 GEM AKTIV TAB
      localStorage.setItem(STATS_TAB_STORAGE_KEY, btn.dataset.tab);   
    });
  });

  // Force default
  buttons.forEach(b => b.classList.remove("active"));
  tabs.forEach(t => t.style.display = "none");

// 🔁 Restore last active tab (fallback: overall)
const savedTab =
  localStorage.getItem(STATS_TAB_STORAGE_KEY) || "overall";

const restoreBtn = document.querySelector(
  `#stats-tabs button[data-tab="${savedTab}"]`
);
const restoreTab = document.getElementById(`stats-${savedTab}`);

if (restoreBtn && restoreTab) {
  restoreBtn.classList.add("active");
  restoreTab.style.display = "block";
} else {
  // Fallback hvis noget er galt i storage
  const fallbackBtn = document.querySelector('#stats-tabs button[data-tab="overall"]');
  const fallbackTab = document.getElementById("stats-overall");
  if (fallbackBtn && fallbackTab) {
    fallbackBtn.classList.add("active");
    fallbackTab.style.display = "block";
  }
}}

/* =====================================================
   RENDER BADGES - DROP DOWN MENU)
===================================================== */

function setupBadgePlayerDropdown(players, onChange) {
  const select = document.getElementById("badgePlayerSelect");
  if (!select) return;

  const stored = localStorage.getItem(BADGE_PLAYER_STORAGE_KEY) || "all";

  // sort players alfabetisk
  const sortedPlayers = [...players].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  select.innerHTML = `
    <option value="all">All players</option>
    ${sortedPlayers.map(p =>
      `<option value="${p.id}">${p.name}</option>`
    ).join("")}
  `;

  select.value = stored;

  select.addEventListener("change", () => {
    localStorage.setItem(BADGE_PLAYER_STORAGE_KEY, select.value);
    onChange(select.value);
  });
}

/* =====================================================
   RENDER BADGES
===================================================== */

function getHighestTierIndex(tiers, playerId) {
  const order = ["bronze", "silver", "gold", "prestige"];

  let highest = -1;

  order.forEach((tierId, index) => {
    const tier = tiers[tierId];
    if (!tier) return;

    if (tier.players.some(p => p.id === playerId)) {
      highest = index;
    }
  });

  return highest;
}

function renderBadges(context, selectedPlayerId = "all") {
  const allBadges = evaluateBadges(context);

  const singleHost = document.getElementById("badges-single");
  const progHost = document.getElementById("badges-progressive");
  const tabs = document.getElementById("badge-tabs");

  if (!singleHost || !progHost) return;

  singleHost.innerHTML = "";
  progHost.innerHTML = "";

  const singleBadges = allBadges
    .filter(b => b.type === "single")
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  const tieredBadges = allBadges
    .filter(b => b.type === "tiered")
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  // Vis kun tabs hvis begge typer findes
  if (singleBadges.length && tieredBadges.length) {
    tabs.style.display = "flex";
  } else {
    tabs.style.display = "none";
  }

  // Render SINGLE
  singleBadges.forEach(badge => {
    singleHost.appendChild(renderTieredBadge(badge, selectedPlayerId));
  });

  // Render PROGRESSIVE
  tieredBadges.forEach(badge => {
    progHost.appendChild(renderTieredBadge(badge, selectedPlayerId));
  });

  // Default tab = Single
  document
    .querySelectorAll("#badge-tabs button")
    .forEach(b => b.classList.remove("active"));

  const defaultBtn = document.querySelector(
    '#badge-tabs button[data-badge-tab="single"]'
  );
  if (defaultBtn) defaultBtn.classList.add("active");

  singleHost.style.display = "block";
  progHost.style.display = "none";
}

/* =====================================================
   RENDER BADGE (SINGLE + TIERED)
===================================================== */

function renderTieredBadge(badge, selectedPlayerId) {
  const wrapper = document.createElement("div");
  wrapper.className = "badge-block";

  /* ---------- HEADER ---------- */
  const header = document.createElement("div");
  header.className = "badge-header";

  const title = document.createElement("div");
  title.className = "badge-title";
  title.textContent = badge.name;
  header.appendChild(title);

  const unlocked =
    badge.type === "single"
      ? badge.players?.length > 0
      : Object.values(badge.tiers || {}).some(
          t => (t.players || []).length > 0
        );

  const desc = document.createElement("div");
  desc.className = unlocked ? "badge-description" : "badge-placeholder";
  desc.textContent = unlocked
    ? badge.description || ""
    : "Not yet unlocked";
  header.appendChild(desc);

  wrapper.appendChild(header);

  /* ---------- SINGLE ---------- */
  if (badge.type === "single") {
    const img = document.createElement("img");
    img.src = `assets/badges/${badge.id}.png`;
    if (!unlocked) img.style.opacity = "0.35";
    wrapper.appendChild(img);
    return wrapper;
  }

  /* ---------- TIERED ---------- */
  const tierGrid = document.createElement("div");
  tierGrid.className = "badge-tiers";

  const tierOrder = ["bronze", "silver", "gold", "prestige"];
  const tierMap = { bronze: 1, silver: 2, gold: 3, prestige: 4 };

  tierOrder.forEach(tierId => {
    const tier = badge.tiers?.[tierId];
    if (!tier) return;

    const tierDiv = document.createElement("div");
    tierDiv.className = "badge-tier";

    const img = document.createElement("img");
    img.src = `assets/badges/${badge.id}_${tierMap[tierId]}.png`;

    const players = (tier.players || []).filter(p =>
      selectedPlayerId === "all" || p.id === selectedPlayerId
    );

    if (!players.length) {
      tierDiv.classList.add("locked");
    }

    tierDiv.appendChild(img);

    const list = document.createElement("div");
    list.className = "badge-tier-players";

    if (players.length) {
      players.forEach(p => {
        const span = document.createElement("div");
        span.className = "badge-player";
        span.textContent = p.name;
        list.appendChild(span);
      });
    } else {
      const span = document.createElement("div");
      span.className = "badge-placeholder";
      span.textContent = "Locked";
      list.appendChild(span);
    }

    tierDiv.appendChild(list);
    tierGrid.appendChild(tierDiv);
  });

  wrapper.appendChild(tierGrid);
  return wrapper;
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
   HALL OF FAME YEAR TABS
===================================================== */

function initHallOfFameTabs() {
  const hofTab = document.querySelector('#stats-tabs button[data-tab="hof"]');
  const hofTabs = document.getElementById("hof-tabs");
  const yearButtons = document.querySelectorAll("#hof-tabs button");
  const yearSections = document.querySelectorAll(".hof-year");

  if (!hofTab || !hofTabs) return;

  // Show year tabs only when Hall of Fame is active
  hofTab.addEventListener("click", () => {
    hofTabs.style.display = "block";

    // Default to 2025
    yearButtons.forEach(b => b.classList.remove("active"));
    yearSections.forEach(s => s.style.display = "none");

    const btn2025 = document.querySelector('#hof-tabs button[data-year="2025"]');
    const sec2025 = document.getElementById("hof-2025");

    if (btn2025 && sec2025) {
      btn2025.classList.add("active");
      sec2025.style.display = "block";
    }
  });

  // Year switching
  yearButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      yearButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      yearSections.forEach(sec => sec.style.display = "none");
      const target = document.getElementById(`hof-${btn.dataset.year}`);
      if (target) target.style.display = "block";
    });
  });
}


/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initHallOfFameTabs();

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
  entries: p.entries || {},
  scoreHistory: p.scoreHistory || []
});

  });
  
    const peopleSnap = await getDocs(collection(db, "people"));
  const peopleMap = {};

    peopleSnap.forEach(doc => {
      peopleMap[doc.id] = doc.data();
    });

   // Build deaths map for badges (playerId -> [deathDate])
const deathsByPlayer = {};

players.forEach(player => {
  const entry = player.entries?.["2026"];
  if (!entry) return;

  (entry.picks || []).forEach(pick => {
    if (!pick.deathDate) return;

    if (!deathsByPlayer[player.id]) {
      deathsByPlayer[player.id] = [];
    }
    deathsByPlayer[player.id].push(pick.deathDate);
  });
});

const badgeContext = {
  players: players.map(p => {
    const score = buildScoreTable([p], "2026")[0] || {};
return {
  ...p,
  hits: score.hits || 0,
  totalScore: score.total || 0,
  penalty: score.penalty || 0,
  approvedPicks: score.picks?.filter(x => x.status === "approved").length || 0,
  avgPickAge: score.avgPickAge || null
};
  }),
  deaths: deathsByPlayer
};

const storedPlayer =
  localStorage.getItem(BADGE_PLAYER_STORAGE_KEY) || "all";

setupBadgePlayerDropdown(badgeContext.players, (playerId) => {
  renderBadges(badgeContext, playerId);
});

document.querySelectorAll("#badge-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#badge-tabs button")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    const tab = btn.dataset.badgeTab;

    document.getElementById("badges-single").style.display =
      tab === "single" ? "block" : "none";

    document.getElementById("badges-progressive").style.display =
      tab === "progressive" ? "block" : "none";
  });
});

renderOverallStats();
renderDeathStatsFromPlayers(players, peopleMap);
renderFunStats(players, peopleMap);
renderBadges(badgeContext);

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

     /* ===============================
     GLOBAL STAT: YOUNGEST PICK
     =============================== */

  const now = new Date();
  let youngestAge = null;
  let youngestPicks = [];

  scores.forEach(player => {
    player.picks.forEach(pick => {
      if (pick.status !== "approved") return;
      if (!pick.birthDate) return;

      const age =
        (now - new Date(pick.birthDate)) /
        (365.25 * 24 * 60 * 60 * 1000);

      if (youngestAge === null || age < youngestAge) {
        youngestAge = age;
        youngestPicks = [{
          player: player.name,
          person:
            (pick.personId && peopleMap[pick.personId]?.name) ||
            pick.normalizedName ||
            "Unknown",
          age: age
        }];
      } else if (Math.abs(age - youngestAge) < 0.01) {
        youngestPicks.push({
          player: player.name,
          person:
            (pick.personId && peopleMap[pick.personId]?.name) ||
            pick.normalizedName ||
            "Unknown",
          age: age
        });
      }
    });
  });

     /* ===============================
     GLOBAL STAT: OLDEST PICK
     =============================== */

  let oldestAge = null;
  let oldestPicks = [];

  scores.forEach(player => {
    player.picks.forEach(pick => {
      if (pick.status !== "approved") return;
      if (!pick.birthDate) return;

      const age =
        (now - new Date(pick.birthDate)) /
        (365.25 * 24 * 60 * 60 * 1000);

      if (oldestAge === null || age > oldestAge) {
        oldestAge = age;
        oldestPicks = [{
          player: player.name,
          person:
            (pick.personId && peopleMap[pick.personId]?.name) ||
            pick.normalizedName ||
            "Unknown",
          age
        }];
      } else if (Math.abs(age - oldestAge) < 0.01) {
        oldestPicks.push({
          player: player.name,
          person:
            (pick.personId && peopleMap[pick.personId]?.name) ||
            pick.normalizedName ||
            "Unknown",
          age
        });
      }
    });
  });

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

     if (youngestPicks.length) {
    const label = youngestPicks
      .map(p =>
        `${p.player} – ${p.person} (${p.age.toFixed(1)})`
      )
      .join(", ");

    set("stat-fun-unlucky", label);
  } else {
    set("stat-fun-unlucky", "—");
  }

  /* Placeholder stats (not implemented yet) */
  set("stat-fun-controversial", "—");
  set("stat-fun-unlucky", "—");
}
