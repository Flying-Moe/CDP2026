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

function toDateAny(v) {
  if (!v) return null;
  if (v instanceof Date) return v;

  // Firestore Timestamp (web SDK) har ofte toDate()
  if (typeof v.toDate === "function") return v.toDate();

  // Firestore Timestamp-lignende objekt
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);

  if (typeof v === "string") {
    // ISO: YYYY-MM-DD
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);

    // DK/UK: DD/MM/YYYY eller DD-MM-YYYY
    const dmy = v.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (dmy) return new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T00:00:00`);
  }

  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}


/* =====================================================
   TAB SYSTEM (FIXED)
===================================================== */

function initTabs() {
  const topButtons = document.querySelectorAll("#top-tabs button");
  const statsSubTabs = document.getElementById("stats-sub-tabs");
  const badgeSubTabs = document.getElementById("badge-tabs");
  const hofTabs = document.getElementById("hof-tabs");

  const contentTabs = document.querySelectorAll(".stats-tab");

  function hideAllContent() {
    contentTabs.forEach(t => t.style.display = "none");
    if (statsSubTabs) statsSubTabs.style.display = "none";
    if (badgeSubTabs) badgeSubTabs.style.display = "none";
    if (hofTabs) hofTabs.style.display = "none";
  }

  // ---------- TOP TABS ----------
  topButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      topButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      hideAllContent();

      const tab = btn.dataset.topTab;

      if (tab === "stats") {
        statsSubTabs.style.display = "block";
        activateStatsSubTab(
          localStorage.getItem("statsSubTab") || "overall"
        );
      }

      if (tab === "badges") {
        badgeSubTabs.style.display = "flex";
        document.getElementById("stats-badges").style.display = "block";
      }

      if (tab === "misses") {
        document.getElementById("stats-misses").style.display = "block";
      }

      if (tab === "hof") {
        hofTabs.style.display = "block";
        document.getElementById("stats-hof").style.display = "block";
      }

      localStorage.setItem("topTab", tab);
    });
  });

  // ---------- STATS SUB TABS ----------
  document.querySelectorAll("#stats-sub-tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      activateStatsSubTab(btn.dataset.tab);
    });
  });

  function activateStatsSubTab(tab) {
    document
      .querySelectorAll("#stats-sub-tabs button")
      .forEach(b => b.classList.remove("active"));

    const btn = document.querySelector(
      `#stats-sub-tabs button[data-tab="${tab}"]`
    );
    if (btn) btn.classList.add("active");

    contentTabs.forEach(t => t.style.display = "none");

    const target = document.getElementById(`stats-${tab}`);
    if (target) target.style.display = "block";

    localStorage.setItem("statsSubTab", tab);
  }

  // ---------- RESTORE STATE ----------
  const savedTop = localStorage.getItem("topTab") || "stats";
  const restoreTopBtn = document.querySelector(
    `#top-tabs button[data-top-tab="${savedTop}"]`
  );
  if (restoreTopBtn) restoreTopBtn.click();
}

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
renderAgeAndPickStats(players, peopleMap);
renderBadges(badgeContext);
renderBehaviorStats(players, peopleMap);

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
   RENDER AGE & PICKS STATS
===================================================== */

function renderAgeAndPickStats(players, peopleMap) {
  const scores = buildScoreTable(players, "2026");
  const now = new Date();

  const allAges = [];
  const perPlayer = [];

  let youngestAge = null;
  let youngestPicks = [];
  let oldestAge = null;
  let oldestPicks = [];

  scores.forEach(player => {
    const ages = [];

    player.picks.forEach(pick => {
      if (pick.status !== "approved") return;
      const birthDate =
  pick.birthDate ||
  (pick.personId && peopleMap[pick.personId]?.birthDate);

const bd = toDateAny(birthDate);
if (!bd) return;

const age =
  (now - bd) /
  (365.25 * 24 * 60 * 60 * 1000);

      ages.push(age);
      allAges.push(age);

      const pp = Math.round(
        calculateHitPoints(birthDate, now.toISOString())
      );

      const personName =
        (pick.personId && peopleMap[pick.personId]?.name) ||
        pick.normalizedName ||
        "Unknown";

      // Youngest
      if (youngestAge === null || age < youngestAge) {
        youngestAge = age;
        youngestPicks = [{
          person: personName,
          age,
          pp,
          player: player.name
        }];
      } else if (Math.abs(age - youngestAge) < 0.01) {
        youngestPicks.push({
          person: personName,
          age,
          pp,
          player: player.name
        });
      }

      // Oldest
      if (oldestAge === null || age > oldestAge) {
        oldestAge = age;
        oldestPicks = [{
          person: personName,
          age,
          pp,
          player: player.name
        }];
      } else if (Math.abs(age - oldestAge) < 0.01) {
        oldestPicks.push({
          person: personName,
          age,
          pp,
          player: player.name
        });
      }
    });

    if (ages.length) {
      const avgAge = avg(ages);
      const sorted = [...ages].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianAge =
        sorted.length % 2
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;

      perPlayer.push({
        name: player.name,
        avg: avgAge,
        median: medianAge
      });
    }
  });

  /* ---------- GLOBAL AVG / MEDIAN ---------- */

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  if (allAges.length) {
    const sorted = [...allAges].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const globalMedian =
      sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    set("stat-avg-age-global", avg(allAges).toFixed(1));
    set("stat-median-age-global", globalMedian.toFixed(1));
  }

  /* ---------- YOUNGEST / OLDEST OUTPUT ---------- */

  function formatPickedBy(list) {
    const names = [...new Set(list.map(p => p.player))];
    if (names.length <= 1) return `Picked by ${names[0]}`;
    return `Picked by ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  }

  if (youngestPicks.length) {
    const p = youngestPicks[0];
    set(
      "stat-youngest-pick",
      `${p.person} (Age: ${p.age.toFixed(1)} · Potential Points: ${p.pp})`
    );
    set(
      "stat-youngest-picked-by",
      formatPickedBy(youngestPicks)
    );
  }

  if (oldestPicks.length) {
    const p = oldestPicks[0];
    set(
      "stat-oldest-pick",
      `${p.person} (Age: ${p.age.toFixed(1)} · Potential Points: ${p.pp})`
    );
    set(
      "stat-oldest-picked-by",
      formatPickedBy(oldestPicks)
    );
  }

  /* ---------- PER PLAYER LIST ---------- */

  const ul = document.getElementById("stat-age-per-player");
  if (!ul) return;

  ul.innerHTML = "";

  perPlayer
    .sort((a, b) => a.avg - b.avg)
    .forEach(p => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${p.name}</strong> –
        Avg: ${p.avg.toFixed(1)} 
       <i>(Median: ${p.median.toFixed(1)})</i)
      `;
      ul.appendChild(li);
    });
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

  /* ===============================
     BUILD MAPS
  =============================== */

  const pickFrequency = {};          // personId -> count
  const personPlayers = {};          // personId -> [playerName]
  const playerUniqueCount = {};      // player -> unique picks
  const playerApprovedCount = {};    // player -> approved picks
  const playerHits = {};             // player -> hits
  const overlapMap = {};             // "A|B" -> count
  const cleanKills = {};             // player -> unique hits

  scores.forEach(s => {
    playerUniqueCount[s.name] = 0;
    playerApprovedCount[s.name] = 0;
    playerHits[s.name] = s.hits || 0;

    const seenPersons = new Set();

    s.picks.forEach(pick => {
      if (pick.status !== "approved") return;

      const pid = pick.personId || pick.normalizedName;
      if (!pid) return;

      playerApprovedCount[s.name]++;

      pickFrequency[pid] = (pickFrequency[pid] || 0) + 1;

      if (!personPlayers[pid]) personPlayers[pid] = [];
      personPlayers[pid].push(s.name);

      seenPersons.add(pid);
    });

    seenPersons.forEach(pid => {
      if (personPlayers[pid].length === 1) {
        playerUniqueCount[s.name]++;
      }
    });
  });

  /* ===============================
     OVERLAPS (PAIRWISE)
  =============================== */

  scores.forEach(a => {
    scores.forEach(b => {
      if (a.name >= b.name) return;

      const aSet = new Set(
        a.picks.filter(p => p.status === "approved")
          .map(p => p.personId || p.normalizedName)
      );

      const bSet = new Set(
        b.picks.filter(p => p.status === "approved")
          .map(p => p.personId || p.normalizedName)
      );

      let overlap = 0;
      aSet.forEach(x => { if (bSet.has(x)) overlap++; });

      if (overlap > 0) {
        overlapMap[`${a.name}|${b.name}`] = overlap;
      }
    });
  });

  /* ===============================
     MOST PICKED CELEBRITY
  =============================== */

  const mostPickedId = Object.keys(pickFrequency)
    .sort((a, b) => pickFrequency[b] - pickFrequency[a])[0];

  set(
    "stat-fun-most-picked",
    mostPickedId
      ? `${peopleMap[mostPickedId]?.name || mostPickedId} (${pickFrequency[mostPickedId]})`
      : "—"
  );

  /* ===============================
     MOST / LEAST UNIQUE PICKS
  =============================== */

  const uniqueValues = Object.values(playerUniqueCount);
  const maxUnique = Math.max(...uniqueValues);
  const minUnique = Math.min(...uniqueValues);

  set(
    "stat-fun-most-unique",
    Object.entries(playerUniqueCount)
      .filter(([, v]) => v === maxUnique)
      .map(([n]) => n)
      .join(", ") + ` (${maxUnique})`
  );

  set(
    "stat-fun-least-unique",
    Object.entries(playerUniqueCount)
      .filter(([, v]) => v === minUnique)
      .map(([n]) => n)
      .join(", ") + ` (${minUnique})`
  );

  /* ===============================
     MOST SHARED PICKS (PAIR)
  =============================== */

  const topPair = Object.entries(overlapMap)
    .sort((a, b) => b[1] - a[1])[0];

  set(
    "stat-fun-most-shared",
    topPair
      ? `${topPair[0].replace("|", " & ")} (${topPair[1]})`
      : "—"
  );

  /* ===============================
     CLEAN KILLS LEADER
  =============================== */

  scores.forEach(s => {
    cleanKills[s.name] = 0;
  });

  scores.forEach(s => {
    s.picks.forEach(pick => {
      if (!pick.deathDate) return;
      const pid = pick.personId || pick.normalizedName;
      if (pid && personPlayers[pid]?.length === 1) {
        cleanKills[s.name]++;
      }
    });
  });

  const maxClean = Math.max(...Object.values(cleanKills));

  set(
    "stat-fun-clean-kills",
    maxClean > 0
      ? Object.entries(cleanKills)
          .filter(([, v]) => v === maxClean)
          .map(([n]) => n)
          .join(", ") + ` (${maxClean})`
      : "—"
  );

  /* ===============================
     UNLUCKIEST PLAYER
  =============================== */

  const rates = Object.entries(playerApprovedCount)
    .map(([n, total]) => {
      const hits = playerHits[n] || 0;
      return total > 0
        ? { name: n, rate: hits / total, hits, total }
        : null;
    })
    .filter(Boolean);

  const worst = rates.sort((a, b) => a.rate - b.rate)[0];

  set(
    "stat-fun-unlucky",
    worst
      ? `${worst.name} (${worst.hits}/${worst.total} · ${(worst.rate * 100).toFixed(0)}%)`
      : "—"
  );

  /* ===============================
     MOST PENALTIES (EXISTING)
  =============================== */

  const worstPenalty = Math.min(...scores.map(s => s.penalty));
  const penaltyPlayers = scores.filter(
    s => s.penalty === worstPenalty && worstPenalty < 0
  );

  set(
    "stat-fun-most-penalties",
    penaltyPlayers.length
      ? penaltyPlayers.map(p => `${p.name} (${p.penalty})`).join(", ")
      : "—"
  );
}


function renderBehaviorStats(players, peopleMap) {
  const scores = buildScoreTable(players, "2026");
  const now = new Date();

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  /* ============================
     PREP MAPS
  ============================ */

  const personFreq = {};
  const playerData = {};
  const overlap = {};
  const ageBuckets = [
    [20,29], [30,39], [40,49], [50,59], [60,69], [70,79], [80,89], [90,200]
  ];

  scores.forEach(s => {
    playerData[s.name] = {
      approved: 0,
      unique: 0,
      under60: 0,
      over80: 0,
      ages: []
    };

    const seen = new Set();

    s.picks.forEach(pick => {
      if (pick.status !== "approved") return;

      const pid = pick.personId || pick.normalizedName;
      if (!pid) return;

      playerData[s.name].approved++;
      seen.add(pid);

      personFreq[pid] = (personFreq[pid] || 0) + 1;

      const birth =
        pick.birthDate ||
        (pick.personId && peopleMap[pick.personId]?.birthDate);

      const bd = toDateAny(birth);
      if (!bd) return;

      const age =
        (now - bd) /
        (365.25 * 24 * 60 * 60 * 1000);


      playerData[s.name].ages.push(age);

      if (age < 60) playerData[s.name].under60++;
      if (age >= 80) playerData[s.name].over80++;
    });

    seen.forEach(pid => {
      if (personFreq[pid] === 1) {
        playerData[s.name].unique++;
      }
    });
  });

  /* ============================
     UNIQUENESS / COPYCAT
  ============================ */

  const uniqScores = Object.entries(playerData)
    .map(([name, d]) => ({
      name,
      unique: d.unique,
      approved: d.approved,
      pct: d.approved ? d.unique / d.approved : 0
    }))
    .sort((a, b) => b.pct - a.pct);

  const topU = uniqScores[0];
  const lowU = uniqScores.at(-1);

  set(
    "stat-beh-unique",
    `${topU.name} (${topU.unique}/${topU.approved} · ${(topU.pct*100).toFixed(0)}%)`
  );

  set(
    "stat-beh-copycat",
    `${lowU.name} (${lowU.approved-lowU.unique}/${lowU.approved} · ${(100 - lowU.pct*100).toFixed(0)}%)`
  );

  /* ============================
     YOLO / COWARD
  ============================ */

  const yoloRank = Object.entries(playerData)
    .map(([n,d]) => ({
      name: n,
      raw: d.under60,
      pct: d.approved ? d.under60/d.approved : 0
    }))
    .sort((a,b) => b.pct - a.pct)[0];

  const cowardRank = Object.entries(playerData)
    .map(([n,d]) => ({
      name: n,
      raw: d.over80,
      pct: d.approved ? d.over80/d.approved : 0
    }))
    .sort((a,b) => b.pct - a.pct)[0];

  set(
    "stat-beh-yolo",
    `${yoloRank.name} (${yoloRank.raw} · ${(yoloRank.pct*100).toFixed(0)}%)`
  );

  set(
    "stat-beh-coward",
    `${cowardRank.name} (${cowardRank.raw} · ${(cowardRank.pct*100).toFixed(0)}%)`
  );

  set("stat-beh-chaos", "—");

  /* ============================
     CROWD INDEX (LIGHT)
  ============================ */

  const names = Object.keys(playerData);

  names.forEach(a => {
    names.forEach(b => {
      if (a >= b) return;
      const aSet = new Set(
        scores.find(s => s.name===a).picks
          .filter(p=>p.status==="approved")
          .map(p=>p.personId||p.normalizedName)
      );
      const bSet = new Set(
        scores.find(s => s.name===b).picks
          .filter(p=>p.status==="approved")
          .map(p=>p.personId||p.normalizedName)
      );
      let c = 0;
      aSet.forEach(x => bSet.has(x) && c++);
      if (c>0) overlap[`${a}|${b}`]=c;
    });
  });

  const crowd = {};
  Object.entries(overlap).forEach(([k,v])=>{
    const [a,b]=k.split("|");
    crowd[a]=(crowd[a]||0)+v;
    crowd[b]=(crowd[b]||0)+v;
  });

  const ul = document.getElementById("stat-beh-crowd");
  ul.innerHTML = "";

  Object.entries(crowd)
    .sort((a,b)=>b[1]-a[1])
    .forEach(([n,v])=>{
      const li=document.createElement("li");
      li.textContent=`${n} (${v})`;
      ul.appendChild(li);
    });

   const overlapGraph = {
  nodes: Object.keys(playerData).map(name => ({
    id: name,
    size: playerData[name].approved
  })),
  links: Object.entries(overlap).map(([key, weight]) => {
    const [a, b] = key.split("|");
    return { source: a, target: b, weight };
  })
};

   renderOverlapNetwork(overlapGraph);

  /* ============================
     OVERLAP NETWORK (HTML)
  ============================ */
   
function renderOverlapNetwork(graph) {
  const svg = d3.select("#overlap-network");
  if (svg.empty()) return;

  // Stop tidligere simulation (ellers kan du få “spøgelses-ticks” og mærkelig dobbelt-render)
  const prevSim = svg.node().__sim;
  if (prevSim) prevSim.stop();

  // Responsiv bredde (mobilvenlig) – ingen side-scroll
  const container = svg.node().parentElement || document.body;
  const width = Math.max(320, Math.min(900, container.clientWidth || 900));
  const height = Math.max(420, Math.round(width * 0.70));

  svg
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMinYMid meet");

  svg.selectAll("*").remove();

   svg.on("click", () => {
  nodeGroup.transition().style("opacity", 1);
  link.transition().style("opacity", 0.55);
});

  // Kopiér data så D3 ikke muterer dit graph-objekt på tværs af renders
  const nodes = graph.nodes.map(n => ({ ...n }));
  const links = graph.links.map(l => ({ ...l }));

  const simulation = d3.forceSimulation(nodes)
    .force(
      "link",
      d3.forceLink(links)
        .id(d => d.id)
        // mere spredning + lidt kortere afstand når weight er høj
        .distance(d => Math.max(80, 200 - Math.min(d.weight * 7, 120)))
        .strength(0.12)
    )
    .force("charge", d3.forceManyBody().strength(-900))
    // venstre-justér visuelt: center ligger til venstre for midten
    .force("center", d3.forceCenter(width * 0.35, height / 2))
    .force("collision", d3.forceCollide().radius(36));

  // Gem simulation så vi kan stoppe den ved næste render
  svg.node().__sim = simulation;

  const link = svg.append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.55)
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke-width", d => Math.max(1, Math.sqrt(d.weight)));

  const nodeGroup = svg.append("g")
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .call(
      d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    );

  const node = nodeGroup.append("circle")
    .attr("r", d => 8 + d.size * 0.35)
    .attr("fill", "#8b0000");

  // Labels (én gang, ikke dobbelt)
  nodeGroup.append("text")
    .text(d => d.id)
    .attr("x", 12)
    .attr("y", 4)
    .style("font-size", "11px")
    .style("pointer-events", "none");

  // Tooltip på node (sum af weights = Crowd Index)
  node.append("title").text(d => {
    const connected = links.filter(l => l.source.id === d.id || l.target.id === d.id);
    const total = connected.reduce((s, l) => s + l.weight, 0);
    return `${d.id}\nCrowd Index: ${total}`;
  });
   
node.on("click", (event, d) => {
  const connected = new Set();

  graph.links.forEach(l => {
    if (l.source.id === d.id) connected.add(l.target.id);
    if (l.target.id === d.id) connected.add(l.source.id);
  });

  connected.add(d.id);

  nodeGroup
    .transition()
    .style("opacity", n => connected.has(n.id) ? 1 : 0.15);

  link
    .transition()
    .style("opacity", l =>
      l.source.id === d.id || l.target.id === d.id ? 0.9 : 0.08
    );
});

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    nodeGroup.attr("transform", d => `translate(${d.x}, ${d.y})`);
  });

   const link = svg.append("g")
  .attr("stroke", "#999")
  .attr("stroke-opacity", 0.55)
  .selectAll("line")
  .data(links)
  .enter()
  .append("line")
  .attr("stroke-width", d => Math.max(1, Math.sqrt(d.weight)));
   
// Tooltip på links: viser præcist overlap
link.append("title")
  .text(d => `${d.source.id} ↔ ${d.target.id}: ${d.weight} shared picks`);

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.4).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

/* ============================
   AGE HEATMAP (HTML)
============================ */

const heat = document.getElementById("stat-beh-heatmap");
heat.innerHTML = "";

/* ============================
   HEATMAP – GLOBAL SCALE
============================ */

const table = document.createElement("table");
table.className = "heatmap";

/* Header */
const head = document.createElement("tr");
head.innerHTML =
  "<th>Player</th>" +
  ageBuckets
    .map(([min, max]) =>
      `<th>${max >= 200 ? `${min}+` : `${min}–${max}`}</th>`
    )
    .join("");
table.appendChild(head);

/* Først: find GLOBAL max (til farveskala) */
let globalMax = 0;

Object.values(playerData).forEach(d => {
  ageBuckets.forEach(([min, max]) => {
    const count = d.ages.filter(a => a >= min && a <= max).length;
    if (count > globalMax) globalMax = count;
  });
});

/* Fallback hvis alt er 0 */
if (globalMax === 0) globalMax = 1;

/* Rows */
Object.entries(playerData).forEach(([playerName, data]) => {
  const row = document.createElement("tr");

  const nameCell = document.createElement("td");
  nameCell.textContent = playerName;
  row.appendChild(nameCell);

  ageBuckets.forEach(([min, max]) => {
    const count = data.ages.filter(a => a >= min && a <= max).length;

    const cell = document.createElement("td");
    if (count > 0) {
      const intensity = count / globalMax; // 0 → 1
      cell.style.backgroundColor = `rgba(139, 0, 0, ${intensity})`;
      cell.textContent = count;
    } else {
      cell.textContent = "";
    }

    row.appendChild(cell);
  });

  table.appendChild(row);
});

heat.appendChild(table);
}
