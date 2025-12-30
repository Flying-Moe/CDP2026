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
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   ADMIN ANALYTICS
===================================================== */

async function loadAdminAnalytics() {
  const todayKey = new Date().toISOString().slice(0, 10);

  const totalRef = doc(db, "analytics", "site");
const todayRef = doc(
  collection(db, "analytics", "site", "daily"),
  todayKey
);

  const [totalSnap, todaySnap] = await Promise.all([
    getDoc(totalRef),
    getDoc(todayRef)
  ]);

  document.getElementById("a-total").textContent =
    totalSnap.exists() ? totalSnap.data().totalViews || 0 : 0;

  document.getElementById("a-today").textContent =
    todaySnap.exists() ? todaySnap.data().views || 0 : 0;

  const cutoff = Timestamp.fromMillis(Date.now() - 60000);

const liveQuery = query(
  collection(db, "analytics", "site", "liveSessions"),
  where("lastSeen", ">", cutoff)
);

  const liveSnap = await getDocs(liveQuery);
  document.getElementById("a-live").textContent = liveSnap.size;

  document.getElementById("admin-analytics").classList.remove("hidden");
}

/* =====================================================
   WIKI LOOKUP CACHE (SESSION)
===================================================== */

export const wikiCache = new Map();

/* =====================================================
   SCORE & AGE ENGINE (single source of truth)
===================================================== */

export function calculateAgeAtDeath(birthISO, deathISO) {
  if (!birthISO) return null;

  const birth = new Date(birthISO);
  if (isNaN(birth)) return null;

  let endDate = null;

  // 🔑 Brug deathDate hvis den findes og er gyldig
  if (typeof deathISO === "string" && deathISO.trim() !== "") {
    const d = new Date(deathISO);
    if (!isNaN(d)) {
      endDate = d;
    }
  }

  // 🔁 Fallback: stadig i live → brug dags dato
  if (!endDate) {
    endDate = new Date();
  }

  let age = endDate.getFullYear() - birth.getFullYear();

  const hadBirthday =
    endDate.getMonth() > birth.getMonth() ||
    (endDate.getMonth() === birth.getMonth() &&
      endDate.getDate() >= birth.getDate());

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
  const scoreHistory = player.scoreHistory || [];

  let hitPoints = 0;
  let hits = 0;

  picks.forEach(pick => {
    if (pick.status !== "approved") return;
    if (!pick.birthDate) return;
    if (!pick.deathDate) return;

    const points = calculateHitPoints(
      pick.birthDate,
      pick.deathDate
    );

    if (points > 0) {
      hitPoints += points;
      hits++;
    }
  });

  // 🔑 penalty = SUM af alle delta (negative tal)
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
    penalty,        // fx -3
    totalScore,     // fx 45
    approvedCount
  };
}

/**
 * Fælles score-table builder (READ-ONLY)
 * Bruges af stats, leaderboard og badges
 */
export function buildScoreTable(players, year = "2026") {
  const result = [];

  players.forEach(player => {
    const entry = player.entries?.[year];
    if (!entry || entry.active === false) return;

    const {
      hitPoints,
      hits,
      penalty,
      totalScore,
      approvedCount
    } = calculatePlayerTotals(player);

    result.push({
      id: player.id,
      name: player.name,
      total: totalScore,
      hits,
      penalty,
      approvedCount,
      picks: entry.picks || []
    });
  });

  return result;
}

/* =====================================================
   GENERIC HELPERS
===================================================== */

export function formatDateForDisplay(isoDate) {
  if (!isoDate || !isoDate.includes("-")) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

// =====================================================
// ADMIN DATA CACHE (SESSION) – REDUCERER READS
// =====================================================

const __adminCache = {
  ttlMs: 60_000, // 60 sek
  collections: new Map(), // key: "players"/"people" -> { at:number, snap:any }
};

export function invalidateAdminCache(...names) {
  if (!names.length) {
    __adminCache.collections.clear();
    return;
  }
  names.forEach(n => __adminCache.collections.delete(n));
}

async function getCollectionCached(name, force = false) {
  const now = Date.now();
  const hit = __adminCache.collections.get(name);

  if (!force && hit && (now - hit.at) < __adminCache.ttlMs) {
    return hit.snap;
  }

  const snap = await getDocs(collection(db, name));
  __adminCache.collections.set(name, { at: now, snap });
  return snap;
}

export async function getPlayersSnap(force = false) {
  return getCollectionCached("players", force);
}

export async function getPeopleSnap(force = false) {
  return getCollectionCached("people", force);
}

// 🔄 OFFICIEL HARD REFRESH (respekterer scope)
export async function refreshAdminViews(options = {}) {
  const { force = false } = options;

  if (force) {
    // 🔥 Invalider ALLE relevante caches
    invalidateAdminCache("players", "people");

    // global player-caches (bruges af lists / validate)
    window.__players = null;
    window.__playersCache = null;
    window.__listsPlayers = null;

    // 🔁 Reload data (bygger state)
    await loadPlayers({ force: true });
    await loadPeople({ force: true });
  }

  // 🔁 Trigger korrekt render via aktiv tab
  const activeBtn = document.querySelector("#admin-tabs button.active");
  if (activeBtn) {
    activeBtn.click();
  }
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
  const STORAGE_KEY = "cdp_admin_active_tab";

  const buttons = document.querySelectorAll("#admin-tabs button");
  const contents = document.querySelectorAll(".tab-content");

async function activateTab(tabId) {
  // 🔒 Luk ALLE åbne modals før tab-skift
  document.querySelectorAll(".modal:not(.hidden)").forEach(modal => {
    modal.classList.add("hidden");
  });

  buttons.forEach(b => b.classList.remove("active"));
  contents.forEach(c => (c.style.display = "none"));

  const btn = document.querySelector(`#admin-tabs button[data-tab="${tabId}"]`);
  const content = document.getElementById(`tab-${tabId}`);

  if (!btn || !content) return;

  btn.classList.add("active");
  content.style.display = "block";

  localStorage.setItem(STORAGE_KEY, tabId);

  // 🔄 Refresh relevant data
  if (tabId === "players") {
    await loadPlayers();
  }

  if (tabId === "people") {
    await loadPeople();
  }
}

  buttons.forEach(btn => {
    btn.onclick = () => activateTab(btn.dataset.tab);
  });

  // 🔑 Restore last active tab (fallback: players)
  const savedTab = localStorage.getItem(STORAGE_KEY) || "players";
  activateTab(savedTab);
}

document.addEventListener("DOMContentLoaded", () => {
  const loginSection  = document.getElementById("login-section");
  const adminSection  = document.getElementById("admin-section");
  const isAdminPage = !!loginSection && !!adminSection;
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
  if (!isAdminPage) return;

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

// 🔒 INIT-SEKVENS – KØRER KUN ÉN GANG
if (adminInitialized) return;
adminInitialized = true;

await autoLinkApprovedPicks();

// Tabs loader selv den relevante data.
// (Nu med cache + uden dobbelt-reads)
setupTabs();

   // 📊 Load site activity counters (admin only)
  await loadAdminAnalytics();
   
});

  /* =====================================================
   MODAL BEHAVIOR (ESC + OVERLAY + DIRTY CHECK)
===================================================== */

const modalState = new Map();

function markModalDirty(modal) {
  modalState.set(modal, true);
}

function clearModalDirty(modal) {
  modalState.set(modal, false);
}

function isModalDirty(modal) {
  return modalState.get(modal) === true;
}

function closeModal(modal) {
  clearModalDirty(modal);
  modal.classList.add("hidden");
}

function confirmCloseIfDirty(modal) {
  if (!isModalDirty(modal)) {
    closeModal(modal);
    return;
  }

  if (confirm("You have unsaved changes. Close anyway?")) {
    closeModal(modal);
  }
}

/* ESC key */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;

  document.querySelectorAll(".modal:not(.hidden)").forEach(modal => {
    confirmCloseIfDirty(modal);
  });
});

/* Overlay click */
document.addEventListener("click", e => {
  const modal = e.target.classList?.contains("modal")
    ? e.target
    : null;

  if (!modal || modal.classList.contains("hidden")) return;

  confirmCloseIfDirty(modal);
});

/* Input change tracking */
document.addEventListener("input", e => {
  const modal = e.target.closest(".modal");
  if (!modal) return;

  // Ignorér programmatisk init
  if (e.isTrusted !== true) return;

  markModalDirty(modal);
});

/* Expose helpers (bruges i save/cancel) */
window.__modalHelpers = {
  markModalDirty,
  clearModalDirty,
  closeModal
};
});

/* =====================================================
   MODAL DIRTY-STATE HELPERS
===================================================== */

export function attachModalDirtyTracking(modal) {
  if (!modal) return;

  let dirty = false;

  const markDirty = () => {
    dirty = true;
  };

  modal.querySelectorAll("input, textarea, select").forEach(el => {
    el.addEventListener("input", markDirty);
    el.addEventListener("change", markDirty);
  });

  modal.__isDirty = () => dirty;
  modal.__resetDirty = () => {
    dirty = false;
  };
}
