console.log("lists.js loaded");

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
  glass_cannon: { icon: "🧨", name: "Glass Cannon", desc: "High risk strategy" },
  blood_thief: { icon: "🩸", name: "Blood Thief", desc: "First Blood without lead" }
};

/* =====================================================
   HELPERS
===================================================== */

function calculateAge(birthISO) {
  if (!birthISO) return null;
  const b = new Date(birthISO);
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (
    t.getMonth() < b.getMonth() ||
    (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())
  ) age--;
  return age;
}

function calculatePotentialPoints(age) {
  if (age === null) return null;
  if (age >= 99) return 1;
  return Math.max(1, 100 - age);
}

function renderBadgesForPlayer(playerName, badgeData) {
  if (!badgeData || typeof badgeData !== "object") return "";

  return Object.entries(badgeData)
    .filter(([_, names]) => Array.isArray(names) && names.includes(playerName))
    .map(([id]) => {
      const b = BADGES[id];
      if (!b) return "";
      return `<span class="badge" title="${b.name} – ${b.desc}">${b.icon}</span>`;
    })
    .join(" ");
}

/* =====================================================
   LOAD + RENDER LISTS
===================================================== */

async function renderLists() {
  const container = document.getElementById("lists-container");
  if (!container) return;

  container.innerHTML = "<p>Loading player lists…</p>";

  try {
    const playersSnap = await getDocs(
      query(collection(db, "players"), where("active", "==", true))
    );

    const badgeSnap = await getDoc(doc(db, "meta", "badges_2026"));
    const badgeData = badgeSnap.exists() ? badgeSnap.data() : {};

    if (playersSnap.empty) {
      container.innerHTML = "<p>No players yet.</p>";
      return;
    }

    const players = [];

    playersSnap.forEach(pDoc => {
      const p = pDoc.data();
      const picks = p.entries?.["2026"]?.picks || [];

      const approved = picks.filter(x => x.status === "approved");
      const pending  = picks.filter(x => x.status === "pending");

      players.push({
        name: p.name,
        approved,
        pending,
        totalCount: approved.length + pending.length
      });
    });

    players.sort((a, b) => a.name.localeCompare(b.name));

    const pickCount = {};
    players.forEach(p =>
      p.approved.forEach(x => {
        if (x.normalizedName) {
          pickCount[x.normalizedName] =
            (pickCount[x.normalizedName] || 0) + 1;
        }
      })
    );

    container.innerHTML = "";

    players.forEach(player => {
      let rows = "";
      let totalPotential = 0;

      player.approved.forEach(pick => {
        const age = calculateAge(pick.birthDate);
        const pts = calculatePotentialPoints(age);
        totalPotential += pts ?? 0;

        rows += `
          <tr>
            <td>${pick.normalizedName || pick.raw}</td>
            <td>${age ?? "—"}</td>
            <td>${pts ?? "—"}</td>
            <td>${pickCount[pick.normalizedName] || 1}</td>
          </tr>
        `;
      });

      if (!rows) {
        rows = `<tr><td colspan="4" class="empty-list">No approved picks yet</td></tr>`;
      }

      const badges = renderBadgesForPlayer(player.name, badgeData);

      container.insertAdjacentHTML(
        "beforeend",
        `
        <section class="player-list">
          <h2>
            ${player.name}
            ${badges}
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
                <td>Total</td><td></td><td>${totalPotential}</td><td></td>
              </tr>
            </tbody>
          </table>
        </section>
        `
      );
    });

  } catch (err) {
    console.error("lists.js failed:", err);
    container.innerHTML = "<p>Failed to load lists.</p>";
  }
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderLists);
