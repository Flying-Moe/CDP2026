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
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   DOM + AUTH
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const loginSection = document.getElementById("login-section");
  const adminSection = document.getElementById("admin-section");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const errorEl = document.getElementById("login-error");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      errorEl.textContent = "Please enter email and password";
      return;
    }

    errorEl.textContent = "";

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      errorEl.textContent = "Login failed";
    }
  }

  loginBtn.addEventListener("click", handleLogin);

  function onEnter(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin();
    }
  }

  emailInput.addEventListener("keydown", onEnter);
  passwordInput.addEventListener("keydown", onEnter);

  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  onAuthStateChanged(auth, async user => {
    if (!user) {
      loginSection.style.display = "block";
      adminSection.style.display = "none";
      return;
    }

    const adminRef = doc(db, "admins", user.email);
    const snap = await getDoc(adminRef);

    if (!snap.exists() || snap.data().active !== true) {
      errorEl.textContent = "Not authorized";
      await signOut(auth);
      return;
    }

    loginSection.style.display = "none";
    adminSection.style.display = "block";

    setupTabs();
    loadPlayers();
    loadPeople();
  });
});

/* =====================================================
   TABS
===================================================== */

function setupTabs() {
  document.querySelectorAll("#admin-tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#admin-tabs button")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      const tab = btn.dataset.tab;
      document
        .querySelectorAll(".tab-content")
        .forEach(c => (c.style.display = "none"));

      const el = document.getElementById(`tab-${tab}`);
      if (el) el.style.display = "block";
    });
  });

  // Default = Players
  document.querySelector('[data-tab="players"]').click();
}

/* =====================================================
   PLAYERS – OVERBLIK
===================================================== */

async function loadPlayers() {
  const snap = await getDocs(collection(db, "players"));
  const tbody = document.querySelector("#players-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  snap.forEach(docu => {
    const player = docu.data();
    const entry = player.entries?.["2026"];

    let approved = 0;
    let pending = 0;
    let rejected = 0;

    if (entry?.picks && Array.isArray(entry.picks)) {
      entry.picks.forEach(p => {
        if (p.status === "approved") approved++;
        else if (p.status === "rejected") rejected++;
        else pending++;
      });
    }

    const tr = document.createElement("tr");

    if (player.active === false) {
      tr.style.opacity = "0.5";
    }

    tr.innerHTML = `
      <td>${player.name}</td>
      <td>${approved}</td>
      <td>${pending}</td>
      <td>${rejected}</td>
      <td>
        <button class="validate-btn" data-id="${docu.id}">
          Validate
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  wireValidateButtons();
}

function wireValidateButtons() {
  document.querySelectorAll(".validate-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const playerId = btn.dataset.id;
      console.log("TODO: open validate modal for player", playerId);
    });
  });
}

/* =====================================================
   PEOPLE
===================================================== */

let currentPersonId = null;
let cachedPeopleNames = [];

async function loadPeople() {
  const snap = await getDocs(collection(db, "people"));
  const tbody = document.querySelector("#people-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  cachedPeopleNames = [];

  snap.forEach(docu => {
    const p = docu.data();
    cachedPeopleNames.push(p.name);

    const hasBirth = !!p.birthDate;
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.birthDate || "—"}</td>
      <td>${hasBirth ? "OK" : "Missing birth date"}</td>
      <td>
        <button class="edit-person" data-id="${docu.id}">Edit</button>
        <button class="delete-person" data-id="${docu.id}">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  wirePeopleActions();
}

/* ---------- Add person ---------- */

document.getElementById("add-person-btn")
  ?.addEventListener("click", async () => {

    const name = document.getElementById("new-person-name").value.trim();
    const birthDate = document.getElementById("new-person-birthdate").value;

    if (!name) {
      alert("Name is required");
      return;
    }

    await addDoc(collection(db, "people"), {
      name,
      birthDate: birthDate || ""
    });

    document.getElementById("new-person-name").value = "";
    document.getElementById("new-person-birthdate").value = "";

    loadPeople();
  });

/* ---------- Edit / Delete ---------- */

function wirePeopleActions() {

  document.querySelectorAll(".edit-person").forEach(btn => {
    btn.addEventListener("click", () => {
      openEditPerson(btn.dataset.id);
    });
  });

  document.querySelectorAll(".delete-person").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this person permanently?")) return;
      await deleteDoc(doc(db, "people", btn.dataset.id));
      loadPeople();
    });
  });
}

/* ---------- Edit modal ---------- */

async function openEditPerson(id) {
  const ref = doc(db, "people", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const p = snap.data();
  currentPersonId = id;

  document.getElementById("edit-person-name").value = p.name;
  document.getElementById("edit-person-birthdate").value = p.birthDate || "";
  document.getElementById("person-warning").style.display = "none";

  document.getElementById("edit-person-modal")
    .classList.remove("hidden");
}

function closeEditPerson() {
  document.getElementById("edit-person-modal")
    .classList.add("hidden");
  currentPersonId = null;
}

document.getElementById("cancel-person-btn")
  ?.addEventListener("click", closeEditPerson);

document.getElementById("save-person-btn")
  ?.addEventListener("click", async () => {

    const name = document.getElementById("edit-person-name").value.trim();
    const birthDate = document.getElementById("edit-person-birthdate").value;
    const warning = document.getElementById("person-warning");

    if (!name) {
      warning.textContent = "Name is required";
      warning.style.display = "block";
      return;
    }

    const duplicates =
      cachedPeopleNames.filter(n =>
        n.toLowerCase() === name.toLowerCase()
      ).length > 1;

    if (duplicates) {
      warning.textContent =
        "Warning: another person with this name exists";
      warning.style.display = "block";
    } else if (!birthDate) {
      warning.textContent = "Warning: birth date missing";
      warning.style.display = "block";
    } else {
      warning.style.display = "none";
    }

    await updateDoc(doc(db, "people", currentPersonId), {
      name,
      birthDate
    });

    closeEditPerson();
    loadPeople();
  });
