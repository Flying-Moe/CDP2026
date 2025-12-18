console.log("lists.js loaded");

import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   LOAD + RENDER PLAYER LISTS
===================================================== */

async function renderLists() {
  const container = document.getElementById("lists-container");
  if (!container) return;

  container.innerHTML = "<p>Loading lists…</p>";

  // Hent kun aktive spillere
  const playersSnap = await getDocs(
    query(collection(db, "players"), where("active", "==", true))
  );

  if (playersSnap.empty) {
    container.innerHTML = "<p>No players yet.</p>";
    return;
  }

  container.innerHTML = "";

  playersSnap.forEach(docu => {
    const p = docu.data();
    const picks = p.entries?.["2026"]?.picks || [];

    const approved = picks.filter(x => x.status === "approved");
    const pending  = picks.filter(x => x.status === "pending");
    const rejected = picks.filter(x => x.status === "rejected");

    const total = approved.length + pending.length + rejected.length;

    const listHtml = approved.length
      ? `
        <ol class="pick-list">
          ${approved.map(x => `
            <li>
              ${x.normalizedName || x.raw || "Unnamed"}
              ${x.birthDate ? `<span class="birthdate">(${x.birthDate})</span>` : ""}
            </li>
          `).join("")}
        </ol>
      `
      : `<p class="empty-list">No approved picks yet.</p>`;

    container.innerHTML += `
      <section class="player-list">
        <h3>
          ${p.name}
          <span class="count">
            ${approved.length}/20 approved
          </span>
        </h3>

        <div class="counts">
          <span>Approved: ${approved.length}</span>
          <span>Pending: ${pending.length}</span>
          <span>Rejected: ${rejected.length}</span>
        </div>

        ${listHtml}
      </section>
    `;
  });
}

/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", renderLists);
