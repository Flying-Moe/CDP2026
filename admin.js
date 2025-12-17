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
   DOM + AUTH
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const loginSection = document.getElementById("login-section");
  const adminSection = document.getElementById("admin-section");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const errorEl = document.getElementById("login-error");

  document.getElementById("validate-picks-modal")?.classList.add("hidden");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  async function handleLogin() {
    if (!emailInput.value || !passwordInput.value) {
      errorEl.textContent = "Please enter email and password";
      return;
    }

    try {
      await signInWithEmailAndPassword(
        auth,
        emailInput.value.trim(),
        passwordInput.value
      );
    } catch {
      errorEl.textContent = "Login failed";
    }
  }

  loginBtn.onclick = handleLogin;
  emailInput.onkeydown = passwordInput.onkeydown = e => {
    if (e.key === "Enter") handleLogin();
  };

  logoutBtn.onclick = () => signOut(auth);

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

    loginSection.style.display = "none";
    adminSection.style.display = "block";

    setupTabs();
    loadPlayers();
    loadPeople();
    loadDeaths();
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

    tbody.innerHTML += `
      <tr style="${p.active === false ? "opacity:.5" : ""}">
        <td>${p.name}</td>
        <td>${approved}</td>
        <td>${pending}</td>
        <td>${rejected}</td>
        <td>
          <button class="validate-btn" data-id="${docu.id}">
            Validate
          </button>
        </td>
      </tr>`;
  });

  document.querySelectorAll(".validate-btn").forEach(b =>
    b.onclick = () => openValidateModal(b.dataset.id)
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

  await updateDoc(ref, { "entries.2026.picks": picks });

  openValidateModal(currentValidatePlayerId);
  loadPlayers();
}

const closeValidateBtn = document.getElementById("close-validate-btn");
if (closeValidateBtn) {
  closeValidateBtn.onclick = () => {
    const modal = document.getElementById("validate-picks-modal");
    if (modal) modal.classList.add("hidden");
  };
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
   DEATHS (KLAR STRUKTUR – LOGIK KOMMER SENERE)
===================================================== */

async function loadDeaths() {
  const tbody = document.querySelector("#deaths-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  // bevidst tom – validerede dødsfald kommer her
}
