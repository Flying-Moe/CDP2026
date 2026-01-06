const SHOW_ALL_LOOKUP_RESULTS = true; // midlertidigt

const elProgress = document.getElementById("lookup-progress");
const yieldToUI = () =>
  new Promise(resolve => setTimeout(resolve, 0));

const GOOGLE_API_KEY = "AIzaSyATUlvUT2RsVfoFv2qsNGfwuIDZU7sKuc4";
const GOOGLE_DELAY_MS = 120;

const googleRateLimit = () =>
  new Promise(resolve => setTimeout(resolve, GOOGLE_DELAY_MS));

async function fetchGoogleKnowledgePerson(name) {
  await googleRateLimit();

  const url =
    "https://kgsearch.googleapis.com/v1/entities:search" +
    `?query=${encodeURIComponent(name)}` +
    `&limit=1&indent=True&key=${GOOGLE_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const item = data.itemListElement?.[0]?.result;
    if (!item) return null;

    // Google KG er ikke konsekvent – vi læser forsigtigt
    const birthDate = item.birthDate || null;
    const deathDate = item.deathDate || null;

    return {
      birthDate,
      deathDate,
      label: item.name || name
    };
  } catch (err) {
    console.warn("Google KG lookup failed for", name);
    return null;
  }
}

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

const lookupState = {
  loading: false,
  results: [], // { personId, name, foundBirthDate?, foundDeathDate?, source, confidence, flagged }
  dismissed: new Set()
};

window.lookupState = lookupState;

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

      <td>
        <span title="${
          r.source === "wiki" ? "Wikipedia" :
          r.source === "google" ? "Google" :
          r.source === "wiki,google" ? "Wikipedia + Google" : ""
        }">
          ${r.source === "wiki" ? "🅆" : ""}
          ${r.source === "google" ? "🄶" : ""}
          ${r.source === "wiki,google" ? "🅆🄶" : ""}
        </span>
        <span class="confidence-label">${r.confidence}</span>
      </td>
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

  // skip hvis ikke i brug
  if (!usedPersonIds.has(personId)) {
    checked++;
    elProgress.textContent = `Checked ${checked} / ${total}`;
    if (checked % 5 === 0) await yieldToUI();
    continue;
  }

  if (lookupState.dismissed.has(personId)) {
    checked++;
    elProgress.textContent = `Checked ${checked} / ${total}`;
    if (checked % 5 === 0) await yieldToUI();
    continue;
  }

  const person = docSnap.data();
  const name = person.name;

  if (!name) {
    checked++;
    elProgress.textContent = `Checked ${checked} / ${total}`;
    if (checked % 5 === 0) await yieldToUI();
    continue;
  }

  try {
const wikiPromise = fetchWikidataPerson(name);

let googlePromise = null;
if (!person.birthDate || !person.deathDate) {
  googlePromise = fetchGoogleKnowledgePerson(name);
}

const [wiki, google] = await Promise.all([
  wikiPromise,
  googlePromise
]);

let foundBirth = wiki?.birthDate || "";
let foundDeath = wiki?.deathDate || "";
let source = "wiki";

if (google) {
  if (!foundBirth && google.birthDate) {
    foundBirth = google.birthDate;
    source = source === "wiki" ? "wiki,google" : "google";
  }
  if (!foundDeath && google.deathDate) {
    foundDeath = google.deathDate;
    source = source === "wiki" ? "wiki,google" : "google";
  }
 }
}

if (!foundBirth && !foundDeath) {
  checked++;
  elProgress.textContent = `Checked ${checked} / ${total}`;
  if (checked % 5 === 0) await yieldToUI();
  continue;
}

    const localBirth = person.birthDate || "";
    const localDeath = person.deathDate || "";

    // allerede sat via wiki/google

    const birthIsNew =
      foundBirth && (!localBirth || localBirth !== foundBirth);

    const deathIsNew =
      foundDeath && (!localDeath || localDeath !== foundDeath);

  //=========== Midlertidig kode for VIS ALLE RESULTATER i lookup  =============

  if (!SHOW_ALL_LOOKUP_RESULTS && !birthIsNew && !deathIsNew) {
  checked++;
  elProgress.textContent = `Checked ${checked} / ${total}`;
  if (checked % 5 === 0) await yieldToUI();
  continue;
}
  //=========== Genaktiver denne kode (fra if (!...  ===========================
  
    // intet nyt → kun tælle, ikke vise
    // if (!birthIsNew && !deathIsNew) {
    //  checked++;
    //  elProgress.textContent = `Checked ${checked} / ${total}`;
    //  if (checked % 5 === 0) await yieldToUI();
    //  continue;
    //  }

  
    // gyldigt resultat
lookupState.results.push({
  personId,
  name: wiki.label || name,
  foundBirthDate: foundBirth || null,
  foundDeathDate: foundDeath || null,
  source,
  flagged: person?.flags?.pendingDeath === true
});

  } catch (err) {
    console.warn("Wiki lookup failed for", name);
  }

  // ALTID tælle til sidst
  checked++;
  elProgress.textContent = `Checked ${checked} / ${total}`;
  if (checked % 5 === 0) {
    await yieldToUI();
  }
}

  lookupState.loading = false;
  renderResults();
});



btnApplyAll?.addEventListener("click", applyAllHighConfidence);
btnClose?.addEventListener("click", () => modal.classList.add("hidden"));
