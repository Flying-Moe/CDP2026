import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* -----------------------
   DOM-LOGIK (VIGTIGT)
------------------------ */

document.addEventListener("DOMContentLoaded", () => {

  const loginSection = document.getElementById("login-section");
  const adminSection = document.getElementById("admin-section");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const errorEl = document.getElementById("login-error");

  loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      errorEl.textContent = "Login failed";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  onAuthStateChanged(auth, async user => {
    if (!user) {
      loginSection.style.display = "block";
      adminSection.style.display = "none";
      return;
    }

    // Firestore admin check
    const adminRef = doc(db, "admins", user.email);
    const snap = await getDoc(adminRef);

    if (!snap.exists() || snap.data().active !== true) {
      errorEl.textContent = "Not authorized";
      await signOut(auth);
      return;
    }

    loginSection.style.display = "none";
    adminSection.style.display = "block";

    // VIGTIGT: loadPlayers må ikke crashe
    loadPlayers();
  });

});

/* -----------------------
   PLAYERS (MIDLERIDIG SIKKER)
------------------------ */

async function loadPlayers() {
  // Midlertidig noop
  // Den gamle players-list + selectPlayer er fjernet
  // Ny tabel-baseret Players UI kobles på senere
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
