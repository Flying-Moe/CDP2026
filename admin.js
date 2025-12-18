
console.log("admin.js loaded");

import { auth, db } from "./firebase.js";

/* ========= AUTH ========= */
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* ========= FIRESTORE ========= */
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   HELPERS
===================================================== */

function parseToISO(input) {
  if (!input) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const m = input.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!m) return "";

  const [, d, mth, y] = m;
  return `${y}-${mth.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function splitLines(text) {
  return text
    .split(/\r?\n|,/)
    .map(l => l.trim())
    .filter(Boolean);
}

function parsePickLine(line) {
  const iso = parseToISO(line);
  const name = line
    .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{4}/, "")
    .replace(/\d{4}/, "")
    .trim();

return {
  id: crypto.randomUUID(),
  raw: line,
  normalizedName: name,
  birthDate: iso || "",
  status: "pending",
  personId: null
};

}

/* =====================================================
   DOM + AUTH (STABIL VERSION)
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const loginSection  = document.getElementById("login-section");
  const adminSection  = document.getElementById("admin-section");
  const loginBtn      = document.getElementById("loginBtn");
  const logoutBtn     = document.getElementById("logoutBtn");
  const errorEl       = document.getElementById("login-error");
  const emailInput    = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  // Defensive: modal kan eksistere eller ej
  document
    .getElementById("validate-picks-modal")
    ?.classList.add("hidden");

  async function handleLogin() {
    errorEl.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      errorEl.textContent = "Please enter email and password";
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      errorEl.textContent = "Login failed";
    }
  }

  // 🔐 Login handling
  loginBtn.addEventListener("click", handleLogin);

  emailInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });

  passwordInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });

  // 🔓 Logout
  logoutBtn.addEventListener("click", () => {
    signOut(auth);
  });

  // 🔁 Auth state observer
  onAuthStateChanged(auth, async user => {

    if (!user) {
      loginSection.style.display = "block";
      adminSection.style.display = "none";
      return;
    }

    try {
      const snap = await getDoc(doc(db, "admins", user.email));

      if (!snap.exists() || snap.data().active !== true) {
        errorEl.textContent = "Not authorized";
        await signOut(auth);
        return;
      }

      // ✅ Auth OK
      loginSection.style.display = "none";
      adminSection.style.display = "block";
      
console.log("AUTH OK – before setupTabs");

setupTabs();
console.log("after setupTabs");

loadPlayers();
console.log("after loadPlayers");

loadPeople();
console.log("after loadPeople");
      
      setupTabs();
      loadPlayers();
      loadPeople();

    } catch (err) {
      errorEl.textContent = "Authorization error";
      await signOut(auth);
    }
  });

  // =========================
  // ADD PLAYER (KORREKT PLACERET)
  // =========================
  const addPlayerBtn = document.getElementById("add-player-btn");
  if (addPlayerBtn) {
    addPlayerBtn.onclick = async () => {
      const input = document.getElementById("new-player-name");
      const name = input.value.trim();

      if (!name) {
        alert("Player name required");
        return;
      }

      await addDoc(collection(db, "players"), {
        name,
        active: true,
        locked: false,
        score: 0,
        scoreHistory: [],
        firstBlood: false,
        entries: {
          "2026": {
            picks: []
          }
        },
        createdAt: new Date().toISOString()
      });

      input.value = "";
      loadPlayers();
    };
  }
  
const closeValidateBtn = document.getElementById("close-validate-btn");
if (closeValidateBtn) {
  closeValidateBtn.addEventListener("click", () => {
    document
      .getElementById("validate-picks-modal")
      .classList.add("hidden");
  });
}

});

/* =====================================================
   TABS
===================================================== */

function setupTabs() {
  document.querySelectorAll("#admin-tabs button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#admin-tabs button")
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".tab-content")
        .forEach(c => c.style.display = "none");

      document.getElementById(`tab-${btn.dataset.tab}`).style.display = "block";
    };
  });

  const defaultTab = document.querySelector('[data-tab="players"]');
if (defaultTab) defaultTab.click();

}

/* =====================================================
   PLAYERS – OVERBLIK (STABIL VERSION)
===================================================== */

async function loadPlayers() {
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

    // ---------- ACTIVE ----------
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
            <button disabled title="Player editing not implemented yet">Edit</button>
            <button class="delete-player-btn" data-id="${docu.id}">Deactivate</button>
          </td>
        </tr>
      `;
    }

    // ---------- INACTIVE ----------
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

  // === BIND ACTIONS ===

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

      if (!confirm(`PERMANENTLY delete "${name}"?\nThis cannot be undone.`)) return;
      await deleteDoc(ref);
      loadPlayers();
    }
  );
}

/* =====================================================
   CELEBRITIES (tidl. People)
===================================================== */

async function loadPeople() {
  const snap = await getDocs(collection(db, "people"));
  const tbody = document.querySelector("#people-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  snap.forEach(d => {
    const p = d.data();

    tbody.innerHTML += `
      <tr>
        <td>${p.name}</td>
        <td>${p.birthDate || "—"}</td>
        <td>${p.birthDate ? "OK" : "Missing"}</td>
        <td>
          <button class="edit-person-btn" data-id="${d.id}">Edit</button>
          <button class="delete-person-btn" data-id="${d.id}">Delete</button>
        </td>
      </tr>
    `;
  });

  const editButtons = tbody.querySelectorAll(".edit-person-btn");
  editButtons.forEach(btn => {
    btn.onclick = () => openEditPerson(btn.dataset.id);
  });

  const deleteButtons = tbody.querySelectorAll(".delete-person-btn");
  deleteButtons.forEach(btn => {
    btn.onclick = () => deletePerson(btn.dataset.id);
  });
}

/* =====================================================
   PEOPLE – ADD NEW (STABIL + VALIDERET)
===================================================== */

const addPersonBtn = document.getElementById("add-person-btn");

if (addPersonBtn) {
  addPersonBtn.onclick = async () => {
    const nameInput = document.getElementById("new-person-name");
    const dateInput = document.getElementById("new-person-birthdate");

    const name = nameInput?.value.trim();
    const rawDate = dateInput?.value.trim();
    const iso = parseToISO(rawDate);

    if (!name) {
      alert("Name is required");
      return;
    }

    if (!iso) {
      alert("Birth date must be DD-MM-YYYY");
      return;
    }

    // 🔍 undgå dubletter
    const q = query(
      collection(db, "people"),
      where("name", "==", name),
      where("birthDate", "==", iso)
    );

    const existing = await getDocs(q);
    if (!existing.empty) {
      alert("This person already exists");
      return;
    }

    await addDoc(collection(db, "people"), {
      name,
      birthDate: iso,
      createdAt: new Date().toISOString()
    });

    nameInput.value = "";
    dateInput.value = "";

    loadPeople();
  };
}

/* =====================================================
   PEOPLE – EDIT / DELETE ACTIONS
===================================================== */

let currentPersonId = null;

function openEditPerson(id) {
  currentPersonId = id;

  const modal = document.getElementById("edit-person-modal");
  const nameInput = document.getElementById("edit-person-name");
  const birthInput = document.getElementById("edit-person-birthdate");

  if (!modal || !nameInput || !birthInput) {
    alert("Edit modal not found");
    return;
  }

  getDoc(doc(db, "people", id)).then(snap => {
    if (!snap.exists()) {
      alert("Person not found");
      return;
    }

    const p = snap.data();
    nameInput.value = p.name || "";
    birthInput.value = p.birthDate || "";

    modal.classList.remove("hidden");
  });
}

function deletePerson(id) {
  if (!confirm("Delete this person permanently?")) return;

  deleteDoc(doc(db, "people", id)).then(() => {
    loadPeople();
  });
}

/* ===== SAVE EDITED PERSON ===== */

const savePersonBtn = document.getElementById("save-person-btn");
if (savePersonBtn) {
  savePersonBtn.onclick = async () => {
    if (!currentPersonId) return;

    const name = document
      .getElementById("edit-person-name")
      .value
      .trim();

    const birth = document
      .getElementById("edit-person-birthdate")
      .value
      .trim();

    if (!name) {
      alert("Name is required");
      return;
    }

    await updateDoc(doc(db, "people", currentPersonId), {
      name,
      birthDate: birth || ""
    });

    document
      .getElementById("edit-person-modal")
      .classList.add("hidden");

    currentPersonId = null;
    loadPeople();
  };
}

/* =====================================================
   VALIDATE PICKS – STABIL VERSION (MED IMPORT FIX)
===================================================== */

let currentValidatePlayerId = null;

async function openValidateModal(playerId) {
  currentValidatePlayerId = playerId;

  const snap = await getDoc(doc(db, "players", playerId));
  if (!snap.exists()) return;

  const picks = snap.data().entries?.["2026"]?.picks || [];
  const tbody = document.querySelector("#validate-picks-table tbody");
  const textarea = document.getElementById("import-picks");

  if (textarea) textarea.value = ""; // ✅ reset hver gang

  tbody.innerHTML = "";

  picks.forEach(pick => {
    tbody.innerHTML += `
      <tr>
        <td>
          <input
            type="text"
            class="name-input"
            data-id="${pick.id}"
            value="${pick.normalizedName || pick.raw || ""}"
            ${pick.status === "approved" ? "disabled" : ""}
          >
        </td>
        <td>
          <input
            type="text"
            class="date-input"
            data-id="${pick.id}"
            value="${pick.birthDate || ""}"
            placeholder="DD-MM-YYYY"
            ${pick.status === "approved" ? "disabled" : ""}
          >
        </td>
        <td>${pick.status}</td>
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

  tbody.querySelectorAll("button").forEach(btn => {
    btn.onclick = () =>
      handlePickAction(btn.dataset.id, btn.dataset.action);
  });

  document.getElementById("validate-picks-modal").classList.remove("hidden");
}

/* =====================================================
   IMPORT PICKS – KORREKT BUNDET
===================================================== */

const importBtn = document.getElementById("import-picks-btn");
const importTextarea = document.getElementById("import-picks");

if (importBtn && importTextarea) {
  importBtn.onclick = async () => {
    if (!currentValidatePlayerId) return;

    const rawText = importTextarea.value.trim();
    if (!rawText) return;

    const lines = splitLines(rawText);
    if (!lines.length) return;

    const ref = doc(db, "players", currentValidatePlayerId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const existing = snap.data().entries["2026"].picks || [];
    const newPicks = lines.map(parsePickLine);

    await updateDoc(ref, {
      "entries.2026.picks": [...existing, ...newPicks]
    });

    importTextarea.value = ""; // ✅ nulstil efter import

    openValidateModal(currentValidatePlayerId);
    loadPlayers();
  };
}

/* -------- APPROVE / DELETE -------- */

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
    const nameInput = document.querySelector(
      `.name-input[data-id="${pickId}"]`
    );
    const dateInput = document.querySelector(
      `.date-input[data-id="${pickId}"]`
    );

    const name = nameInput?.value.trim();
    const iso = parseToISO(dateInput?.value);

    if (!name) {
      alert("Name required");
      return;
    }

    let personId = null;

    if (iso) {
      const q = query(
        collection(db, "people"),
        where("name", "==", name),
        where("birthDate", "==", iso)
      );

      const existing = await getDocs(q);

      if (existing.empty) {
        personId = (
          await addDoc(collection(db, "people"), {
            name,
            birthDate: iso
          })
        ).id;
      } else {
        personId = existing.docs[0].id;
      }
    }

    picks[index] = {
      ...pick,
      normalizedName: name,
      birthDate: iso || "",
      personId,
      status: "approved"
    };
  }

  await updateDoc(ref, {
    "entries.2026.picks": picks
  });

  openValidateModal(currentValidatePlayerId);
  loadPlayers();
}

/* =====================================================
   SCORE & BADGES (ADMIN)
===================================================== */

/* ---------- GENERIC SCORE CHANGE ---------- */

async function applyScore(playerId, delta) {
  const ref = doc(db, "players", playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const p = snap.data();
  const current = p.score || 0;

  await updateDoc(ref, {
    score: current + delta,
    scoreHistory: [
      ...(p.scoreHistory || []),
      {
        delta,
        at: new Date().toISOString()
      }
    ]
  });
}

/* ---------- ADMIN MINUS POINT ---------- */

async function giveMinusPoint(playerId) {
  if (!confirm("Give -1 point to this player?")) return;

  const ref = doc(db, "players", playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const p = snap.data();

  await updateDoc(ref, {
    score: (p.score || 0) - 1,
    scoreHistory: [
      ...(p.scoreHistory || []),
      {
        delta: -1,
        at: new Date().toISOString(),
        reason: "admin"
      }
    ]
  });

  loadPlayers();
}

async function undoMinusPoint(playerId) {
  const ref = doc(db, "players", playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const history = [...(snap.data().scoreHistory || [])];
  const index = [...history].reverse().findIndex(h => h.delta === -1);

  if (index === -1) {
    alert("No minus point to undo");
    return;
  }

  const realIndex = history.length - 1 - index;
  history.splice(realIndex, 1);

  await updateDoc(ref, {
    score: (snap.data().score || 0) + 1,
    scoreHistory: history
  });

  loadPlayers();
}

/* ---------- FIRST BLOOD (LEGACY MANUAL) ---------- */

async function setFirstBlood(playerId) {
  const ref = doc(db, "meta", "firstBlood");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = snap.data();

    if (existing.playerId === playerId) {
      if (!confirm("Remove First Blood from this player?")) return;

      await deleteDoc(ref);
      await updateDoc(doc(db, "players", playerId), {
        firstBlood: false
      });

      loadPlayers();
      return;
    } else {
      if (!confirm("Change First Blood to this player instead?")) return;

      await updateDoc(doc(db, "players", existing.playerId), {
        firstBlood: false
      });
    }
  }

  await setDoc(ref, {
    playerId,
    setAt: new Date().toISOString()
  });

  await updateDoc(doc(db, "players", playerId), {
    firstBlood: true
  });

  loadPlayers();
}
