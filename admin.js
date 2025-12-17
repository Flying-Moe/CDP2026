console.log("admin.js loaded");

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
    raw: line,
    normalizedName: name,
    birthDate: iso || "",
    status: "pending",
    personId: null
  };
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

      setupTabs();
      loadPlayers();
      loadPeople();
      loadDeaths();

    } catch (err) {
      errorEl.textContent = "Authorization error";
      await signOut(auth);
    }
  });

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
   PLAYERS – OVERBLIK
===================================================== */

async function loadPlayers() {
  const snap = await getDocs(collection(db, "players"));
  const tbody = document.querySelector("#players-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  snap.forEach(docu => {
    const p = docu.data();
    const picks = p.entries?.["2026"]?.picks || [];

    let approved = 0, pending = 0, rejected = 0;
    picks.forEach(x => {
      if (x.status === "approved") approved++;
      else if (x.status === "rejected") rejected++;
      else pending++;
    });

    const minusPoints =
      (p.scoreHistory || []).filter(h => h.delta === -1).length;

    tbody.innerHTML += `
      <tr style="${p.active === false ? "opacity:.5" : ""}">
        <td>
          ${p.name}
          ${p.firstBlood ? `<span title="First Blood"> 🩸</span>` : ""}
        </td>
        <td>${approved}</td>
        <td>${pending}</td>
        <td>${rejected}</td>
        <td>
          <button class="validate-btn" data-id="${docu.id}">Validate</button>
          <button class="minus-btn" data-id="${docu.id}">−1</button>
          <button class="undo-minus-btn" data-id="${docu.id}">Undo</button>
          <button class="firstblood-btn" data-id="${docu.id}">🩸</button>
        </td>
      </tr>
    `;
  });

  document.querySelectorAll(".firstblood-btn").forEach(b =>
    b.onclick = () => setFirstBlood(b.dataset.id)
  );

  document.querySelectorAll(".validate-btn").forEach(b =>
    b.onclick = () => openValidateModal(b.dataset.id)
  );

  document.querySelectorAll(".minus-btn").forEach(b =>
    b.onclick = () => giveMinusPoint(b.dataset.id)
  );

  document.querySelectorAll(".undo-minus-btn").forEach(b =>
    b.onclick = () => undoMinusPoint(b.dataset.id)
  );
}

/* =====================================================
   VALIDATE PICKS + IMPORT
===================================================== */

let currentValidatePlayerId = null;

async function openValidateModal(playerId) {
  currentValidatePlayerId = playerId;

  const snap = await getDoc(doc(db, "players", playerId));
  const picks = snap.data().entries["2026"].picks || [];

  const order = { approved: 0, pending: 1, rejected: 2 };
  picks.sort((a, b) => order[a.status] - order[b.status]);

  const tbody = document.querySelector("#validate-picks-table tbody");
  tbody.innerHTML = "";

  picks.forEach((pick, i) => {
    tbody.innerHTML += `
      <tr style="${pick.status === "approved" ? "opacity:.5" : ""}">
        <td>
          <input type="text"
            value="${pick.normalizedName || pick.raw || ""}"
            data-i="${i}"
            class="name-input">
        </td>
        <td>
          <input type="date"
            value="${pick.birthDate || ""}"
            data-i="${i}"
            class="date-input">
        </td>
        <td>${pick.status}</td>
        <td>
          <button data-i="${i}" data-a="approve">Approve</button>
          <button data-i="${i}" data-a="reject">Reject</button>
        </td>
      </tr>`;
  });

  tbody.querySelectorAll("button").forEach(b =>
      b.onclick = () => handlePickAction(b.dataset.i, b.dataset.a)
  );

  document.getElementById("validate-picks-modal").classList.remove("hidden");
}

/* -------- IMPORT LIST (RAW TEXT / CSV) -------- */

async function importPicks(rawText) {
  if (!currentValidatePlayerId) return;

  const lines = splitLines(rawText);
  if (!lines.length) return alert("No valid lines found");

  const picks = lines.map(parsePickLine);

  await updateDoc(
    doc(db, "players", currentValidatePlayerId),
    { "entries.2026.picks": picks }
  );

  openValidateModal(currentValidatePlayerId);
  loadPlayers();
}

const importBtn = document.getElementById("import-picks-btn");
if (importBtn) {
  importBtn.onclick = () => {
    const input = document.getElementById("import-picks");
    const text = input ? input.value : "";
    importPicks(text);
  };
}

/* -------- APPROVE / REJECT -------- */

async function handlePickAction(index, action) {
  const ref = doc(db, "players", currentValidatePlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const picks = snap.data().entries["2026"].picks;

  const name = document.querySelector(
    `.name-input[data-i="${index}"]`
  ).value.trim();

  const iso = parseToISO(
    document.querySelector(
      `.date-input[data-i="${index}"]`
    ).value
  );

  if (action === "approve") {
    if (!name || !iso) {
      alert("Name and birth date required");
      return;
    }

    const q = query(
      collection(db, "people"),
      where("name", "==", name),
      where("birthDate", "==", iso)
    );

    const existing = await getDocs(q);
    let personId;

    if (existing.empty) {
      personId = (await addDoc(collection(db, "people"), {
        name,
        birthDate: iso
      })).id;
    } else {
      personId = existing.docs[0].id;
    }

    picks[index] = {
      ...picks[index],
      normalizedName: name,
      birthDate: iso,
      personId,
      status: "approved"
    };
  }

  if (action === "reject") {
    picks[index].status = "rejected";
  }

  await updateDoc(ref, {
    "entries.2026.picks": picks
  });

  openValidateModal(currentValidatePlayerId);
  loadPlayers();
}

/* =====================================================
   PEOPLE
===================================================== */

let currentPersonId = null;

async function loadPeople() {
  const snap = await getDocs(collection(db, "people"));
  const tbody = document.querySelector("#people-table tbody");
  tbody.innerHTML = "";

  snap.forEach(d => {
    const p = d.data();
    tbody.innerHTML += `
      <tr>
        <td>${p.name}</td>
        <td>${p.birthDate || "—"}</td>
        <td>${p.birthDate ? "OK" : "Missing"}</td>
        <td>
          <button onclick="openEditPerson('${d.id}')">Edit</button>
          <button onclick="deletePerson('${d.id}')">Delete</button>
        </td>
      </tr>`;
  });
}

window.deletePerson = async id => {
  if (!confirm("Delete permanently?")) return;
  await deleteDoc(doc(db, "people", id));
  loadPeople();
};

window.openEditPerson = async id => {
  const snap = await getDoc(doc(db, "people", id));
  currentPersonId = id;

  document.getElementById("edit-person-name").value = snap.data().name;
  document.getElementById("edit-person-birthdate").value =
    snap.data().birthDate || "";

  document.getElementById("edit-person-modal").classList.remove("hidden");
};

document.getElementById("save-person-btn").onclick = async () => {
  await updateDoc(doc(db, "people", currentPersonId), {
    name: document.getElementById("edit-person-name").value.trim(),
    birthDate: document.getElementById("edit-person-birthdate").value
  });

  document.getElementById("edit-person-modal").classList.add("hidden");
  loadPeople();
};

/* =====================================================
   DEATHS – ADMIN FLOW (FULDT IMPLEMENTERET)
===================================================== */

async function registerDeath(personId, playerId, dateOfDeathISO) {
  await addDoc(collection(db, "deaths"), {
    personId,
    playerId,
    dateOfDeath: dateOfDeathISO,
    approved: false,
    createdAt: new Date().toISOString()
  });

  loadDeaths();
}

/* ---------- Load deaths ---------- */

async function loadDeaths() {
  const container = document.getElementById("tab-deaths");
  if (!container) return;

  container.innerHTML = `
    <h2>Deaths</h2>
    <p>Approve registered deaths.</p>

    <table id="deaths-table">
      <thead>
        <tr>
          <th>Person</th>
          <th>Player</th>
          <th>Date of death</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  const tbody = container.querySelector("tbody");
  const snap = await getDocs(collection(db, "deaths"));

  tbody.innerHTML = "";

  for (const d of snap.docs) {
    const death = d.data();

    const personSnap = await getDoc(doc(db, "people", death.personId));
    const playerSnap = await getDoc(doc(db, "players", death.playerId));

    const personName = personSnap.exists()
      ? personSnap.data().name
      : "Unknown";

    const playerName = playerSnap.exists()
      ? playerSnap.data().name
      : "Unknown";

    tbody.innerHTML += `
      <tr style="${death.approved ? "opacity:.5" : ""}">
        <td>${personName}</td>
        <td>${playerName}</td>
        <td>${death.dateOfDeath}</td>
        <td>${death.approved ? "Approved" : "Pending"}</td>
        <td>
          ${
            death.approved
              ? `<button data-id="${d.id}" class="undo-death">Undo</button>`
              : `<button data-id="${d.id}" class="approve-death">Approve</button>`
          }
        </td>
      </tr>
    `;
  }

  container.querySelectorAll(".approve-death").forEach(btn => {
    btn.onclick = () => approveDeath(btn.dataset.id);
  });

  container.querySelectorAll(".undo-death").forEach(btn => {
    btn.onclick = () => undoDeath(btn.dataset.id);
  });
}

/* ---------- Approve death ---------- */

async function approveDeath(deathId) {
  const ref = doc(db, "deaths", deathId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const death = snap.data();

  const personSnap = await getDoc(doc(db, "people", death.personId));
  if (!personSnap.exists()) return;

  const birth = personSnap.data().birthDate;
  const deathDate = new Date(death.dateOfDeath);
  const birthDate = new Date(birth);

  let age =
    deathDate.getFullYear() -
    birthDate.getFullYear() -
    (deathDate <
    new Date(
      deathDate.getFullYear(),
      birthDate.getMonth(),
      birthDate.getDate()
    )
      ? 1
      : 0);

  let points = age >= 99 ? 1 : Math.max(1, 100 - age);

  // First Blood?
  const existingApproved = await getDocs(
    query(collection(db, "deaths"), where("approved", "==", true))
  );

  const isFirstBlood = existingApproved.empty;

  await updateDoc(ref, {
    approved: true,
    approvedAt: new Date().toISOString(),
    pointsAwarded: points,
    firstBlood: isFirstBlood
  });

  await applyScore(death.playerId, points);

  if (isFirstBlood) {
    await updateDoc(doc(db, "players", death.playerId), {
      firstBlood: true
    });
  }

  loadDeaths();
  loadPlayers();
}

/* ---------- Undo death ---------- */

async function undoDeath(deathId) {
  const ref = doc(db, "deaths", deathId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const death = snap.data();

  if (death.pointsAwarded) {
    await applyScore(death.playerId, -death.pointsAwarded);
  }

  if (death.firstBlood) {
    await updateDoc(doc(db, "players", death.playerId), {
      firstBlood: false
    });
  }

  await updateDoc(ref, {
    approved: false,
    approvedAt: null,
    pointsAwarded: null,
    firstBlood: false
  });

  loadDeaths();
  loadPlayers();
}

/* =====================================================
   SCORE ADJUSTMENTS (MINUSPOINTS)
===================================================== */

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
      { delta: -1, at: new Date().toISOString(), reason: "admin" }
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

/* =====================================================
   SCORE ADJUSTMENTS (MINUSPOINTS)
===================================================== */

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
