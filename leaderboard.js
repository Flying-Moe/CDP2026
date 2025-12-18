console.log("Leaderboard loaded (Firestore)");

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   BADGES – DEFINITION (SAME AS STATS)
===================================================== */

const ALL_BADGES = [
  { icon: "🥇", class: "badge-gold", name: "Grim’s Favorite" },
  { icon: "☠️", class: "badge-dark", name: "The Undertaker" },
  { icon: "🦅", class: "badge-red", name: "The Vulture" },
  { icon: "🐢", class: "badge-green", name: "The Pension Sniper" },
  { icon: "🪦", class: "badge-gray", name: "The Optimist" },
  { icon: "🧨", class: "badge-orange", name: "Glass Cannon" },
  { icon: "🩸", class: "badge-red", name: "Blood Thief" }
];

/* =====================================================
   BADGES – LOGIC
===================================================== */

function computeBadges(players) {
  const out = {};

  function give(playerId, badge) {
    if (!out[playerId]) out[playerId] = [];
    out[playerId].push(badge);
  }

  const byScore = [...players].sort((a, b) => b.points - a.points);
  if (byScore[0]?.points > 0) {
    give(byScore[0].id, {
      icon: "🥇",
      class: "badge-gold",
      name: "Grim’s Favorite",
      reason: "Highest score"
    });
  }

  const byHits = [...players].sort((a, b) => b.hits - a.hits);
  if (byHits[0]?.hits > 0) {
    give(byHits[0].id, {
      icon: "☠️",
      class: "badge-dark",
      name: "The Undertaker",
      reason: "Most confirmed deaths"
    });
  }

  players.forEach(p => {
    if (p.approvedCount === 20 && p.hits === 0) {
      give(p.id, {
        icon: "🪦",
        class: "badge-gray",
        name: "The Optimist",
        reason: "20 picks, no deaths"
      });
    }

    if (p.hits >= 3 && p.minusCount >= 2) {
      give(p.id, {
        icon: "🧨",
        class: "badge-orange",
        name: "Glass Cannon",
        reason: "High risk, high punishment"
      });
    }

    if (p.firstBlood && p.rank > 1) {
      give(p.id, {
        icon: "🩸",
        class: "badge-red",
        name: "Blood Thief",
        reason: "First Blood without the crown"
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

  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );

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
    const minusPoints = history.filter(h => h.delta === -1);

    results.push({
      id: pDoc.id,
      name: p.name,
      points: p.score || 0,
      hits: hitsByPlayer[pDoc.id] || 0,
      approvedCount:
        p.entries?.["2026"]?.picks?.filter(x => x.status === "approved").length || 0,
      firstBlood: p.firstBlood === true,
      minusCount: minusPoints.length,
      lastMinusAt: minusPoints.length
        ? Math.max(...minusPoints.map(h => new Date(h.at).getTime()))
        : 0
    });
  });

  /* ---------- Sort ---------- */

  results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.minusCount !== b.minusCount)
      return a.minusCount - b.minusCount;
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
