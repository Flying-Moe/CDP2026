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

function calculateAge(birthISO, deathISO = null) {
  const b = new Date(birthISO);
  const d = deathISO ? new Date(deathISO) : new Date();

  let age = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
  return age;
}

function average(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/* =====================================================
   LOAD + BUILD STATS
===================================================== */

async function renderStats() {
  const container = document.getElementById("stats-container");
  if (!container) return;

  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );
  const peopleSnap = await getDocs(collection(db, "people"));
  const deathsSnap = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

  /* ---------- Maps ---------- */

  const peopleMap = {};
  peopleSnap.forEach(d => (peopleMap[d.id] = d.data()));

  const approvedDeathsByPlayer = {};
  deathsSnap.forEach(d => {
    const death = d.data();
    if (!approvedDeathsByPlayer[death.playerId]) {
      approvedDeathsByPlayer[death.playerId] = [];
    }
    approvedDeathsByPlayer[death.playerId].push(death);
  });

  const picksByPerson = {};
  const picksByPlayer = {};

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    const picks = (p.entries?.["2026"]?.picks || []).filter(
      x => x.status === "approved"
    );

    picksByPlayer[pDoc.id] = picks;

    picks.forEach(pick => {
      if (!pick.personId) return;
      if (!picksByPerson[pick.personId]) picksByPerson[pick.personId] = [];
      picksByPerson[pick.personId].push(pDoc.id);
    });
  });

  /* =====================================================
     FUN STATS
  ===================================================== */

  // Most picked celebrity
  const mostPicked = Object.entries(picksByPerson)
    .map(([personId, players]) => ({
      name: peopleMap[personId]?.name || "Unknown",
      count: players.length
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Youngest / oldest picks
  let allAges = [];
  Object.values(picksByPlayer).forEach(picks => {
    picks.forEach(pick => {
      const person = peopleMap[pick.personId];
      if (person?.birthDate) {
        allAges.push({
          name: person.name,
          age: calculateAge(person.birthDate)
        });
      }
    });
  });

  const youngest = [...allAges].sort((a, b) => a.age - b.age)[0];
  const oldest = [...allAges].sort((a, b) => b.age - a.age)[0];

  /* =====================================================
     COMPETITION STATS
  ===================================================== */

  const playerStats = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    const picks = picksByPlayer[pDoc.id] || [];
    const deaths = approvedDeathsByPlayer[pDoc.id] || [];

    const ages = picks
      .map(pick => peopleMap[pick.personId]?.birthDate)
      .filter(Boolean)
      .map(b => calculateAge(b));

    playerStats.push({
      name: p.name,
      hits: deaths.length,
      avgAge: average(ages),
      totalPicks: picks.length
    });
  });

  const mostHits = [...playerStats].sort((a, b) => b.hits - a.hits)[0];
  const riskiest = [...playerStats].sort((a, b) => a.avgAge - b.avgAge)[0];
  const safest = [...playerStats].sort((a, b) => b.avgAge - a.avgAge)[0];

  /* =====================================================
     RENDER
  ===================================================== */

  container.innerHTML = `
    <section>
      <h2>Fun stats</h2>

      <h3>Most picked celebrities</h3>
      <table class="list-table">
        <thead>
          <tr><th>Name</th><th>Picked by</th></tr>
        </thead>
        <tbody>
          ${mostPicked.map(x => `
            <tr><td>${x.name}</td><td>${x.count}</td></tr>
          `).join("")}
        </tbody>
      </table>

      <h3>Age extremes</h3>
      <table class="list-table">
        <tbody>
          <tr><td>Youngest pick</td><td>${youngest?.name || "—"} (${youngest?.age || "—"})</td></tr>
          <tr><td>Oldest pick</td><td>${oldest?.name || "—"} (${oldest?.age || "—"})</td></tr>
        </tbody>
      </table>
    </section>

    <hr />

    <section>
      <h2>Competition stats</h2>

      <table class="list-table">
        <tbody>
          <tr><td>Most hits</td><td>${mostHits?.name || "—"} (${mostHits?.hits || 0})</td></tr>
          <tr><td>Riskiest list</td><td>${riskiest?.name || "—"} (avg age ${riskiest?.avgAge || "—"})</td></tr>
          <tr><td>Safest list</td><td>${safest?.name || "—"} (avg age ${safest?.avgAge || "—"})</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderStats);
