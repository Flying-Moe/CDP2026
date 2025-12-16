import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc
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
    } catch (err) {
      errorEl.textContent = "Login failed";
    }
  }

  // Klik på login
  loginBtn.addEventListener("click", handleLogin);

  // Enter i email / password
  function onEnter(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin();
    }
  }

  emailInput.addEventListener("keydown", onEnter);
  passwordInput.addEventListener("keydown", onEnter);

  // Logout
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  // Auth state
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
  });

});

/* -----------------------
   PLAYERS (MIDLERIDIG)
------------------------ */

async function loadPlayers() {
  // placeholder – implementeres senere
}

/* -----------------------
   GAMMEL SAVE (URØRT)
------------------------ */

async function savePlayer() {
  const id = document.getElementById("player-id")?.value?.trim();
  const name = document.getElementById("player-name")?.value?.trim();
  const paid = Number(document.getElementById("player-paid")?.value);

  if (!id || !name) {
    alert("Missing data");
    return;
  }

  await setDoc(doc(db, "players", id), {
    name,
    paid,
    entries: {
      2026: {
        initial: [],
        july: [],
        julyUsed: false
      }
    }
  }, { merge: true });

  loadPlayers();
}
