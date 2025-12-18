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
   LOAD + RENDER LISTS
===================================================== */

async function renderLists() {
  const container = document.getElementById("lists");
  if (!container) return;

  container.innerHTML = "<p>Loading player lists…</p>";

  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );

  if (playersSnap.empty) {
    container.innerHTML = "<p>No players yet.</p>";
    return;
  }

  container.innerHTML = "";

  for (const pDoc of playersSnap.docs) {
    const p = pDoc.data();
    const picks = p.entries?.["2026"]?.picks || [];

    const section = document.createElement("section");
    section.className = "player-list";

    section.innerHTML = `
      <h2>${p.name}</h2>

      <table class="list-table">
        <thead>
          <tr>
            <th>Pick</th>
            <th>Birth date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${
            picks.length
              ? picks.map(renderPickRow).join("")
              : `<tr><td colspan="3" class="muted">No picks yet</td></tr>`
          }
        </tbody>
      </table>
    `;

    container.appendChild(section);
  }
}

/* =====================================================
   HELPERS
===================================================== */

function renderPickRow(pick) {
  const statusClass =
    pick.status === "approved"
      ? "status-approved"
      : pick.status === "rejected"
      ? "status-rejected"
      : "status-pending";

  return `
    <tr class="${statusClass}">
      <td>${pick.normalizedName || pick.raw || "—"}</td>
      <td>${pick.birthDate || "—"}</td>
      <td>${pick.status}</td>
    </tr>
  `;
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderLists);
