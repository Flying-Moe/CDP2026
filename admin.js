import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

  // Check Firestore admin permission
  const adminRef = doc(db, "admins", user.email);
  const snap = await getDoc(adminRef);

  if (!snap.exists() || snap.data().active !== true) {
    errorEl.textContent = "Not authorized";
    await signOut(auth);
    return;
  }

  loginSection.style.display = "none";
  adminSection.style.display = "block";
});

import { collection, getDocs, doc, setDoc } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

async function loadPlayers() {
  const snap = await getDocs(collection(db, "players"));
  const list = document.getElementById("players-list");
  list.innerHTML = "";

  snap.forEach(docu => {
    const d = docu.data();
    const btn = document.createElement("button");
    btn.textContent = d.name;
    btn.onclick = () => selectPlayer(docu.id, d);
    list.appendChild(btn);
  });
}

async function savePlayer() {
  const id = document.getElementById("player-id").value.trim();
  const name = document.getElementById("player-name").value.trim();
  const paid = Number(document.getElementById("player-paid").value);

  if (!id || !name) return alert("Missing data");

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
