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

function isoToDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

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

      document.querySelectorAll("#admin-tabs button")
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const tab = btn.dataset.tab;

      document.querySelectorAll(".tab-content")
        .forEach(c => (c.style.display = "none"));

      const el = document.getElementById(`tab-${tab}`);
      if (el) el.style.display = "block";
    });
  });

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
    const picks = entry?.picks || [];

    let approved = 0;
    let pending = 0;
    let rejected = 0;

    picks.forEach(p => {
      if (p.status === "approved") approved++;
      else if (p.status === "rejected") rejected++;
      else pending++;
    });

    const tr = document.createElement("tr");
    if (player.active === false) tr.style.opacity = "0.5";

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

  document.querySelectorAll(".validate-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openValidateModal(btn.dataset.id);
    });
  });
}

/* =====================================================
   VALIDATE PICKS
===================================================== */

async function openValidateModal(playerId) {
  const snap = await getDoc(doc(db, "players", playerId));
  if (!snap.exists()) return;

  const modal = document.getElementById("validate-picks-modal");
  const tbody = document.querySelector("#validate-picks-table tbody");

  const picks = snap.data().entries["2026"].picks || [];
  tbody.innerHTML = "";

  picks
    .sort((a, b) =>
      ["approved", "pending", "rejected"].indexOf(a.status) -
      ["approved", "pending", "rejected"].indexOf(b.status)
    )
    .forEach((pick, index) => {

      const tr = document.createElement("tr");
      if (pick.status === "rejected") tr.style.opacity = "0.4";

      tr.innerHTML = `
        <td>${pick.name}</td>
        <td>
          <input type="date" value="${pick.birthDate || ""}"
                 data-index="${index}">
        </td>
        <td>${pick.status}</td>
        <td>
          <button data-action="approve" data-index="${index}">
            Approve
          </button>
          <button data-action="reject" data-index="${index}">
            Reject
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

  tbody.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      handlePickAction(
        playerId,
        btn.dataset.action,
        btn.dataset.index
      );
    });
  });

  modal.classList.remove("hidden");
}

async function handlePickAction(playerId, action, index) {
  const ref = doc(db, "players", playerId);
  const snap = await getDoc(ref);
  const picks = snap.data().entries["2026"].picks;

  const input = document.querySelector(
    `input[data-index="${index}"]`
  );

  const iso = parseToISO(input.value);

  if (action === "approve") {
    if (!iso) {
      alert("Birth date required");
      return;
    }

    const q = query(
      collection(db, "people"),
      where("name", "==", picks[index].name),
      where("birthDate", "==", iso)
    );

    const existing = await getDocs(q);

    let personId;
    if (existing.empty) {
      const newDoc = await addDoc(collection(db, "people"), {
        name: picks[index].name,
        birthDate: iso
      });
      personId = newDoc.id;
    } else {
      personId = existing.docs[0].id;
    }

    picks[index].status = "approved";
    picks[index].birthDate = iso;
    picks[index].personId = personId;
  }

  if (action === "reject") {
    picks[index].status = "rejected";
  }

  await updateDoc(ref, {
    "entries.2026.picks": picks
  });

  openValidateModal(playerId);
  loadPlayers();
}

document.getElementById("close-validate-btn")
  ?.addEventListener("click", () => {
    document.getElementById("validate-picks-modal")
      .classList.add("hidden");
  });

/* =====================================================
   PEOPLE (UÆNDRET LOGIK)
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

    const tr = document.createElement("tr");
    const hasBirth = !!p.birthDate;

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

/* ---------- People actions ---------- */

document.getElementById("add-person-btn")
  ?.addEventListener("click", async () => {

    const name = document.getElementById("new-person-name").value.trim();
    const birthDate = document.getElementById("new-person-birthdate").value;

    if (!name) return alert("Name is required");

    await addDoc(collection(db, "people"), {
      name,
      birthDate: birthDate || ""
    });

    document.getElementById("new-person-name").value = "";
    document.getElementById("new-person-birthdate").value = "";

    loadPeople();
  });

function wirePeopleActions() {
  document.querySelectorAll(".edit-person").forEach(btn => {
    btn.onclick = () => openEditPerson(btn.dataset.id);
  });

  document.querySelectorAll(".delete-person").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Delete this person permanently?")) return;
      await deleteDoc(doc(db, "people", btn.dataset.id));
      loadPeople();
    };
  });
}

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

document.getElementById("cancel-person-btn")
  ?.addEventListener("click", () => {
    document.getElementById("edit-person-modal")
      .classList.add("hidden");
    currentPersonId = null;
  });

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

    await updateDoc(doc(db, "people", currentPersonId), {
      name,
      birthDate
    });

    document.getElementById("edit-person-modal")
      .classList.add("hidden");

    loadPeople();
  });
