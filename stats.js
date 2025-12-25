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
   LOAD DATA
===================================================== */

renderOverallStats();

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

function renderBadges(badgeWinners) {
  const container = document.getElementById("badges-stats");
  if (!container) return;

  container.innerHTML = BADGES.map(b => {
    const winners = badgeWinners[b.id] || [];

    return `
      <div class="badge">
        <div class="badge-title">${b.icon} ${b.name}</div>

        ${
          winners.length
            ? `
              <div class="badge-description"><em>${b.description}</em></div>
              <div class="badge-winner"><strong>${winners.join(", ")}</strong></div>
            `
            : `<div class="muted">Not yet claimed</div>`
        }
      </div>
    `;
  }).join("");
}

function renderHall() {
  document.getElementById("stats-hall").innerHTML =
    `<p class="muted">Hall of Fame will unlock after the 2026 season.</p>`;
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
      hits: p.hits || 0
    });
  });

  // Render Deaths

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
