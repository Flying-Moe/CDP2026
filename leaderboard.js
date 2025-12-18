console.log("Leaderboard loaded (Firestore)");

import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   LOAD + RENDER LEADERBOARD
===================================================== */

async function renderLeaderboard() {
  const tbody = document.querySelector("#leaderboard tbody");
  if (!tbody) return;

  tbody.innerHTML = "<tr><td colspan='4'>Loading…</td></tr>";

  // Kun aktive spillere
  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );

  // Approved deaths = hits
  const deathsSnap = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

  /* ---------- Hits pr. spiller ---------- */

  const hitsByPlayer = {};
  deathsSnap.forEach(d => {
    const death = d.data();
    hitsByPlayer[death.playerId] =
      (hitsByPlayer[death.playerId] || 0) + 1;
  });

  /* ---------- Saml leaderboard-data ---------- */

  const results = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();

    const history = p.scoreHistory || [];
    const minusPoints = history.filter(h => h.delta === -1);
    const minusCount = minusPoints.length;

    const lastMinusAt = minusCount
      ? Math.max(
          ...minusPoints.map(h => new Date(h.at).getTime())
        )
      : 0;

    results.push({
      id: pDoc.id,
      name: p.name,
      points: p.score || 0,
      hits: hitsByPlayer[pDoc.id] || 0,
      firstBlood: p.firstBlood === true,
      minusCount,
      lastMinusAt
    });
  });

  /* ---------- Sortering ---------- */
  results.sort((a, b) => {
    // 1. Points (DESC)
    if (b.points !== a.points) return b.points - a.points;

    // 2. Færrest minuspoint vinder
    if (a.minusCount !== b.minusCount)
      return a.minusCount - b.minusCount;

    // 3. Seneste minuspoint nederst
    return a.lastMinusAt - b.lastMinusAt;
  });

  /* ---------- Render ---------- */

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

  if (!results.length) {
    tbody.innerHTML =
      "<tr><td colspan='4'>No players yet.</td></tr>";
  }
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderLeaderboard);
