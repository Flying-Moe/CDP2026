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
  setDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* -----------------------
   DOM-LOGIK
------------------------ */

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

  /* Login */
  loginBtn.addEventListener("click", handleLogin);

  function onEnter(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin();
    }
  }

  emailInput.addEventListener("keydown", onEnter);
  passwordInput.addEventListener("keydown", onEnter);

  /* Logout */
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  /* Auth state */
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

    loadPlayers();
    loadPeople();
  });
});

/* -----------------------
   PLAYERS (PLACEHOLDER)
------------------------ */

async function loadPlayers() {
  // implementeres senere
}

/* -----------------------
   PEOPLE
------------------------ */

async function loadPeople() {
  const snap = await getDocs(collection(db, "people"));
  const tbody = document.querySelector("#people-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  snap.forEach(docu => {
    const p = docu.data();
    const tr = document.createElement("tr");

    const hasBirth = !!p.birthDate;

    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.birthDate || "—"}</td>
      <td>${hasBirth ? "OK" : "Missing birth date"}</td>
      <td>
        <button data-id="${docu.id}" class="edit-person">Edit</button>
        <button data-id="${docu.id}" class="delete-person">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  wirePeopleActions();
}

document.getElementById("add-person-btn")?.addEventListener("click", async () => {
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

function wirePeopleActions() {
  document.querySelectorAll(".edit-person").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const ref = doc(db, "people", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const p = snap.data();

      const newName = prompt("Edit name:", p.name);
      if (!newName) return;

      const newBirth = prompt(
        "Edit birth date (YYYY-MM-DD):",
        p.birthDate || ""
      );

      await updateDoc(ref, {
        name: newName.trim(),
        birthDate: newBirth.trim()
      });

      loadPeople();
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
