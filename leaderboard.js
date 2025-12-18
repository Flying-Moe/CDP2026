console.log("Leaderboard loaded (Firestore)");

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

  /* ---------- Hits pr. spiller ---------- */

  const hitsByPlayer = {};
  deathsSnap.forEach(d => {
    const death = d.data();
    hitsByPlayer[death.playerId] =
      (hitsByPlayer[death.playerId] || 0) + 1;
  });

  /* ---------- Saml data ---------- */

  const results = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    const history = p.scoreHistory || [];
    const minus = history.filter(h => h.delta === -1);

    results.push({
      id: pDoc.id,
      name: p.name,
      points: p.score || 0,
      hits: hitsByPlayer[pDoc.id] || 0,
      approvedCount:
        p.entries?.["2026"]?.picks?.filter(x => x.status === "approved").length || 0,
      firstBlood: p.firstBlood === true,
      minusCount: minus.length,
      lastMinusAt: minus.length
        ? Math.max(...minus.map(h => new Date(h.at).getTime()))
        : 0
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

  results.forEach((p, i) => (p.rank = i + 1));

  const badgesByPlayer = computeBadges(results);

  /* ---------- Render ---------- */

  tbody.innerHTML = "";

  results.forEach((r, index) => {
    const tr = document.createElement("tr");

    if (index === 0 && r.points > 0) {
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
