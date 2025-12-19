
console.log("admin.js loaded");

/* =====================================================
   WIKI LOOKUP CACHE (SESSION)
===================================================== */

const wikiCache = new Map();

/* =====================================================
   FIREBASE
===================================================== */

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

async function getOrCreatePerson(rawName, birthDate) {
  const name = rawName.trim();
  const normalized = normalizeName(name);
  const iso = birthDate || "";

  // 1. Prøv exact match (nameNormalized + birthDate)
  if (iso) {
    const qExact = query(
      collection(db, "people"),
      where("nameNormalized", "==", normalized),
      where("birthDate", "==", iso)
    );
    const exact = await getDocs(qExact);
    if (!exact.empty) {
      return exact.docs[0].id;
    }
  }

  // 2. Fallback: name only
  const qName = query(
    collection(db, "people"),
    where("nameNormalized", "==", normalized)
  );
  const nameSnap = await getDocs(qName);

  if (!nameSnap.empty) {
    return nameSnap.docs[0].id;
  }

  // 3. Opret ny person
  const ref = await addDoc(collection(db, "people"), {
    name,
    nameNormalized: normalized,
    birthDate: iso || "",
    createdAt: new Date().toISOString()
  });

  return ref.id;
}

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
   WIKIPEDIA LOOKUP – BIRTH DATE ONLY
===================================================== */

async function fetchBirthDateFromWikipedia(name) {
  const endpoints = [
    "https://en.wikipedia.org/api/rest_v1/page/summary/",
    "https://da.wikipedia.org/api/rest_v1/page/summary/"
  ];

  const encoded = encodeURIComponent(name);

  for (const base of endpoints) {
    try {
      const res = await fetch(base + encoded, {
        headers: { "accept": "application/json" }
      });

      if (!res.ok) continue;

      const data = await res.json();
      if (!data.extract) continue;

      const text = data.extract;

      // Match fx:
      // born December 24, 1954
      // født 24. december 1954
      // born 24 December 1954
      const patterns = [
        /born\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i,
        /born\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i,
        /født\s+(\d{1,2})\.\s*(\w+)\s+(\d{4})/i
      ];

      for (const p of patterns) {
        const m = text.match(p);
        if (!m) continue;

        let day, month, year;

        if (isNaN(m[1])) {
          // Month name first
          month = monthNameToNumber(m[1]);
          day = parseInt(m[2], 10);
          year = parseInt(m[3], 10);
        } else {
          // Day first
          day = parseInt(m[1], 10);
          month = monthNameToNumber(m[2]);
          year = parseInt(m[3], 10);
        }

        if (!month || day < 1 || day > 31) continue;

        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    } catch (err) {
      // Ignorer og prøv næste wiki
    }
  }

  return null;
}

/* ---------- helper ---------- */

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
        await loadPeople();
        await autoLinkApprovedPicks();
        await loadPeople();
        await loadPlayers();


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
   PEOPLE / CELEBRITIES – UNIFIED + ORPHANS (FINAL)
===================================================== */

function parseFlexibleDate(input) {
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

/* =====================================================
   PEOPLE TAB – DERIVED FROM APPROVED PICKS (FINAL)
===================================================== */

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadPeople() {
  const tbody = document.querySelector("#people-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const playersSnap = await getDocs(collection(db, "players"));
  const peopleSnap  = await getDocs(collection(db, "people"));

  /* --------------------------------------------
     1. Index existing people by ID
  -------------------------------------------- */

  

  /* --------------------------------------------
     2. Group ALL approved picks by normalized name
  -------------------------------------------- */

  const groups = new Map();

  playersSnap.forEach(ps => {
    const playerId = ps.id;
    const picks = ps.data().entries?.["2026"]?.picks || [];

    picks.forEach(pick => {
      if (pick.status !== "approved") return;

      const name = (pick.normalizedName || pick.raw || "").trim();
      if (!name) return;

      const key = normalizeName(name);

      if (!groups.has(key)) {
        groups.set(key, {
          displayName: name,
          picks: [],
          playerIds: new Set(),
          birthDates: new Set(),
          personIds: new Set()
        });
      }

      const g = groups.get(key);
      g.picks.push({ ...pick, playerId });
      g.playerIds.add(playerId);

      if (pick.birthDate) g.birthDates.add(pick.birthDate);
      if (pick.personId) g.personIds.add(pick.personId);
    });
  });

  /* --------------------------------------------
     3. Render rows (alphabetisk)
  -------------------------------------------- */

  [...groups.values()]
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" })
    )
    .forEach(g => {
      let status = "OK";
      if (g.birthDates.size === 0) status = "Missing";
      if (g.birthDates.size > 1) status = "Conflict";

      const usedBy = g.playerIds.size;
      const birthDate =
        g.birthDates.size === 1 ? [...g.birthDates][0] : "—";

      const showMerge = g.picks.length > 1;
      const showDelete = true;

      tbody.innerHTML += `
        <tr style="${status === "Conflict" ? "background:#ffeaea;" : ""}">
          <td>${g.displayName}</td>
          <td>${birthDate}</td>
          <td>${status}</td>
          <td>${usedBy}</td>
          <td>
            <button
              class="wiki-check-btn"
              data-name="${g.displayName}"
              data-key="${normalizeName(g.displayName)}"
            >
              Check Wikipedia
            </button>

            <span
              class="wiki-result"
              data-key="${normalizeName(g.displayName)}"
              style="margin-left:8px;font-size:0.9em;"
            ></span>
          </td>

          <td>
            ${
              showMerge
                ? `<button class="merge-people-btn"
                     data-name="${g.displayName}">
                     Merge
                   </button>`
                : ""
            }
            ${
              showDelete
                ? `<button class="delete-people-btn"
                     data-name="${g.displayName}">
                     Delete
                   </button>`
                : ""
            }
          </td>
        </tr>
      `;
    });

  /* --------------------------------------------
     4. MERGE (admin-click)
  -------------------------------------------- */

  tbody.querySelectorAll(".merge-people-btn").forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.name;
      const key = normalizeName(name);
      const group = groups.get(key);
      if (!group) return;

      // Canonical birthDate: keep if exactly one, else empty
      const birthDate =
        group.birthDates.size === 1 ? [...group.birthDates][0] : "";

      // Find or create canonical person
      let personId = null;

      if (group.personIds.size === 1) {
        personId = [...group.personIds][0];
      } else {
        const q = query(
          collection(db, "people"),
          where("nameNormalized", "==", key)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          personId = snap.docs[0].id;
        } else {
          personId = (
            await addDoc(collection(db, "people"), {
              name,
              nameNormalized: key,
              birthDate
            })
          ).id;
        }
      }

      // Update ALL picks in group
      for (const ps of playersSnap.docs) {
        const ref = doc(db, "players", ps.id);
        const data = ps.data();
        const picks = data.entries?.["2026"]?.picks || [];
        let changed = false;

        picks.forEach(p => {
          if (
            p.status === "approved" &&
            normalizeName(p.normalizedName || p.raw) === key
          ) {
            p.personId = personId;
            p.birthDate = birthDate;
            p.normalizedName = name;
            changed = true;
          }
        });

        if (changed) {
          await updateDoc(ref, {
            "entries.2026.picks": picks
          });
        }
      }

      loadPeople();
      loadPlayers();
    };
  });

  /* --------------------------------------------
     5. DELETE (admin-click)
  -------------------------------------------- */

  tbody.querySelectorAll(".delete-people-btn").forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.name;
      const key = normalizeName(name);

      if (!confirm(`Delete ALL picks named "${name}"?`)) return;

      for (const ps of playersSnap.docs) {
        const ref = doc(db, "players", ps.id);
        const data = ps.data();
        const picks = data.entries?.["2026"]?.picks || [];

        const filtered = picks.filter(
          p => normalizeName(p.normalizedName || p.raw) !== key
        );

        if (filtered.length !== picks.length) {
          await updateDoc(ref, {
            "entries.2026.picks": filtered
          });
        }
      }

      loadPeople();
      loadPlayers();
    };
  });
}

/* =====================================================
   PEOPLE – WIKIPEDIA CHECK (INLINE)
===================================================== */

document.addEventListener("click", async e => {
  const btn = e.target.closest(".wiki-check-btn");
  if (!btn) return;

  const name = btn.dataset.name;
  const key  = btn.dataset.key;
  const resultEl = document.querySelector(
    `.wiki-result[data-key="${key}"]`
  );

  btn.disabled = true;
  btn.textContent = "Checking…";
  resultEl.textContent = "";

  // 1. Cache
  let wikiDate = wikiCache.get(key);
  if (!wikiDate) {
    wikiDate = await fetchBirthDateFromWikipedia(name);
    wikiCache.set(key, wikiDate || null);
  }

  if (!wikiDate) {
    resultEl.textContent = "Not found";
    resultEl.style.color = "#888";
    btn.textContent = "Check Wikipedia";
    btn.disabled = false;
    return;
  }

  // 2. Find current person
  const q = query(
    collection(db, "people"),
    where("nameNormalized", "==", key)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    resultEl.textContent = "Found, but no person";
    resultEl.style.color = "orange";
    btn.disabled = false;
    btn.textContent = "Check Wikipedia";
    return;
  }

  const docu = snap.docs[0];
  const current = docu.data().birthDate || "";

  if (!current) {
    resultEl.innerHTML = `
      Found: ${wikiDate}
      <button class="wiki-apply-btn"
        data-id="${docu.id}"
        data-date="${wikiDate}">
        Apply
      </button>
    `;
    btn.textContent = "Check Wikipedia";
    btn.disabled = false;
    return;
  }

  if (current === wikiDate) {
    resultEl.textContent = "✓ Matches Wikipedia";
    resultEl.style.color = "green";
    btn.textContent = "Check Wikipedia";
    btn.disabled = false;
    return;
  }

  // Conflict
  resultEl.innerHTML = `
    Conflict (Wiki: ${wikiDate})
    <button class="wiki-apply-btn"
      data-id="${docu.id}"
      data-date="${wikiDate}">
      Apply
    </button>
  `;
  resultEl.style.color = "red";
  btn.textContent = "Check Wikipedia";
  btn.disabled = false;
});

async function autoLinkApprovedPicks() {
  const peopleSnap  = await getDocs(collection(db, "people"));
  const playersSnap = await getDocs(collection(db, "players"));

  const peopleByNormalized = new Map();

  peopleSnap.forEach(d => {
    const p = d.data();
    const norm = (p.nameNormalized || p.name)
      .toLowerCase()
      .trim();

    peopleByNormalized.set(norm, {
      id: d.id,
      birthDate: p.birthDate || ""
    });
  });

  for (const ps of playersSnap.docs) {
    const ref = doc(db, "players", ps.id);
    const data = ps.data();
    const picks = data.entries?.["2026"]?.picks || [];

    let changed = false;

    picks.forEach(p => {
      if (p.status !== "approved") return;
      if (p.personId) return;

      const norm = (p.normalizedName || p.raw || "")
        .toLowerCase()
        .trim();

      const person = peopleByNormalized.get(norm);
      if (!person) return;

      // 🔒 SAFE AUTO-MERGE (exactly one match)
      p.personId = person.id;
      p.birthDate = person.birthDate || p.birthDate || "";
      changed = true;
    });

    if (changed) {
      await updateDoc(ref, {
        "entries.2026.picks": picks
      });
    }
  }
}

document.addEventListener("click", async e => {
  
  if (!btn) return;

  const name = btn.dataset.name;
  const normalized = btn.dataset.normalized;

  const input = document.querySelector(
    `.merge-birthdate[data-name="${normalized}"]`
  );

  const iso = parseToISO(input?.value);
  if (!iso) {
    alert("Valid birth date required");
    return;
  }

  // find existing person by normalized name
  const q = query(
    collection(db, "people"),
    where("nameNormalized", "==", normalized)
  );

  const snap = await getDocs(q);
  let personId;

  if (!snap.empty) {
    const docu = snap.docs[0];
    personId = docu.id;

    if (!docu.data().birthDate) {
      await updateDoc(doc(db, "people", personId), {
        birthDate: iso
      });
    }
  } else {
    personId = (
      await addDoc(collection(db, "people"), {
        name,
        nameNormalized: normalized,
        birthDate: iso
      })
    ).id;
  }

  // link ALL matching approved picks
  const playersSnap = await getDocs(collection(db, "players"));

  for (const ps of playersSnap.docs) {
    const ref = doc(db, "players", ps.id);
    const data = ps.data();
    const picks = data.entries?.["2026"]?.picks || [];

    let changed = false;

    picks.forEach(p => {
      const pNorm = (p.normalizedName || p.raw || "")
        .toLowerCase()
        .trim();

      if (p.status === "approved" && pNorm === normalized) {
        p.personId = personId;
        p.birthDate = p.birthDate || iso;
        changed = true;
      }
    });

    if (changed) {
      await updateDoc(ref, {
        "entries.2026.picks": picks
      });
    }
  }

  loadPeople();
  loadPlayers();
});

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
document.getElementById("approve-all-btn")
  ?.addEventListener("click", approveAllPicks);


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

  const rawName = nameInput?.value.trim();
  if (!rawName) {
    alert("Name required");
    return;
  }

  const normalized = normalizeName(rawName);
  const iso = parseFlexibleDate(dateInput?.value); // ← accepterer alle formater
  const finalBirthDate = iso || "";

  let personId = null;

  /* ---------- 1. Find eksisterende person (navn + dato) ---------- */
  if (iso) {
    const qExact = query(
      collection(db, "people"),
      where("nameNormalized", "==", normalized),
      where("birthDate", "==", iso)
    );

    const exactSnap = await getDocs(qExact);
    if (!exactSnap.empty) {
      personId = exactSnap.docs[0].id;
    }
  }

  /* ---------- 2. Fallback: find på navn alene ---------- */
  if (!personId) {
    const qName = query(
      collection(db, "people"),
      where("nameNormalized", "==", normalized)
    );

    const nameSnap = await getDocs(qName);
    if (!nameSnap.empty) {
      const existing = nameSnap.docs[0];
      personId = existing.id;
    }
  }

  /* ---------- 3. Opret NY person hvis ingen fundet ---------- */
  if (!personId) {
    personId = (
      await addDoc(collection(db, "people"), {
        name: rawName,
        nameNormalized: normalized,
        birthDate: finalBirthDate,
        createdAt: new Date().toISOString()
      })
    ).id;
  }

  /* ---------- 4. Opdater pick (ALDRIG orphan igen) ---------- */
  picks[index] = {
    ...pick,
    normalizedName: rawName,
    birthDate: finalBirthDate,
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

async function approveAllPicks() {
  if (!currentValidatePlayerId) return;

  const textarea = document.getElementById("import-picks");
  const rawText = textarea?.value.trim();

  const ref = doc(db, "players", currentValidatePlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  let picks = data.entries?.["2026"]?.picks || [];

  // 🔹 STEP 1: Hvis textarea har indhold → opret picks først
  if (rawText) {
    const lines = splitLines(rawText);
    const newPicks = lines.map(parsePickLine);
    picks = [...picks, ...newPicks];
    textarea.value = ""; // reset UI
  }

  // 🔹 STEP 2: Approve ALT pending
  let changed = false;

  for (const pick of picks) {
    if (pick.status === "approved") continue;

    const name = (pick.normalizedName || pick.raw || "").trim();
    if (!name) continue;

    const birthDate = pick.birthDate || "";
    const personId = await getOrCreatePerson(name, birthDate);

    pick.personId = personId;
    pick.status = "approved";
    pick.normalizedName = name;
    changed = true;
  }

  if (changed) {
    await updateDoc(ref, {
      "entries.2026.picks": picks
    });
  }

  // 🔁 UI refresh
  loadPlayers();
  loadPeople();
  openValidateModal(currentValidatePlayerId);
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
