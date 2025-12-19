console.log("admin.core.js loaded");

import { loadPlayers } from "./admin.players.js";
import { loadPeople } from "./admin.people.js";

/* =====================================================
   FIREBASE
===================================================== */

import { auth, db } from "./firebase.js";

export { auth, db };

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
   WIKI LOOKUP CACHE (SESSION)
===================================================== */

export const wikiCache = new Map();

/* =====================================================
   GENERIC HELPERS
===================================================== */

// 🔄 OFFICIEL RE-RENDER (bruges af People-actions)
export async function refreshAdminViews() {
  await loadPlayers();
  await loadPeople();
}
export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseToISO(input) {
  if (!input) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const m = input.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!m) return "";

  const [, d, mth, y] = m;
  return `${y}-${mth.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseFlexibleDate(input) {
  if (!input) return "";

  const clean = input.trim().replace(/\s+/g, "-");
  const m = clean.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (!m) return "";

  const d = +m[1];
  const mth = +m[2];
  const y = +m[3];

  if (d < 1 || d > 31 || mth < 1 || mth > 12 || y < 1800 || y > 2100) {
    return "";
  }

  return `${y}-${String(mth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function splitLines(text) {
  return text
    .split(/\r?\n|,/)
    .map(l => l.trim())
    .filter(Boolean);
}

export function parsePickLine(line) {
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
   PEOPLE HELPERS
===================================================== */

export async function getOrCreatePerson(rawName, birthDate) {
  const name = rawName.trim();
  const normalized = normalizeName(name);
  const iso = birthDate || "";

  if (iso) {
    const qExact = query(
      collection(db, "people"),
      where("nameNormalized", "==", normalized),
      where("birthDate", "==", iso)
    );
    const exact = await getDocs(qExact);
    if (!exact.empty) return exact.docs[0].id;
  }

  const qName = query(
    collection(db, "people"),
    where("nameNormalized", "==", normalized)
  );
  const nameSnap = await getDocs(qName);
  if (!nameSnap.empty) return nameSnap.docs[0].id;

  const ref = await addDoc(collection(db, "people"), {
    name,
    nameNormalized: normalized,
    birthDate: iso,
    createdAt: new Date().toISOString()
  });

  return ref.id;
}

/* =====================================================
   WIKIPEDIA LOOKUP
===================================================== */

function monthNameToNumber(name) {
  const months = {
    january: 1, februar: 2, february: 2,
    march: 3, marts: 3,
    april: 4,
    may: 5, maj: 5,
    june: 6, juni: 6,
    july: 7, juli: 7,
    august: 8,
    september: 9,
    october: 10, oktober: 10,
    november: 11,
    december: 12
  };

  return months[name.toLowerCase()] || null;
}

export async function fetchBirthDateFromWikipedia(name) {
  const endpoints = [
    "https://en.wikipedia.org/api/rest_v1/page/summary/",
    "https://da.wikipedia.org/api/rest_v1/page/summary/"
  ];

  const encoded = encodeURIComponent(name);

  for (const base of endpoints) {
    try {
      const res = await fetch(base + encoded, {
        headers: { accept: "application/json" }
      });
      if (!res.ok) continue;

      const data = await res.json();
      if (!data.extract) continue;

      const patterns = [
        /born\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i,
        /born\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i,
        /født\s+(\d{1,2})\.\s*(\w+)\s+(\d{4})/i
      ];

      for (const p of patterns) {
        const m = data.extract.match(p);
        if (!m) continue;

        let day, month, year;

        if (isNaN(m[1])) {
          month = monthNameToNumber(m[1]);
          day = parseInt(m[2], 10);
          year = parseInt(m[3], 10);
        } else {
          day = parseInt(m[1], 10);
          month = monthNameToNumber(m[2]);
          year = parseInt(m[3], 10);
        }

        if (!month || day < 1 || day > 31) continue;

        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    } catch {}
  }

  return null;
}

/* =====================================================
   AUTO-LINK APPROVED PICKS
===================================================== */

export async function autoLinkApprovedPicks() {
  const peopleSnap  = await getDocs(collection(db, "people"));
  const playersSnap = await getDocs(collection(db, "players"));

  const peopleByNormalized = new Map();

  peopleSnap.forEach(d => {
    const p = d.data();
    peopleByNormalized.set(
      (p.nameNormalized || p.name).toLowerCase().trim(),
      { id: d.id, birthDate: p.birthDate || "" }
    );
  });

  for (const ps of playersSnap.docs) {
    const ref = doc(db, "players", ps.id);
    const data = ps.data();
    const picks = data.entries?.["2026"]?.picks || [];

    let changed = false;

    picks.forEach(p => {
      if (p.status !== "approved" || p.personId) return;

      const norm = (p.normalizedName || p.raw || "").toLowerCase().trim();
      const person = peopleByNormalized.get(norm);
      if (!person) return;

      p.personId = person.id;
      p.birthDate = person.birthDate || p.birthDate || "";
      changed = true;
    });

    if (changed) {
      await updateDoc(ref, { "entries.2026.picks": picks });
    }
  }
}

/* =====================================================
   AUTH + CORE DOM BOOTSTRAP
===================================================== */

export function setupTabs() {
  document.querySelectorAll("#admin-tabs button").forEach(btn => {
    btn.onclick = () => {
      document
        .querySelectorAll("#admin-tabs button")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      document
        .querySelectorAll(".tab-content")
        .forEach(c => (c.style.display = "none"));

      document.getElementById(`tab-${btn.dataset.tab}`).style.display = "block";
    };
  });

  document.querySelector('[data-tab="players"]')?.click();
}

document.addEventListener("DOMContentLoaded", () => {
  const loginSection  = document.getElementById("login-section");
  const adminSection  = document.getElementById("admin-section");
  const loginBtn      = document.getElementById("loginBtn");
  const logoutBtn     = document.getElementById("logoutBtn");
  const errorEl       = document.getElementById("login-error");
  const emailInput    = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  async function handleLogin() {
    errorEl.textContent = "";
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      errorEl.textContent = "Login failed";
    }
  }

  loginBtn?.addEventListener("click", handleLogin);
  logoutBtn?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  if (!user) {
    loginSection.style.display = "block";
    adminSection.style.display = "none";
    return;
  }

  const snap = await getDoc(doc(db, "admins", user.email));
  if (!snap.exists() || snap.data().active !== true) {
    await signOut(auth);
    return;
  }

  // ✅ AUTH OK
  loginSection.style.display = "none";
  adminSection.style.display = "block";

setupTabs();

// 🔑 INIT-SEKVENS (køres ÉN gang)
await autoLinkApprovedPicks();
await loadPlayers();
await loadPeople();

});
});
