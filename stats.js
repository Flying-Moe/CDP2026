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

async function loadData() {
  const playersSnap = await getDocs(collection(db, "players"));
  const deathsSnap = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

  const deathsByPlayer = {};
  const uniqueDeaths = new Set();

  deathsSnap.forEach(d => {
    const death = d.data();
    uniqueDeaths.add(death.personId);
    deathsByPlayer[death.playerId] =
      (deathsByPlayer[death.playerId] || 0) + 1;
  });

  const players = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    if (p.active === false) return;
    if (p.entries?.["2026"]?.active === false) return;
    
    const picks = p.entries?.["2026"]?.picks || [];
    const approved = picks.filter(x => x.status === "approved");

    const ages = approved
      .map(x => calculateAge(x.birthDate))
      .filter(a => a !== null);

    players.push({
      id: pDoc.id,
      name: p.name,
      score: p.score || 0,
      hits: deathsByPlayer[pDoc.id] || 0,
      minusPoints: (p.scoreHistory || []).filter(h => h.delta < 0).length,
      approvedCount: approved.length,
      avgAge: avg(ages),
      firstBlood: p.firstBlood === true
    });
  });

  players.sort((a, b) => b.score - a.score);
  players.forEach((p, i) => p.rank = i + 1);

  return {
    players,
    deaths: {
      unique: uniqueDeaths.size,
      total: deathsSnap.size
    }
  };
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

function renderOverall(players, deaths) {
  document.getElementById("stats-overall").innerHTML = `
    <ul>
      <li>Total players: <strong>${players.length}</strong></li>
      <li>Deaths so far: <strong>${deaths.unique}</strong> (${deaths.total} hits)</li>
      <li>Average score: <strong>${avg(players.map(p => p.score)).toFixed(1)}</strong></li>
    </ul>
  `;
}

function renderFun(players) {
  const mostMinus = [...players].sort((a,b)=>b.minusPoints-a.minusPoints)[0];
  document.getElementById("stats-fun").innerHTML = `
    <ul>
      <li>Most minus points: <strong>${mostMinus?.name || "—"}</strong> (${mostMinus?.minusPoints || 0})</li>
      <li>Chaos level: ☠️☠️☠️</li>
    </ul>
  `;
}

function renderBadges(badgeWinners) {
  document.getElementById("stats-badges").innerHTML = BADGES.map(b => {
    const winners = badgeWinners[b.id] || [];
    return `
      <section class="badge">
        <h3>${b.icon} ${b.name}</h3>
        ${
          winners.length
            ? `<p class="badge-desc">${b.description}</p>
               <p class="badge-winners">${winners.join(", ")}</p>`
            : `<p class="muted">Not yet claimed</p>`
        }
      </section>
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

  const { players, deaths } = await loadData();
  const badgeWinners = computeBadges(players);

  renderOverall(players, deaths);
  renderFun(players);
  renderBadges(badgeWinners);
  renderHall();
});
