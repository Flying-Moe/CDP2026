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
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
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
   BADGES
===================================================== */

function computeBadges(players) {
  const out = {};
  const give = (id, b) => (out[id] = [...(out[id] || []), b]);

  const byScore = [...players].sort((a, b) => b.score - a.score);
  if (byScore[0]?.score > 0)
    give(byScore[0].id, { icon: "🥇", name: "Grim’s Favorite", reason: "Highest score" });

  const byHits = [...players].sort((a, b) => b.hits - a.hits);
  if (byHits[0]?.hits > 0)
    give(byHits[0].id, { icon: "☠️", name: "The Undertaker", reason: "Most confirmed deaths" });

  const withAge = players.filter(p => p.avgAge !== null);
  if (withAge.length) {
    give(withAge.reduce((a, b) => a.avgAge < b.avgAge ? a : b).id,
      { icon: "🦅", name: "The Vulture", reason: "Lowest average age" });
    give(withAge.reduce((a, b) => a.avgAge > b.avgAge ? a : b).id,
      { icon: "🐢", name: "Pension Sniper", reason: "Highest average age" });
  }

  players.forEach(p => {
    if (p.approvedCount === 20 && p.hits === 0)
      give(p.id, { icon: "🪦", name: "The Optimist", reason: "20 picks, no deaths" });

    if (p.minusPoints >= 2)
      give(p.id, { icon: "🧨", name: "Glass Cannon", reason: "Risky strategy" });

    if (p.firstBlood && p.rank > 1)
      give(p.id, { icon: "🩸", name: "Blood Thief", reason: "First Blood without lead" });
  });

  return out;
}

/* =====================================================
   LOAD DATA
===================================================== */

async function loadData() {
  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );
  const deathsSnap = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

  const deathsByPlayer = {};
  deathsSnap.forEach(d => {
    const death = d.data();
    deathsByPlayer[death.playerId] =
      (deathsByPlayer[death.playerId] || 0) + 1;
  });

  const players = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
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

  return players;
}

/* =====================================================
   RENDER TABS
===================================================== */

function renderOverall(players) {
  document.getElementById("overall-stats").innerHTML = `
    <ul>
      <li>Total players: <strong>${players.length}</strong></li>
      <li>Total confirmed deaths: <strong>${players.reduce((a,b)=>a+b.hits,0)}</strong></li>
      <li>Average score: <strong>${avg(players.map(p=>p.score)).toFixed(1)}</strong></li>
    </ul>
  `;
}

function renderFun(players) {
  const mostMinus = [...players].sort((a,b)=>b.minusPoints-a.minusPoints)[0];
  document.getElementById("fun-stats").innerHTML = `
    <ul>
      <li>Most minus points: <strong>${mostMinus?.name}</strong> (${mostMinus?.minusPoints})</li>
      <li>Highest potential chaos achieved ✔</li>
    </ul>
  `;
}

function renderBadges(players, badges) {
  document.getElementById("badges-stats").innerHTML =
    players.map(p => `
      <section class="player-list">
        <h3>${p.name}</h3>
        ${
          badges[p.id]?.length
            ? badges[p.id].map(b => `<span title="${b.reason}">${b.icon}</span>`).join(" ")
            : `<p class="muted">No badges yet</p>`
        }
      </section>
    `).join("");
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const players = await loadData();
  const badges = computeBadges(players);

  renderOverall(players);
  renderFun(players);
  renderBadges(players, badges);

document.querySelectorAll("#stats-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {

    document.querySelectorAll("#stats-tabs button")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    document.querySelectorAll(".stats-tab")
      .forEach(tab => tab.style.display = "none");

    const target = document.getElementById(`stats-${btn.dataset.tab}`);
    if (target) target.style.display = "block";
    });
  });
  
  // --- Activate default tab explicitly ---
document.getElementById("stats-overall").style.display = "block";

});
