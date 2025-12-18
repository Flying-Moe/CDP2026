console.log("lists.js loaded");

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   BADGES – SAME DEFINITIONS AS LEADERBOARD / STATS
===================================================== */

function computeBadges(players) {
  const out = {};
  const give = (id, badge) => {
    if (!out[id]) out[id] = [];
    out[id].push(badge);
  };

  const byScore = [...players].sort((a, b) => b.score - a.score);
  if (byScore[0]?.score > 0) {
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

    if (p.hits >= 3 && p.minusPoints >= 2) {
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
   HELPERS
===================================================== */

function calculateAge(birthISO) {
  if (!birthISO) return null;
  const b = new Date(birthISO);
  const today = new Date();

  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

function calculatePotentialPoints(age) {
  if (age === null) return null;
  if (age >= 99) return 1;
  return Math.max(1, 100 - age);
}

/* =====================================================
   LOAD + RENDER LISTS
===================================================== */

async function renderLists() {
  const container = document.getElementById("lists-container");
  if (!container) return;

  container.innerHTML = "<p>Loading player lists…</p>";

  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );

  if (playersSnap.empty) {
    container.innerHTML = "<p>No players yet.</p>";
    return;
  }

  /* ---------- Prepare data ---------- */

  const players = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    const picks = p.entries?.["2026"]?.picks || [];

    const approved = picks.filter(x => x.status === "approved");
    const pending  = picks.filter(x => x.status === "pending");

    players.push({
      id: pDoc.id,
      name: p.name,
      score: p.score || 0,
      hits: (p.scoreHistory || []).filter(h => h.delta > 0).length,
      minusPoints: (p.scoreHistory || []).filter(h => h.delta < 0).length,
      approved,
      pending,
      approvedCount: approved.length,
      totalCount: approved.length + pending.length,
      firstBlood: p.firstBlood === true
    });
  });

  // Sortér alfabetisk (kun Lists)
  players.sort((a, b) => a.name.localeCompare(b.name));
  players.forEach((p, i) => (p.rank = i + 1));

  const badgesByPlayer = computeBadges(players);

  /* ---------- Picked-by tæller ---------- */

  const pickCount = {};
  players.forEach(p => {
    p.approved.forEach(x => {
      if (x.normalizedName) {
        pickCount[x.normalizedName] =
          (pickCount[x.normalizedName] || 0) + 1;
      }
    });
  });

  /* ---------- Render ---------- */

  container.innerHTML = "";

  players.forEach(player => {
    let rows = "";
    let totalPotential = 0;

    player.approved.forEach(pick => {
      const age = calculateAge(pick.birthDate);
      const points = calculatePotentialPoints(age);
      totalPotential += points ?? 0;

      rows += `
        <tr>
          <td>${pick.normalizedName || pick.raw}</td>
          <td>${age ?? "—"}</td>
          <td>${points ?? "—"}</td>
          <td>${pickCount[pick.normalizedName] || 1}</td>
        </tr>
      `;
    });

    if (!rows) {
      rows = `
        <tr>
          <td colspan="4" class="empty-list">No approved picks yet</td>
        </tr>
      `;
    }

    const badgeIcons = (badgesByPlayer[player.id] || [])
      .map(
        b =>
          `<span class="badge ${b.class}" title="${b.name} – ${b.reason}">${b.icon}</span>`
      )
      .join(" ");

    const section = document.createElement("section");
    section.className = "player-list";

    section.innerHTML = `
      <h2>
        ${player.name}
        ${badgeIcons}
        <span class="count">(${player.totalCount}/20)</span>
      </h2>

      <table class="list-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Age</th>
            <th>Potential points</th>
            <th>Picked by</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td>Total</td>
            <td></td>
            <td>${totalPotential}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `;

    container.appendChild(section);
  });
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderLists);
