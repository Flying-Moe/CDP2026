console.log("admin.core.js loaded");

let adminInitialized = false;

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
   SCORE & AGE ENGINE (single source of truth)
===================================================== */

export function calculateAgeAtDeath(birthISO, deathISO) {
  if (!birthISO || !deathISO) return null;

  const birth = new Date(birthISO);
  const death = new Date(deathISO);

  let age = death.getFullYear() - birth.getFullYear();

  const hadBirthday =
    death.getMonth() > birth.getMonth() ||
    (death.getMonth() === birth.getMonth() &&
     death.getDate() >= birth.getDate());

  if (!hadBirthday) age--;

  return age;
}

export function calculateHitPoints(birthISO, deathISO) {
  const age = calculateAgeAtDeath(birthISO, deathISO);
  if (age === null) return 0;
  if (age >= 99) return 1;
  return Math.max(1, 100 - age);
}

/**
 * Beregner ALLE score-relaterede tal for en player
 * Dette er den ENESTE funktion views må bruge
 */
export function calculatePlayerTotals(player) {
  const picks = player.entries?.["2026"]?.picks || [];

  let hitPoints = 0;
  let hits = 0;

  picks.forEach(pick => {
    if (pick.status !== "approved") return;
    if (!pick.birthDate || !pick.deathDate) return;

    const points = calculateHitPoints(
      pick.birthDate,
      pick.deathDate
    );

    if (points > 0) {
      hitPoints += points;
      hits++;
    }
  });

  const scoreHistory = player.scoreHistory || [];

  // 🔑 VIGTIGT: penalty er SUMMEN af delta (NEGATIV)
  const penalty = scoreHistory.reduce(
    (sum, h) => sum + (h.delta || 0),
    0
  );

  const approvedCount = picks.filter(
    p => p.status === "approved"
  ).length;

  const totalScore = hitPoints + penalty;

  return {
    hitPoints,
    hits,
    penalty,       // fx -3
    totalScore,    // fx 45
    approvedCount
  };
}


/* =====================================================
   GENERIC HELPERS
===================================================== */

export function formatDateForDisplay(isoDate) {
  if (!isoDate || !isoDate.includes("-")) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

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

export async function fetchWikidataPerson(name) {
  if (!name) return null;

  const endpoint = "https://query.wikidata.org/sparql";

  // escape " i navne
  const safeName = name.replace(/"/g, '\\"');

  const query = `
    SELECT ?person ?personLabel ?birthDate ?deathDate WHERE {
      ?person wdt:P31 wd:Q5.
      {
        ?person rdfs:label "${safeName}"@da.
      }
      UNION
      {
        ?person rdfs:label "${safeName}"@en.
      }
      OPTIONAL { ?person wdt:P569 ?birthDate. }
      OPTIONAL { ?person wdt:P570 ?deathDate. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en,da". }
    }
    LIMIT 1
  `;

  const url =
    endpoint +
    "?query=" +
    encodeURIComponent(query) +
    "&format=json";

  const res = await fetch(url, {
    headers: {
      "Accept": "application/sparql+json",
    }
  });

  if (!res.ok) {
    throw new Error("Wikidata request failed");
  }

  const json = await res.json();
  const bindings = json.results.bindings;

  if (!bindings.length) return null;

  const row = bindings[0];

  return {
    label: row.personLabel?.value || name,
    birthDate: row.birthDate
      ? row.birthDate.value.split("T")[0]
      : null,
    deathDate: row.deathDate
      ? row.deathDate.value.split("T")[0]
      : null
  };
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
      p.deathDate = person.deathDate || p.deathDate || "";
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
btn.onclick = async () => {
  document
    .querySelectorAll("#admin-tabs button")
    .forEach(b => b.classList.remove("active"));

  btn.classList.add("active");

  document
    .querySelectorAll(".tab-content")
    .forEach(c => (c.style.display = "none"));

  const tabId = btn.dataset.tab;
  document.getElementById(`tab-${tabId}`).style.display = "block";

  // 🔄 Always refresh data when switching tabs
  if (tabId === "players") {
    await loadPlayers();
  }

  if (tabId === "people") {
    await loadPeople();
  }
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

  // 🔒 INIT-SEKVENS – KØRER KUN ÉN GANG
  if (adminInitialized) return;
  adminInitialized = true;

  await autoLinkApprovedPicks();
  await loadPlayers();
  await loadPeople();
   
});

  


});
