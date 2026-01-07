// ================================
// ADMIN – GLOBAL LOOKUP (Wikidata + Wikipedia fallback)
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
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================================================
   STATE
===================================================== */

const lookupState = {
  loading: false,
  results: [],      // { personId, name, foundBirthDate?, foundDeathDate?, source, flagged }
  dismissed: new Set()
};

window.lookupState = lookupState;

const SHOW_ALL_LOOKUP_RESULTS = true; // TEST MODE

/* =====================================================
   DOM HOOKS
===================================================== */

const btnOpen     = document.getElementById("btn-global-lookup");
const modal       = document.getElementById("death-lookup-modal");
const btnClose    = document.getElementById("lookup-close-btn");
const btnApplyAll = document.getElementById("lookup-apply-all-btn");

const elLoading  = document.getElementById("lookup-loading");
const elEmpty    = document.getElementById("lookup-empty");
const elResults  = document.getElementById("lookup-results");
const elBody     = document.getElementById("lookup-results-body");
const elProgress = document.getElementById("lookup-progress");

/* =====================================================
   UI YIELD (så progress føles “levende”)
===================================================== */

const yieldToUI = () => new Promise(r => setTimeout(r, 0));

/* =====================================================
   HELPERS
===================================================== */

function formatDate(iso) {
  if (!iso || !iso.includes("-")) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function resetUI() {
  elLoading.style.display = "none";
  elEmpty.style.display   = "none";
  elResults.style.display = "none";
  elBody.innerHTML = "";
}

function normStr(s) {
  return (s || "").toString().trim();
}

function localeNameSort(a, b) {
  return a.localeCompare(b, "da", { sensitivity: "base" });
}

function sortResults(arr) {
  // DeathDate først, derefter alfabetisk
  arr.sort((A, B) => {
    const aHasDeath = !!A.foundDeathDate;
    const bHasDeath = !!B.foundDeathDate;
    if (aHasDeath !== bHasDeath) return aHasDeath ? -1 : 1;
    return localeNameSort(A.name || "", B.name || "");
  });
}

/* =====================================================
   SOURCE ICONS (du har uploaded PNG’erne)
===================================================== */

function renderSourceIcon(source) {
  if (!source) return "—";

  const icons = [];

  if (source.includes("wikidata")) {
    icons.push(
      `<img src="assets/images/wikidata.png" title="Wikidata" class="lookup-src-icon">`
    );
  }

  if (source.includes("wikipedia")) {
    icons.push(
      `<img src="assets/images/wikipedia.png" title="Wikipedia" class="lookup-src-icon">`
    );
  }

  return icons.join("");
}

/* =====================================================
   WIKIDATA VIA WIKIPEDIA FALLBACK (QID)
===================================================== */

async function fetchWikipediaQid(name, lang) {
  // 1) search titel
  const searchUrl =
    `https://${lang}.wikipedia.org/w/api.php?` +
    `action=query&list=search&srsearch=${encodeURIComponent(name)}` +
    `&srlimit=1&format=json&origin=*`;

  const sRes = await fetch(searchUrl);
  if (!sRes.ok) return null;
  const sJson = await sRes.json();
  const title = sJson?.query?.search?.[0]?.title;
  if (!title) return null;

  // 2) hent wikibase_item (QID)
  const propsUrl =
    `https://${lang}.wikipedia.org/w/api.php?` +
    `action=query&prop=pageprops&titles=${encodeURIComponent(title)}` +
    `&format=json&origin=*`;

  const pRes = await fetch(propsUrl);
  if (!pRes.ok) return null;
  const pJson = await pRes.json();

  const pages = pJson?.query?.pages || {};
  const firstKey = Object.keys(pages)[0];
  const qid = pages?.[firstKey]?.pageprops?.wikibase_item;

  return qid || null;
}

function wikidataTimeToISO(timeStr) {
  // fx "+1951-04-02T00:00:00Z"
  if (!timeStr || typeof timeStr !== "string") return null;
  const m = timeStr.match(/([+-]\d{4}-\d{2}-\d{2})T/);
  if (!m) return null;
  return m[1].replace("+", "");
}

async function fetchWikidataByQid(qid) {
  if (!qid) return null;

  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const json = await res.json();
  const ent = json?.entities?.[qid];
  if (!ent) return null;

  const claims = ent.claims || {};

  const birthClaim = claims.P569?.[0]?.mainsnak?.datavalue?.value?.time || null;
  const deathClaim = claims.P570?.[0]?.mainsnak?.datavalue?.value?.time || null;

  return {
    birthDate: wikidataTimeToISO(birthClaim),
    deathDate: wikidataTimeToISO(deathClaim)
  };
}

async function fetchWikipediaFallbackDates(name) {
  // prøv da → en
  const qidDa = await fetchWikipediaQid(name, "da");
  if (qidDa) {
    const dates = await fetchWikidataByQid(qidDa);
    if (dates?.birthDate || dates?.deathDate) return dates;
  }

  const qidEn = await fetchWikipediaQid(name, "en");
  if (qidEn) {
    const dates = await fetchWikidataByQid(qidEn);
    if (dates?.birthDate || dates?.deathDate) return dates;
  }

  return null;
}

/* =====================================================
   FLAG HANDLING
===================================================== */

async function setPendingDeathFlag(personId, value) {
  const ref = doc(db, "people", personId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const flags = snap.data().flags || {};
  if (value) flags.pendingDeath = true;
  else delete flags.pendingDeath;

  await updateDoc(ref, { flags });
}

/* =====================================================
   APPLY SINGLE
===================================================== */

async function applySingle(result) {
  const patch = {
    "flags.pendingDeath": false
  };

  if (result.foundDeathDate) patch.deathDate = result.foundDeathDate;

  // BirthDate må kun skrives, hvis der mangler lokalt (det checker vi i scan-logikken)
  if (result.foundBirthDate) patch.birthDate = result.foundBirthDate;

  await updateDoc(doc(db, "people", result.personId), patch);

  invalidateAdminCache("people", "players");
  await refreshAdminViews({ force: true });
}

/* =====================================================
   APPLY ALL
   - apply kun dem der IKKE er flagged
   - og som ikke er dismissed
===================================================== */

async function applyAll() {
  const batch = writeBatch(db);

  lookupState.results.forEach(r => {
    if (r.flagged) return;
    if (lookupState.dismissed.has(r.personId)) return;

    const patch = {
      "flags.pendingDeath": false
    };

    if (r.foundDeathDate) patch.deathDate = r.foundDeathDate;
    if (r.foundBirthDate) patch.birthDate = r.foundBirthDate;

    batch.update(doc(db, "people", r.personId), patch);
  });

  await batch.commit();

  invalidateAdminCache("people", "players");
  await refreshAdminViews({ force: true });
}

/* =====================================================
   RENDER
===================================================== */

function renderResults() {
  resetUI();

  sortResults(lookupState.results);

  if (!lookupState.results.length) {
    elEmpty.style.display = "block";
    return;
  }

  elResults.style.display = "block";
  elBody.innerHTML = "";

  lookupState.results.forEach(r => {
    const tr = document.createElement("tr");

    const foundParts = [];
    if (r.foundDeathDate) foundParts.push(`Død: ${formatDate(r.foundDeathDate)}`);
    if (r.foundBirthDate) foundParts.push(`Født: ${formatDate(r.foundBirthDate)}`);

    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${foundParts.join("<br>") || "—"}</td>
      <td class="lookup-src-cell">${renderSourceIcon(r.source)}</td>
      <td>${r.flagged ? "⚑ flagged" : "—"}</td>
      <td class="lookup-actions">
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
      lookupState.results = lookupState.results.filter(x => x.personId !== r.personId);
      renderResults();
    };

    elBody.appendChild(tr);
  });
}

/* =====================================================
   SCAN (approved picks only)
===================================================== */

btnOpen?.addEventListener("click", async () => {
  resetUI();
  modal.classList.remove("hidden");

  lookupState.loading = true;
  elLoading.style.display = "block";

  const peopleSnap  = await getPeopleSnap(true);
  const playersSnap = await getPlayersSnap(true);

  // Map people docs for O(1) lookup
  const peopleById = new Map(peopleSnap.docs.map(d => [d.id, d]));

  // personIds der bruges af mindst ét approved pick (2026)
  const usedPersonIds = new Set();

  playersSnap.forEach(ps => {
    const picks = ps.data().entries?.["2026"]?.picks || [];
    picks.forEach(p => {
      if (p.status === "approved" && p.personId) usedPersonIds.add(p.personId);
    });
  });

  lookupState.results = [];

  const ids = [...usedPersonIds];
  const total = ids.length;
  let checked = 0;

  elProgress.textContent = `Checked 0 / ${total} (Results: 0)`;

  for (const personId of ids) {
    checked++;

    // progress update løbende
    if (checked % 3 === 0 || checked === total) {
      elProgress.textContent = `Checked ${checked} / ${total} (Results: ${lookupState.results.length})`;
      await yieldToUI();
    }

    if (lookupState.dismissed.has(personId)) continue;

    const docSnap = peopleById.get(personId);
    if (!docSnap) continue;

    const person = docSnap.data();
    const name = normStr(person?.name);
    if (!name) continue;

    const localBirth = normStr(person?.birthDate);
    const localDeath = normStr(person?.deathDate);

    // Hvis deathDate allerede findes, ignorer (som aftalt)
    if (localDeath) continue;

    try {
let foundBirth = "";
let foundDeath = "";
let sourceParts = [];

// Wikidata
const wd = await fetchWikidataPerson(name);
const wdBirth = wd?.birthDate || "";
const wdDeath = wd?.deathDate || "";

if (wdBirth || wdDeath) sourceParts.push("wikidata");

// Wikipedia → QID → Wikidata
const wp = await fetchWikipediaFallbackDates(name);
const wpBirth = wp?.birthDate || "";
const wpDeath = wp?.deathDate || "";

if (wpBirth || wpDeath) sourceParts.push("wikipedia");

// konsolider (prioritet: wikidata først, wikipedia som sekundær)
foundBirth = wdBirth || wpBirth;
foundDeath = wdDeath || wpDeath;

const source = sourceParts.join(",");

      // Hvis intet fundet → skip (vi viser kun relevante results)
      if (!SHOW_ALL_LOOKUP_RESULTS && !foundBirth && !foundDeath) continue;

      // BirthDate skal kun på result-listen hvis:
      // - lokalt mangler, og vi fandt den
      // - eller lokalt findes men er uenig (så man kan tage stilling)
      const birthIsRelevant =
        foundBirth && (!localBirth || localBirth !== foundBirth);

      // DeathDate er altid relevant her (lokalt er tomt), men vi forventer næsten altid tomt IRL
      const deathIsRelevant =
        foundDeath && (!localDeath || localDeath !== foundDeath);

      if (!birthIsRelevant && !deathIsRelevant) continue;

      lookupState.results.push({
        personId,
        name: wiki?.label || name,
        foundBirthDate: birthIsRelevant ? foundBirth : null,
        foundDeathDate: deathIsRelevant ? foundDeath : null,
        source: source || "wikidata",
        flagged: person?.flags?.pendingDeath === true
      });

    } catch (err) {
      console.warn("Lookup failed for", name, err);
    }
  }

  lookupState.loading = false;

  elProgress.textContent = `Checked ${total} / ${total} (Results: ${lookupState.results.length})`;
  renderResults();
});

btnApplyAll?.addEventListener("click", applyAll);
btnClose?.addEventListener("click", () => modal.classList.add("hidden"));
