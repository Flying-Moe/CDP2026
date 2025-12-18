console.log("lists.js loaded");

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

  // Map til "Picked by"-tæller
  const pickCount = {};

  playersSnap.forEach(pDoc => {
    const picks = pDoc.data().entries?.["2026"]?.picks || [];
    picks.forEach(p => {
      if (p.status === "approved" && p.normalizedName) {
        pickCount[p.normalizedName] =
          (pickCount[p.normalizedName] || 0) + 1;
      }
    });
  });

  container.innerHTML = "";

  playersSnap.forEach(pDoc => {
    const player = pDoc.data();
    const allPicks = player.entries?.["2026"]?.picks || [];

    // Kun approved + pending
    const picks = allPicks.filter(
      p => p.status === "approved" || p.status === "pending"
    );

    const approved = picks.filter(p => p.status === "approved");
    const pending  = picks.filter(p => p.status === "pending");

    const totalCount = approved.length + pending.length;

    const section = document.createElement("section");
    section.className = "player-list";

    let rows = "";
    let totalPotential = 0;

    approved.forEach(p => {
      const age = calculateAge(p.birthDate);
      const points = calculatePotentialPoints(age);
      totalPotential += points ?? 0;

      rows += `
        <tr>
          <td>${p.normalizedName || p.raw}</td>
          <td>${age ?? "—"}</td>
          <td>${points ?? "—"}</td>
          <td>${pickCount[p.normalizedName] || 1}</td>
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

    section.innerHTML = `
      <h2>
        ${player.name}
        <span class="count">(${totalCount}/20)</span>
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
