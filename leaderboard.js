console.log("Leaderboard loaded (Firestore)");

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { calculatePlayerTotals } from "./admin.core.js";

/* =====================================================
   BADGES – LOGIC (LOCAL, SAFE)
===================================================== */

function computeBadges(players) {
  const out = {};
  const give = (id, badge) => {
    if (!out[id]) out[id] = [];
    out[id].push(badge);
  };

  // 🥇 Grim’s Favorite – highest score (ties allowed)
  const maxScore = Math.max(...players.map(p => p.points));
  if (maxScore > 0) {
    players
      .filter(p => p.points === maxScore)
      .forEach(p =>
        give(p.id, {
          icon: "🥇",
          class: "badge-gold",
          name: "Grim’s Favorite",
          reason: "Highest score"
        })
      );
  }

  // ☠️ The Undertaker – most deaths
  const maxHits = Math.max(...players.map(p => p.hits));
  if (maxHits > 0) {
    players
      .filter(p => p.hits === maxHits)
      .forEach(p =>
        give(p.id, {
          icon: "☠️",
          class: "badge-dark",
          name: "The Undertaker",
          reason: "Most confirmed deaths"
        })
      );
  }

  players.forEach(p => {
    // 🪦 The Optimist
    if (p.approvedCount === 20 && p.hits === 0) {
      give(p.id, {
        icon: "🪦",
        class: "badge-gray",
        name: "The Optimist",
        reason: "20 picks, no deaths"
      });
    }

    // 🧨 Glass Cannon
    if (p.minusCount >= 2) {
      give(p.id, {
        icon: "🧨",
        class: "badge-orange",
        name: "Glass Cannon",
        reason: "High risk strategy"
      });
    }

    // 🩸 Blood Thief
    if (p.firstBlood && p.rank > 1) {
      give(p.id, {
        icon: "🩸",
        class: "badge-red",
        name: "Blood Thief",
        reason: "First Blood without the lead"
      });
    }
  });

  return out;
}

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

  // Kun godkendte deaths
  const deathsSnap = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

/* ---------- Saml data (fælles score-engine) ---------- */

const results = [];

playersSnap.forEach(pDoc => {
  const p = pDoc.data();
if (p.entries?.["2026"]?.active === false) return;

  const {
    hitPoints,
    hits,
    penalty,
    totalScore,
    approvedCount
  } = calculatePlayerTotals(p);

  results.push({
    id: pDoc.id,
    name: p.name,
    hitPoints,
    hits,
    penalty,
    totalScore,
    approvedCount,
    firstBlood: p.firstBlood === true
  });
});

/* ---------- Sortering ---------- */
results.sort((a, b) => {
  // 1. TotalScore (DESC)
  if (b.totalScore !== a.totalScore) {
    return b.totalScore - a.totalScore;
  }

  // 2. Hits (DESC)
  if (b.hits !== a.hits) {
    return b.hits - a.hits;
  }

  // 3. Alfabetisk
  return a.name.localeCompare(b.name);
});

results.forEach((p, i) => (p.rank = i + 1));

const badgesByPlayer = computeBadges(results);

/* ---------- Render ---------- */

tbody.innerHTML = "";

results.forEach((r, index) => {
  const tr = document.createElement("tr");

  if (index === 0 && r.totalScore > 0) {
    tr.classList.add("leader");
  }

  const badgeIcons = (badgesByPlayer[r.id] || [])
    .map(
      b =>
        `<span class="badge ${b.class}" title="${b.name} – ${b.reason}">${b.icon}</span>`
    )
    .join(" ");

tr.innerHTML = `
  <td>${index + 1}</td>
  <td>
    ${r.name}
    ${badgeIcons}
  </td>
  <td title="${
    r.penalty !== 0
      ? `Hit points: ${r.hitPoints}, penalty: ${r.penalty}`
      : ""
  }">
    ${
      r.penalty !== 0
        ? `${r.hitPoints} (${r.penalty}) = ${r.totalScore}`
        : `${r.hitPoints}`
    }
  </td>
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
