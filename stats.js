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
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calculateAge(birthISO, refISO) {
  if (!birthISO || !refISO) return null;
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
   BADGES (DEFINITION)
===================================================== */

function computeBadges(players) {
  const badgesByPlayer = {};

  function give(playerId, badge) {
    if (!badgesByPlayer[playerId]) badgesByPlayer[playerId] = [];
    badgesByPlayer[playerId].push(badge);
  }

  const sortedByScore = [...players].sort((a, b) => b.score - a.score);
  if (sortedByScore[0]?.score > 0) {
    give(sortedByScore[0].id, {
      icon: "🥇",
      name: "Grim’s Favorite",
      reason: "Highest score"
    });
  }

  const sortedByHits = [...players].sort((a, b) => b.hits - a.hits);
  if (sortedByHits[0]?.hits > 0) {
    give(sortedByHits[0].id, {
      icon: "☠️",
      name: "The Undertaker",
      reason: "Most confirmed deaths"
    });
  }

  const avgAgePlayers = players.filter(p => p.avgAge !== null);
  if (avgAgePlayers.length) {
    const vulture = avgAgePlayers.reduce((a, b) => a.avgAge < b.avgAge ? a : b);
    const turtle  = avgAgePlayers.reduce((a, b) => a.avgAge > b.avgAge ? a : b);

    give(vulture.id, {
      icon: "🦅",
      name: "The Vulture",
      reason: "Lowest average age"
    });

    give(turtle.id, {
      icon: "🐢",
      name: "The Pension Sniper",
      reason: "Highest average age"
    });
  }

  players.forEach(p => {
    if (p.approvedCount === 20 && p.hits === 0) {
      give(p.id, {
        icon: "🪦",
        name: "The Optimist",
        reason: "20 picks, no deaths"
      });
    }

    if (p.hits >= 3 && p.minusPoints >= 2) {
      give(p.id, {
        icon: "🧨",
        name: "Glass Cannon",
        reason: "High risk, high punishment"
      });
    }

    if (p.firstBlood && p.rank > 1) {
      give(p.id, {
        icon: "🩸",
        name: "Blood Thief",
        reason: "First Blood without the crown"
      });
    }
  });

  return badgesByPlayer;
}

/* =====================================================
   LOAD + RENDER STATS
===================================================== */

async function renderStats() {
  const container = document.getElementById("stats-container");

  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );
  const peopleSnap = await getDocs(collection(db, "people"));
  const deathsSnap = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

  const people = {};
  peopleSnap.forEach(d => people[d.id] = d.data());

  const deathsByPlayer = {};
  deathsSnap.forEach(d => {
    const death = d.data();
    if (!deathsByPlayer[death.playerId]) deathsByPlayer[death.playerId] = [];
    deathsByPlayer[death.playerId].push(death);
  });

  const players = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    const picks = p.entries?.["2026"]?.picks || [];
    const approved = picks.filter(x => x.status === "approved");

    const ages = approved
      .map(x => people[x.personId]?.birthDate)
      .filter(Boolean)
      .map(b => calculateAge(b, new Date().toISOString()));

    const hits = (deathsByPlayer[pDoc.id] || []).length;
    const minusPoints = (p.scoreHistory || []).filter(h => h.delta < 0).length;

    players.push({
      id: pDoc.id,
      name: p.name,
      score: p.score || 0,
      hits,
      minusPoints,
      approvedCount: approved.length,
      avgAge: avg(ages),
      firstBlood: p.firstBlood === true
    });
  });

  players.sort((a, b) => b.score - a.score);
  players.forEach((p, i) => p.rank = i + 1);

  const badges = computeBadges(players);

  /* =====================================================
     RENDER
  ===================================================== */

  container.innerHTML = `
    <h2>🏆 Player Badges</h2>
    ${players.map(p => `
      <section class="player-list">
        <h3>
          ${p.name}
          ${(badges[p.id] || []).map(b =>
            `<span title="${b.name} – ${b.reason}">${b.icon}</span>`
          ).join(" ")}
        </h3>
        ${
          badges[p.id]?.length
            ? `<ul>
                ${badges[p.id].map(b =>
                  `<li>${b.icon} <strong>${b.name}</strong> – ${b.reason}</li>`
                ).join("")}
              </ul>`
            : `<p class="muted">No badges yet</p>`
        }
      </section>
    `).join("")}
  `;
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderStats);
