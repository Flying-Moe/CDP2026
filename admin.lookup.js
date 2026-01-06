const elProgress = document.getElementById("lookup-progress");

// ================================
// ADMIN – GLOBAL DEATH LOOKUP
// ================================

import {
  db,
  refreshAdminViews,
  invalidateAdminCache,
  getPeopleSnap,
  getPlayersSnap,
  fetchWikidataPerson
} from "./admin.core.js";

import {
  doc,
  updateDoc,
  getDoc,
  writeBatch,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   STATE
===================================================== */

export const lookupState = {
  loading: false,
  results: [] // { personId, name, foundBirthDate?, foundDeathDate?, source, confidence, flagged },
  dismissed: new Set()
};

/* =====================================================
   DOM HOOKS
===================================================== */

const btnOpen   = document.getElementById("btn-global-lookup");
const modal     = document.getElementById("death-lookup-modal");
const btnClose  = document.getElementById("lookup-close-btn");
const btnApplyAll = document.getElementById("lookup-apply-all-btn");

const elLoading = document.getElementById("lookup-loading");
const elEmpty   = document.getElementById("lookup-empty");
const elResults = document.getElementById("lookup-results");
const elBody    = document.getElementById("lookup-results-body");

/* =====================================================
   HELPERS
===================================================== */

function formatDate(iso) {
  if (!iso || !iso.includes("-")) return "";
  const [y,m,d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function resetUI() {
  elLoading.style.display = "none";
  elEmpty.style.display   = "none";
  elResults.style.display = "none";
  elBody.innerHTML = "";
}

/* =====================================================
   FLAG HANDLING
===================================================== */

async function setPendingDeathFlag(personId, value) {
  const ref = doc(db, "people", personId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const flags = snap.data().flags || {};
  if (value) {
    flags.pendingDeath = true;
  } else {
    delete flags.pendingDeath;
  }

  await updateDoc(ref, { flags });
}

/* =====================================================
   APPLY SINGLE
===================================================== */

async function applySingle(result) {
  if (result.confidence === "low") {
    const ok = confirm(
      "This result has LOW confidence.\n\nDouble-check before applying.\n\nApply anyway?"
    );
    if (!ok) return;
  }

const patch = {
  "flags.pendingDeath": false
};

if (result.foundDeathDate) {
  patch.deathDate = result.foundDeathDate;
}
if (result.foundBirthDate) {
  // skriv kun hvis birthDate mangler lokalt
  patch.birthDate = patch.birthDate ?? result.foundBirthDate;
}

await updateDoc(doc(db, "people", result.personId), patch);


  // Optional audit log
  /*
  await addDoc(collection(db,"adminAudit"),{
    action:"applyDeathDate",
    personId: result.personId,
    date: result.foundDeathDate,
    source: result.source,
    confidence: result.confidence,
    at: new Date().toISOString()
  });
  */

  invalidateAdminCache("people","players");
  await refreshAdminViews({ force:true });
}

/* =====================================================
   APPLY ALL (HIGH CONFIDENCE ONLY)
===================================================== */

async function applyAllHighConfidence() {
  const batch = writeBatch(db);

  lookupState.results.forEach(r => {
    if (r.confidence !== "high") return;
    if (r.flagged) return;
    if (lookupState.dismissed.has(r.personId)) return;

    batch.update(doc(db,"people",r.personId),{
      deathDate: r.foundDeathDate,
      "flags.pendingDeath": false
    });
  });

  await batch.commit();

  invalidateAdminCache("people","players");
  await refreshAdminViews({ force:true });
}

/* =====================================================
   RENDER RESULTS
===================================================== */

function renderResults() {
  resetUI();

  if (!lookupState.results.length) {
    elEmpty.style.display = "block";
    return;
  }

  elResults.style.display = "block";

  lookupState.results.forEach(r => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.name}</td>
      <td>
  ${r.foundDeathDate ? `Død: ${formatDate(r.foundDeathDate)}` : ""}
  ${r.foundBirthDate ? `<div>Født: ${formatDate(r.foundBirthDate)}</div>` : ""}
</td>

      <td>${r.source}</td>
      <td>${r.confidence}</td>
      <td>${r.flagged ? "⚑ flagged" : "—"}</td>
      <td>
        <button data-act="apply">Apply</button>
        <button data-act="flag">${r.flagged ? "Unflag" : "Flag"}</button>
        <button data-act="delete">Delete</button>
      </td>

    `;

tr.querySelector('[data-act="apply"]').onclick = () => applySingle(r);

tr.querySelector('[data-act="flag"]').onclick = async () => {
  r.flagged = !r.flagged;
  await setPendingDeathFlag(r.personId, r.flagged);
  renderResults();
};

tr.querySelector('[data-act="delete"]').onclick = () => {
  lookupState.dismissed.add(r.personId);
  lookupState.results = lookupState.results.filter(
    x => x.personId !== r.personId
  );
  renderResults();
};

    elBody.appendChild(tr);
  });
}

/* =====================================================
   ENTRY POINT (mock scan for now)
===================================================== */

btnOpen?.addEventListener("click", async () => {
  resetUI();
  modal.classList.remove("hidden");

  lookupState.loading = true;
  elLoading.style.display = "block";

// =====================================================
// WIKI SCAN v1 (DRY RUN)
// =====================================================

// hent alle people + players (cached via admin.core)
const peopleSnap = await getPeopleSnap(true);
const playersSnap = await getPlayersSnap(true);

// find personIds der bruges af mindst ét approved pick
const usedPersonIds = new Set();

playersSnap.forEach(ps => {
  const picks = ps.data().entries?.["2026"]?.picks || [];
  picks.forEach(p => {
    if (p.status === "approved" && p.personId) {
      usedPersonIds.add(p.personId);
    }
  });
});

lookupState.results = [];

  let checked = 0;
const total = usedPersonIds.size;

// før loop
elProgress.textContent = `Checked 0 / ${total}`;

for (const docSnap of peopleSnap.docs) {
  const personId = docSnap.id;
  if (!usedPersonIds.has(personId)) continue;
  if (lookupState.dismissed.has(personId)) continue;

  const person = docSnap.data();

  // skip hvis deathDate allerede findes
  if (person.deathDate) continue;

  const name = person.name;
  if (!name) continue;

  try {
    const wiki = await fetchWikidataPerson(name);
    if (!wiki) continue;

// hvis hverken birth eller death findes → ignorer
const localBirth = person.birthDate || "";
const localDeath = person.deathDate || "";

const foundBirth = wiki.birthDate || "";
const foundDeath = wiki.deathDate || "";

// ignorér hvis intet nyt info
const birthIsNew =
  foundBirth && (!localBirth || localBirth !== foundBirth);

const deathIsNew =
  foundDeath && (!localDeath || localDeath !== foundDeath);

if (!birthIsNew && !deathIsNew) continue;

lookupState.results.push({
  personId,
  name: wiki.label || name,
  foundBirthDate: wiki.birthDate || null,
  foundDeathDate: wiki.deathDate || null,
  source: "wiki",
  confidence: "high",
  flagged: person?.flags?.pendingDeath === true
});

  } catch (err) {
    console.warn("Wiki lookup failed for", name);
  }


// inde i loopets slutning
checked++;
elProgress.textContent = `Checked ${checked} / ${total}`;
  
}

  lookupState.loading = false;
  renderResults();
});



btnApplyAll?.addEventListener("click", applyAllHighConfidence);
btnClose?.addEventListener("click", () => modal.classList.add("hidden"));
