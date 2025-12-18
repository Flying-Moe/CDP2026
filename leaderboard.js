console.log("Leaderboard loaded (Firestore)");

import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   HELPERS
===================================================== */

function calculateAgeAtDeath(birthISO, deathISO) {
  const b = new Date(birthISO);
  const d = new Date(deathISO);

  let age = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();

  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) {
    age--;
  }
  return age;
}

function calculatePoints(age) {
  if (age >= 99) return 1;
  return Math.max(1, 100 - age);
}

/* =====================================================
   LOAD + RENDER LEADERBOARD
===================================================== */

async function renderLeaderboard() {

  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );
  const peopleSnap = await getDocs(collection(db, "people"));
  const deathsSnap = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

  /* ---------- Maps ---------- */

  const peopleMap = {};
  peopleSnap.forEach(d => {
    peopleMap[d.id] = d.data();
  });

  const deathsByPlayer = {};
  deathsSnap.forEach(d => {
    const death = d.data();
    if (!deathsByPlayer[death.playerId]) {
      deathsByPlayer[death.playerId] = [];
    }
    deathsByPlayer[death.playerId].push(death);
  });

  /* ---------- Calculate results ---------- */

  const results = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    if (p.active === false) return;

    let points = p.score || 0;
    let hits = 0;

    const playerDeaths = deathsByPlayer[pDoc.id] || [];

    playerDeaths.forEach(d => {
      const person = peopleMap[d.personId];
      if (!person || !person.birthDate) return;

      const age = calculateAgeAtDeath(
        person.birthDate,
        d.dateOfDeath
      );

      points += calculatePoints(age);
      hits++;
    });

    results.push({
      id: pDoc.id,
      name: p.name,
      points,
      hits,
      firstBlood: p.firstBlood === true
    });
  });

  /* ---------- Sort ---------- */

  results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.hits !== a.hits) return b.hits - a.hits;
    return 0;
  });

  /* ---------- Render ---------- */

  const tbody = document.querySelector("#leaderboard tbody");
  tbody.innerHTML = "";

  results.forEach((r, index) => {
    const tr = document.createElement("tr");

    if (index === 0 && r.points > 0) {
      tr.classList.add("leader");
    }

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        ${r.name}
        ${r.firstBlood ? `<span title="First Blood"> 🩸</span>` : ""}
      </td>
      <td>${r.points}</td>
      <td>${r.hits}</td>
    `;

    tbody.appendChild(tr);
  });
}

/* =====================================================
   INIT
===================================================== */

renderLeaderboard();
