console.log("admin.players.js loaded");

/* =====================================================
   IMPORTS
===================================================== */

import {
  db,
  normalizeName,
  parseFlexibleDate,
  parsePickLine,
  splitLines,
  getOrCreatePerson
} from "./admin.core.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   PLAYER OVERVIEW
===================================================== */

export async function loadPlayers() {
  const snap = await getDocs(collection(db, "players"));

  const activeBody = document.querySelector("#players-table tbody");
  const inactiveBody = document.querySelector("#inactive-players-table tbody");

  if (activeBody) activeBody.innerHTML = "";
  if (inactiveBody) inactiveBody.innerHTML = "";

  snap.forEach(docu => {
    const p = docu.data();
    const picks = p.entries?.["2026"]?.picks || [];

    let approved = 0;
    let pending = 0;

    picks.forEach(x => {
      if (x.status === "approved") approved++;
      else pending++;
    });

    if (p.active !== false && activeBody) {
      activeBody.innerHTML += `
        <tr>
          <td>${p.name}</td>
          <td>${approved}</td>
          <td>${pending}</td>
          <td>
            <button class="validate-btn" data-id="${docu.id}">Validate</button>
            <button class="minus-btn" data-id="${docu.id}">−1</button>
            <button class="undo-minus-btn" data-id="${docu.id}">Undo</button>
            <button disabled>Edit</button>
            <button class="delete-player-btn" data-id="${docu.id}">Deactivate</button>
          </td>
        </tr>
      `;
    }

    if (p.active === false && inactiveBody) {
      inactiveBody.innerHTML += `
        <tr style="opacity:.6">
          <td>${p.name}</td>
          <td>
            <button class="restore-player-btn" data-id="${docu.id}">Restore</button>
            <button class="perma-delete-player-btn" data-id="${docu.id}">Delete permanently</button>
          </td>
        </tr>
      `;
    }
  });

  bindPlayerActions();
}

/* =====================================================
   PLAYER ACTIONS
===================================================== */

function bindPlayerActions() {
  document.querySelectorAll(".validate-btn").forEach(b =>
    b.onclick = () => openValidateModal(b.dataset.id)
  );

  document.querySelectorAll(".minus-btn").forEach(b =>
    b.onclick = () => giveMinusPoint(b.dataset.id)
  );

  document.querySelectorAll(".undo-minus-btn").forEach(b =>
    b.onclick = () => undoMinusPoint(b.dataset.id)
  );

  document.querySelectorAll(".delete-player-btn").forEach(b =>
    b.onclick = async () => {
      if (!confirm("Deactivate this player?")) return;
      await updateDoc(doc(db, "players", b.dataset.id), { active: false });
      loadPlayers();
    }
  );

  document.querySelectorAll(".restore-player-btn").forEach(b =>
    b.onclick = async () => {
      await updateDoc(doc(db, "players", b.dataset.id), { active: true });
      loadPlayers();
    }
  );

  document.querySelectorAll(".perma-delete-player-btn").forEach(b =>
    b.onclick = async () => {
      const ref = doc(db, "players", b.dataset.id);
      const snap = await getDoc(ref);
      const name = snap.exists() ? snap.data().name : "this player";

      if (!confirm(`PERMANENTLY delete "${name}"?`)) return;
      await deleteDoc(ref);
      loadPlayers();
    }
  );
}

/* =====================================================
   ADD PLAYER
===================================================== */

document.getElementById("add-player-btn")?.addEventListener("click", async () => {
  const input = document.getElementById("new-player-name");
  const name = input.value.trim();
  if (!name) return;

  await addDoc(collection(db, "players"), {
    name,
    active: true,
    locked: false,
    score: 0,
    scoreHistory: [],
    firstBlood: false,
    entries: { "2026": { picks: [] } },
    createdAt: new Date().toISOString()
  });

  input.value = "";
  loadPlayers();
});

/* =====================================================
   VALIDATE PICKS MODAL
===================================================== */

let currentValidatePlayerId = null;

export async function openValidateModal(playerId) {
  currentValidatePlayerId = playerId;

  const snap = await getDoc(doc(db, "players", playerId));
  if (!snap.exists()) return;

  const picks = snap.data().entries?.["2026"]?.picks || [];
  const tbody = document.querySelector("#validate-picks-table tbody");
  const textarea = document.getElementById("import-picks");

  if (textarea) textarea.value = "";
  tbody.innerHTML = "";

  picks.forEach(pick => {
    tbody.innerHTML += `
      <tr>
        <td>
          <input class="name-input" data-id="${pick.id}"
            value="${pick.normalizedName || pick.raw || ""}"
            ${pick.status === "approved" ? "disabled" : ""}>
        </td>
        <td>
          <input class="date-input" data-id="${pick.id}"
            value="${pick.birthDate || ""}"
            ${pick.status === "approved" ? "disabled" : ""}>
        </td>
        <td>${pick.status}</td>
        <td>
          ${pick.status !== "approved"
            ? `<button data-id="${pick.id}" data-action="approve">Approve</button>`
            : ""}
          <button data-id="${pick.id}" data-action="delete">Delete</button>
        </td>
      </tr>
    `;
  });

  tbody.querySelectorAll("button").forEach(btn =>
    btn.onclick = () => handlePickAction(btn.dataset.id, btn.dataset.action)
  );

  document.getElementById("validate-picks-modal").classList.remove("hidden");
}

document.getElementById("close-validate-btn")?.addEventListener("click", () => {
  document.getElementById("validate-picks-modal").classList.add("hidden");
});

/* =====================================================
   IMPORT PICKS
===================================================== */

document.getElementById("import-picks-btn")?.addEventListener("click", async () => {
  if (!currentValidatePlayerId) return;

  const textarea = document.getElementById("import-picks");
  const rawText = textarea.value.trim();
  if (!rawText) return;

  const ref = doc(db, "players", currentValidatePlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const existing = snap.data().entries["2026"].picks || [];
  const newPicks = splitLines(rawText).map(parsePickLine);

  await updateDoc(ref, {
    "entries.2026.picks": [...existing, ...newPicks]
  });

  textarea.value = "";
  openValidateModal(currentValidatePlayerId);
  loadPlayers();
});

/* =====================================================
   APPROVE / DELETE SINGLE PICK
===================================================== */

async function handlePickAction(pickId, action) {
  const ref = doc(db, "players", currentValidatePlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const picks = snap.data().entries["2026"].picks || [];
  const index = picks.findIndex(p => p.id === pickId);
  if (index === -1) return;

  const pick = picks[index];

  if (action === "delete") {
    picks.splice(index, 1);
  }

  if (action === "approve") {
    const nameInput = document.querySelector(`.name-input[data-id="${pickId}"]`);
    const dateInput = document.querySelector(`.date-input[data-id="${pickId}"]`);

    const rawName = nameInput.value.trim();
    const iso = parseFlexibleDate(dateInput.value);
    const personId = await getOrCreatePerson(rawName, iso);

    picks[index] = {
      ...pick,
      normalizedName: rawName,
      birthDate: iso,
      personId,
      status: "approved"
    };
  }

  await updateDoc(ref, { "entries.2026.picks": picks });
  openValidateModal(currentValidatePlayerId);
  loadPlayers();
}

/* =====================================================
   APPROVE ALL
===================================================== */

document.getElementById("approve-all-btn")
  ?.addEventListener("click", approveAllPicks);

async function approveAllPicks() {
  const ref = doc(db, "players", currentValidatePlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const picks = snap.data().entries?.["2026"]?.picks || [];

  for (const pick of picks) {
    if (pick.status === "approved") continue;
    const name = (pick.normalizedName || pick.raw || "").trim();
    const personId = await getOrCreatePerson(name, pick.birthDate || "");
    pick.personId = personId;
    pick.normalizedName = name;
    pick.status = "approved";
  }

  await updateDoc(ref, { "entries.2026.picks": picks });
  openValidateModal(currentValidatePlayerId);
  loadPlayers();
}

/* =====================================================
   SCORE & BADGES
===================================================== */

async function giveMinusPoint(playerId) {
  const ref = doc(db, "players", playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const p = snap.data();

  await updateDoc(ref, {
    score: (p.score || 0) - 1,
    scoreHistory: [...(p.scoreHistory || []), {
      delta: -1,
      at: new Date().toISOString(),
      reason: "admin"
    }]
  });

  loadPlayers();
}

async function undoMinusPoint(playerId) {
  const ref = doc(db, "players", playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const history = [...(snap.data().scoreHistory || [])];
  const idx = [...history].reverse().findIndex(h => h.delta === -1);
  if (idx === -1) return;

  history.splice(history.length - 1 - idx, 1);

  await updateDoc(ref, {
    score: (snap.data().score || 0) + 1,
    scoreHistory: history
  });

  loadPlayers();
}
