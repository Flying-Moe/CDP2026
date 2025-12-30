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
  getOrCreatePerson,
  formatDateForDisplay,
  calculatePlayerTotals,
  refreshAdminViews,
  attachModalDirtyTracking,
  getPlayersSnap
} from "./admin.core.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   PLAYER OVERVIEW
===================================================== */

function sortPlayers(players) {
  return players.sort((a, b) => {
    let A, B;

    switch (playersSortKey) {
      case "approved":
        A = a.approvedCount ?? 0;
        B = b.approvedCount ?? 0;
        break;

      case "score":
        A = a.score ?? 0;
        B = b.score ?? 0;
        break;

      case "name":
      default:
        A = (a.p?.name || "").toLowerCase();
        B = (b.p?.name || "").toLowerCase();
    }

    if (A === B) return 0;

    if (playersSortDir === "asc") {
      return A > B ? 1 : -1;
    } else {
      return A < B ? 1 : -1;
    }
  });
}

export async function loadPlayers(options = {}) {
  const { force = false } = options;
  const snap = await getPlayersSnap(force);

  const activeBody = document.querySelector("#players-table tbody");
  const inactiveBody = document.querySelector("#inactive-players-table tbody");

  if (activeBody) activeBody.innerHTML = "";
  if (inactiveBody) inactiveBody.innerHTML = "";

const activePlayers = [];
const inactivePlayers = [];

snap.forEach(docu => {
  const p = docu.data();

  const {
    hitPoints,
    penalty,
    approvedCount
  } = calculatePlayerTotals(p);

  const listActive =
    p.entries?.["2026"]?.active !== false;

  const scoreDisplay = listActive
    ? (penalty !== 0
        ? `${hitPoints} (${penalty}) = ${hitPoints + penalty}`
        : `${hitPoints}`)
    : "—";

  const rowData = {
    docu,
    p,
    approvedCount,
    score: hitPoints + penalty,
    scoreDisplay,
    listActive
  };

  if (p.active !== false) {
    activePlayers.push(rowData);
  } else {
    inactivePlayers.push(rowData);
  }
});

/* ---------- SORT ACTIVE PLAYERS ---------- */
sortPlayers(activePlayers);

/* ---------- RENDER ACTIVE ---------- */
activePlayers.forEach(({ docu, p, approvedCount, scoreDisplay, listActive }) => {
  if (!activeBody) return;

  activeBody.innerHTML += `
    <tr>
      <td>
        ${p.name}
        ${listActive ? "" : `<span title="List deactivated"> ❄️</span>`}
      </td>

      <td>
        ${listActive ? `${approvedCount} / 20` : "inactive"}
      </td>

      <td>${scoreDisplay}</td>

      <td>
        <button class="validate-btn" data-id="${docu.id}">Validate</button>
        <button class="minus-btn" data-id="${docu.id}" ${listActive ? "" : "disabled"}>−1</button>
        <button class="undo-minus-btn" data-id="${docu.id}" ${listActive ? "" : "disabled"}>Undo</button>
        <button class="edit-player-btn" data-id="${docu.id}">Edit</button>
        <button class="delete-player-btn" data-id="${docu.id}">Deactivate</button>
      </td>
    </tr>
  `;
});

/* ---------- RENDER INACTIVE (unchanged order) ---------- */
inactivePlayers.forEach(({ docu, p }) => {
  if (!inactiveBody) return;

  inactiveBody.innerHTML += `
    <tr style="opacity:.6">
      <td>${p.name}</td>
      <td>
        <button class="restore-player-btn" data-id="${docu.id}">Restore</button>
        <button class="perma-delete-player-btn" data-id="${docu.id}">Delete permanently</button>
      </td>
    </tr>
  `;
});

  bindPlayerActions();
}

document
  .querySelectorAll("#players-table th[data-sort]")
  .forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;

      if (playersSortKey === key) {
        playersSortDir =
          playersSortDir === "asc" ? "desc" : "asc";
      } else {
        playersSortKey = key;
        playersSortDir = "asc";
      }

      loadPlayers();
    });
  });

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

    const playerId = b.dataset.id;
    const row = b.closest("tr");

    // 1️⃣ OPTIMISTIC UI — fjern spilleren straks fra listen
    if (row) row.remove();

    // 2️⃣ FIRESTORE WRITE (sandheden)
    await updateDoc(doc(db, "players", playerId), { active: false });

    // 3️⃣ SILENT RELOAD (valgfri, men sikker)
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

  /* ---------- Edit player ---------- */

let currentEditPlayerId = null;

document.addEventListener("click", e => {
  const btn = e.target.closest(".edit-player-btn");
  if (!btn) return;

  const playerId = btn.dataset.id;
  const row = btn.closest("tr");
  if (!row) return;

  const nameCell = row.querySelector("td");
  const currentName = nameCell?.textContent?.trim();
  if (!currentName) return;

  currentEditPlayerId = playerId;

  const input = document.getElementById("edit-player-name");
  input.value = currentName;

  const modal = document.getElementById("edit-player-modal");
modal.classList.remove("hidden");
attachModalDirtyTracking(modal);
modal.__resetDirty();

});

document.getElementById("cancel-edit-player-btn")
  ?.addEventListener("click", () => {
    currentEditPlayerId = null;
    const modal = document.getElementById("edit-player-modal");
    if (modal.__isDirty && modal.__isDirty()) {
  if (!confirm("You have unsaved changes. Close anyway?")) return;
}

modal.classList.add("hidden");
currentEditPlayerId = null;

  });

document.getElementById("save-edit-player-btn")
  ?.addEventListener("click", async () => {

    if (!currentEditPlayerId) return;

    const input = document.getElementById("edit-player-name");
    const newName = (input.value || "").replace(/\s+/g, " ").trim();
    if (!newName) return;

    const ref = doc(db, "players", currentEditPlayerId);

await updateDoc(ref, {
  name: newName
});

// 🔄 Optimistic UI – opdatér navn direkte i tabellen
const row = document
  .querySelector(`.edit-player-btn[data-id="${ref.id}"]`)
  ?.closest("tr");

if (row) {
  const nameCell = row.querySelector("td");
  if (nameCell) nameCell.textContent = newName;
}

currentEditPlayerId = null;
document.getElementById("edit-player-modal")?.classList.add("hidden");

// ❌ ingen refresh her

  });

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
let currentValidateListActive = true;

let playersSortKey = "name"; // name | approved | score
let playersSortDir = "asc"; // asc | desc

export async function openValidateModal(playerId) {
  currentValidatePlayerId = playerId;

  const snap = await getDoc(doc(db, "players", playerId));
  if (!snap.exists()) return;

  const listActive =
  snap.data().entries?.["2026"]?.active !== false;

currentValidateListActive = listActive;

const title = document.getElementById("validate-title");
if (title) {
  const playerName = snap.data()?.name || "";

  title.textContent = listActive
    ? `Validate picks${playerName ? " – " + playerName : ""}`
    : `Validate picks${playerName ? " – " + playerName : ""} ❄️ (list deactivated)`;
}

const picks =
  snap.data().entries?.["2026"]?.picks || [];

  const tbody = document.querySelector("#validate-picks-table tbody");
  const textarea = document.getElementById("import-picks");

  if (textarea) textarea.value = "";
  tbody.innerHTML = "";

  /* ---------- duplicate detection ---------- */

  const seen = new Map();

  picks.forEach(p => {
    const key = p.personId || normalizeName(p.normalizedName || p.raw);
    seen.set(key, (seen.get(key) || 0) + 1);
  });

  /* ---------- render rows ---------- */

  picks.forEach(pick => {
    const key = pick.personId || normalizeName(pick.normalizedName || pick.raw);
    const isDuplicate = seen.get(key) > 1;

    tbody.innerHTML += `
      <tr class="${isDuplicate ? "status-duplicate" : ""} ${pick.deathDate ? "is-dead" : ""}">
<td>
  ${
    pick.status === "approved"
      ? `<span class="cell-text">${pick.normalizedName || pick.raw || ""}</span>`
      : `<input
           class="name-input"
           data-id="${pick.id}"
           value="${pick.normalizedName || pick.raw || ""}"
         >`
  }
  ${pick.deathDate ? `<span class="death-mark" title="Deceased">✞</span>` : ""}
</td>

<td>
  ${
    pick.status === "approved"
      ? `<span class="cell-text">${pick.birthDate ? formatDateForDisplay(pick.birthDate) : ""}</span>`
      : `<input
           class="date-input"
           data-id="${pick.id}"
           value="${pick.birthDate ? formatDateForDisplay(pick.birthDate) : ""}"
         >`
  }
</td>

        <td>
          ${pick.deathDate ? formatDateForDisplay(pick.deathDate) : "—"}
        </td>

        <td>
          ${pick.status}${isDuplicate ? " (duplicate)" : ""}
        </td>

        <td>
          ${
            pick.status !== "approved"
              ? `<button data-id="${pick.id}" data-action="approve">Approve</button>`
              : ""
          }
          <button data-id="${pick.id}" data-action="delete">Delete</button>
        </td>
      </tr>
    `;
  });

  /* ---------- bind actions ---------- */

  tbody.querySelectorAll("button").forEach(btn => {
    btn.onclick = () =>
      handlePickAction(btn.dataset.id, btn.dataset.action);
  });

  document
    .getElementById("validate-picks-modal")
    .classList.remove("hidden");
 const deactivateBtnUI =
  document.getElementById("deactivate-list-btn");

if (deactivateBtnUI) {
  deactivateBtnUI.textContent = currentValidateListActive
    ? "Deactivate list ❄️"
    : "Restore list";
}
}

/* ---------- close modal ---------- */

document
  .getElementById("close-validate-btn")
  ?.addEventListener("click", () => {
    document
      .getElementById("validate-picks-modal")
      .classList.add("hidden");
  });

/* ---------- July Sweep (UI only) ---------- */

const deactivateBtn = document.createElement("button");
deactivateBtn.id = "deactivate-list-btn";

const deleteBtn = document.getElementById("delete-all-picks-btn");
const julyBtn = document.getElementById("july-sweep-btn");

if (julyBtn) {

  const now = new Date();
  const july1 = new Date("2026-07-01");

  julyBtn.disabled = now < july1;

  julyBtn.onclick = () => {
    if (now < july1) {
      alert(
        "July Sweep can be activated from July 1st.\n\nThis replaces the active list."
      );
      return;
    }

    alert(
      "July Sweep activation will be implemented next.\n\nUI is ready."
    );
  };
}

document
  .getElementById("delete-all-picks-btn")
  ?.addEventListener("click", async () => {

    if (!currentValidatePlayerId) return;

    if (currentValidateListActive) {
      alert(
        "You must deactivate the list before it can be permanently deleted."
      );
      return;
    }

    if (
      !confirm(
        "PERMANENTLY delete this list?\n\nThis cannot be undone."
      )
    ) return;

    const ref = doc(db, "players", currentValidatePlayerId);

    await updateDoc(ref, {
      "entries.2026.picks": []
    });

    await loadPlayers();
    closeValidateModal();
  });

const modalActions = document.querySelector(
  "#validate-picks-modal .modal-content"
);

if (modalActions && !document.getElementById("deactivate-list-btn")) {
  const btn = document.createElement("button");
  btn.id = "deactivate-list-btn";
  modalActions.insertBefore(
    btn,
    document.getElementById("delete-all-picks-btn")
  );

  btn.addEventListener("click", async () => {
    if (!currentValidatePlayerId) return;

    const ref = doc(db, "players", currentValidatePlayerId);

    if (currentValidateListActive) {
      if (
        !confirm(
          "Deactivate this list?\n\nIt will be removed from the game but can be restored."
        )
      ) return;

      await updateDoc(ref, {
        "entries.2026.active": false
      });
    } else {
      await updateDoc(ref, {
        "entries.2026.active": true
      });
    }

    await loadPlayers();
    openValidateModal(currentValidatePlayerId);
  });
}

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

document
  .getElementById("approve-all-btn")
  ?.addEventListener("click", approveAllPicks);

async function approveAllPicks() {
  if (!currentValidatePlayerId) return;

  const ref = doc(db, "players", currentValidatePlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const textarea = document.getElementById("import-picks");
  const rawText = textarea?.value.trim();

  let picks = snap.data().entries?.["2026"]?.picks || [];

  // 🔹 1. Import fra textarea (hvis der er noget)
  if (rawText) {
    const lines = splitLines(rawText);
    const newPicks = lines
      .map(parsePickLine)
      .filter(p => p && p.raw);

    picks = [...picks, ...newPicks];
    textarea.value = "";
  }

  // 🔹 2. Approve ALLE picks
  for (const pick of picks) {
    if (pick.status === "approved") continue;

    const name = (pick.normalizedName || pick.raw || "").trim();
    if (!name) continue;

    const personId = await getOrCreatePerson(
      name,
      pick.birthDate || ""
    );

const personSnap = await getDoc(doc(db, "people", personId));
const person = personSnap.exists() ? personSnap.data() : {};

pick.personId = personId;
pick.normalizedName = name;
pick.birthDate = pick.birthDate || person.birthDate || "";
pick.deathDate = pick.deathDate || person.deathDate || "";
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
  // 1️⃣ OPTIMISTIC UI — opdatér in-memory player
  const playerRow = document.querySelector(
    `.minus-btn[data-id="${playerId}"]`
  )?.closest("tr");

  const snap = await getDoc(doc(db, "players", playerId));
  if (!snap.exists()) return;

  const player = snap.data();

  const scoreHistory = [...(player.scoreHistory || []), {
    delta: -1,
    at: new Date().toISOString(),
    reason: "admin"
  }];

  const tempPlayer = {
    ...player,
    scoreHistory
  };

  // 2️⃣ OPDATÉR DOM STRAKS
  if (playerRow) {
    const totals = calculatePlayerTotals(tempPlayer);
    const scoreCell = playerRow.querySelector("td:nth-child(3)");

    if (scoreCell) {
      scoreCell.textContent =
        totals.penalty !== 0
          ? `${totals.hitPoints} (${totals.penalty}) = ${totals.totalScore}`
          : `${totals.hitPoints}`;
    }
  }

  // 3️⃣ FIRESTORE WRITE (sandheden)
  const ref = doc(db, "players", playerId);
  await updateDoc(ref, {
    scoreHistory
  });

}

async function undoMinusPoint(playerId) {
  const ref = doc(db, "players", playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const player = snap.data();
  const history = [...(player.scoreHistory || [])];

  const idx = [...history].reverse().findIndex(h => h.delta === -1);
  if (idx === -1) return;

  history.splice(history.length - 1 - idx, 1);

  const tempPlayer = {
    ...player,
    scoreHistory: history
  };

  // 1️⃣ OPDATÉR DOM STRAKS
  const playerRow = document.querySelector(
    `.undo-minus-btn[data-id="${playerId}"]`
  )?.closest("tr");

  if (playerRow) {
    const totals = calculatePlayerTotals(tempPlayer);
    const scoreCell = playerRow.querySelector("td:nth-child(3)");

    if (scoreCell) {
      scoreCell.textContent =
        totals.penalty !== 0
          ? `${totals.hitPoints} (${totals.penalty}) = ${totals.totalScore}`
          : `${totals.hitPoints}`;
    }
  }

  // 2️⃣ FIRESTORE WRITE
  await updateDoc(ref, {
    scoreHistory: history
  });

}
