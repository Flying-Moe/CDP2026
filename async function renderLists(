console.log("lists.js loaded");

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
  const maxScore = Math.max(...players.map(p => p.score));
  if (maxScore > 0) {
    players
      .filter(p => p.score === maxScore)
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
    if (p.minusPoints >= 2) {
      give(p.id, {
        icon: "🧨",
        class: "badge-orange",
        name: "Glass Cannon",
        reason: "High risk strategy"
      });
    }

    // 🩸 Blood Thief (First Blood, but not #1)
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
   HELPERS
===================================================== */

function calculateAgeForList(birthISO, deathISO) {
  if (!birthISO) return null;

  const birth = new Date(birthISO);
  const end = deathISO ? new Date(deathISO) : new Date();

  let age = end.getFullYear() - birth.getFullYear();

  const hadBirthday =
    end.getMonth() > birth.getMonth() ||
    (end.getMonth() === birth.getMonth() &&
     end.getDate() >= birth.getDate());

  if (!hadBirthday) age--;

  return age;
}

function calculatePotentialPointsForList(birthISO, deathISO) {
  const age = calculateAgeForList(birthISO, deathISO);
  if (age === null) return null;
  if (age >= 99) return 1;
  return Math.max(1, 100 - age);
}

/* =====================================================
   LOAD + RENDER LISTS
===================================================== */

function sortListRows(rows) {
  return rows.sort((a, b) => {
    let A, B;

    switch (listsSortKey) {
      case "name":
        A = a.name || "";
        B = b.name || "";
        break;

      case "age":
        A = a.age ?? -1;
        B = b.age ?? -1;
        break;

      case "pb":
        A = a.pickedBy ?? 0;
        B = b.pickedBy ?? 0;
        break;

      case "pp":
      default:
        A = a.pp ?? 0;
        B = b.pp ?? 0;
    }

    if (A === B) return 0;

    if (listsSortDir === "asc") {
      return A > B ? 1 : -1;
    } else {
      return A < B ? 1 : -1;
    }
  });
}

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

  /* ---------- Collect player data ---------- */

  const players = [];

  playersSnap.forEach(pDoc => {
    const p = pDoc.data();
    if (p.entries?.["2026"]?.active === false) return;
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

  // Alphabetical order (Lists only)
  players.sort((a, b) => a.name.localeCompare(b.name));
  players.forEach((p, i) => (p.rank = i + 1));

  const badgesByPlayer = computeBadges(players);

  /* ---------- Picked-by counter ---------- */

  const pickCount = {};
  players.forEach(p =>
    p.approved.forEach(x => {
      if (x.normalizedName) {
        pickCount[x.normalizedName] =
          (pickCount[x.normalizedName] || 0) + 1;
      }
    })
  );

  /* ---------- Render ---------- */

  container.innerHTML = "";

  players.forEach(player => {
    let rows = "";
    let totalPotential = 0;

player.approved.forEach(pick => {
  const age = calculateAgeForList(
    pick.birthDate,
    pick.deathDate
  );

  const points = calculatePotentialPointsForList(
    pick.birthDate,
    pick.deathDate
  );

  totalPotential += points ?? 0;

  rows += `
    <tr class="${pick.deathDate ? "is-dead" : ""}">
      <td>
        ${pick.normalizedName || pick.raw}
        ${pick.deathDate ? `<span class="death-mark" title="Deceased">✞</span>` : ""}
      </td>
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

    container.insertAdjacentHTML(
      "beforeend",
      `
      <section class="player-list">
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
      </section>
      `
    );
  });
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderLists);
