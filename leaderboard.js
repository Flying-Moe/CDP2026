console.log("Leaderboard loaded");

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   BADGE DEFINITIONS (VISUAL ONLY)
===================================================== */

const BADGES = {
  grim_favorite: { icon: "🥇", name: "Grim’s Favorite", desc: "Highest score" },
  undertaker: { icon: "☠️", name: "The Undertaker", desc: "Most confirmed deaths" },
  vulture: { icon: "🦅", name: "The Vulture", desc: "Lowest average age" },
  pension_sniper: { icon: "🐢", name: "The Pension Sniper", desc: "Highest average age" },
  optimist: { icon: "🪦", name: "The Optimist", desc: "20 picks, no deaths" },
  glass_cannon: { icon: "🧨", name: "Glass Cannon", desc: "Risky strategy" },
  blood_thief: { icon: "🩸", name: "Blood Thief", desc: "First Blood without lead" }
};

function renderBadgesForPlayer(playerName, badgeData) {
  return Object.entries(badgeData)
    .filter(([_, names]) => names.includes(playerName))
    .map(([id]) => {
      const b = BADGES[id];
      return `<span class="badge" title="${b.name} – ${b.desc}">${b.icon}</span>`;
    })
    .join(" ");
}

/* =====================================================
   LOAD + RENDER LEADERBOARD
===================================================== */

async function renderLeaderboard() {
  const tbody = document.querySelector("#leaderboard tbody");
  if (!tbody) return;

  tbody.innerHTML = "<tr><td colspan='4'>Loading…</td></tr>";

  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );

  const deathsSnap = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

  const badgeSnap = await getDoc(doc(db, "meta", "badges_2026"));
  const badgeData = badgeSnap.exists() ? badgeSnap.data() : {};

  const hitsByPlayer = {};
  deathsSnap.forEach(d => {
    const death = d.data();
    hitsByPlayer[death.playerId] =
      (hitsByPlayer[death.playerId] || 0) + 1;
  });

  const results = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    const history = p.scoreHistory || [];
    const minus = history.filter(h => h.delta === -1);

    results.push({
      name: p.name,
      points: p.score || 0,
      hits: hitsByPlayer[pDoc.id] || 0,
      minusCount: minus.length,
      lastMinusAt: minus.length
        ? Math.max(...minus.map(h => new Date(h.at).getTime()))
        : 0,
      firstBlood: p.firstBlood === true
    });
  });

  results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.minusCount !== b.minusCount)
      return a.minusCount - b.minusCount;
    return a.lastMinusAt - b.lastMinusAt;
  });

  tbody.innerHTML = "";

  results.forEach((r, i) => {
    const badges = renderBadgesForPlayer(r.name, badgeData);

    const tr = document.createElement("tr");
    if (i === 0 && r.points > 0) tr.classList.add("leader");

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>
        ${r.name}
        ${badges}
        ${r.firstBlood ? `<span title="First Blood">🩸</span>` : ""}
      </td>
      <td>${r.points}</td>
      <td>${r.hits}</td>
    `;

    tbody.appendChild(tr);
  });

  if (!results.length) {
    tbody.innerHTML = "<tr><td colspan='4'>No players yet.</td></tr>";
  }
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderLeaderboard);
