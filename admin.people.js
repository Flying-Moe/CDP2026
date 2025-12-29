console.log("admin.people.js loaded");

/* =====================================================
   IMPORTS
===================================================== */

import {
  db,
  normalizeName,
  parseFlexibleDate,
  refreshAdminViews,
  fetchWikidataPerson,
  formatDateForDisplay,
  calculateHitPoints,
  attachModalDirtyTracking
} from "./admin.core.js";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentEditPersonKey = null;

let peopleSortKey = "name";   // default
let peopleSortDir = "asc";   // asc | desc
let allPeopleRows = [];
let currentPeoplePlayerFilter = "all";

/* =====================================================
   PEOPLE TAB – DERIVED FROM APPROVED PICKS
===================================================== */

function sortPeople(groups) {
  const arr = [...groups.values()];

  return arr.sort((a, b) => {
    let A, B;

    switch (peopleSortKey) {
      case "birth":
        A = [...a.birthDates][0] || "";
        B = [...b.birthDates][0] || "";
        break;

      case "death":
        A = [...a.deathDates][0] || "";
        B = [...b.deathDates][0] || "";
        break;

      case "pp": {
        const aBirth = [...a.birthDates][0];
        const bBirth = [...b.birthDates][0];
        A = aBirth ? calculateHitPoints(aBirth, [...a.deathDates][0] || "") : -1;
        B = bBirth ? calculateHitPoints(bBirth, [...b.deathDates][0] || "") : -1;
        break;
      }

      case "pb":
        A = a.playerIds.size;
        B = b.playerIds.size;
        break;

      case "status":
        A = a.birthDates.size === 0 ? 2 : a.birthDates.size > 1 ? 1 : 0;
        B = b.birthDates.size === 0 ? 2 : b.birthDates.size > 1 ? 1 : 0;
        break;

      case "name":
      default:
        A = a.displayName;
        B = b.displayName;
    }

    if (A === B) return 0;

    if (peopleSortDir === "asc") {
      return A > B ? 1 : -1;
    } else {
      return A < B ? 1 : -1;
    }
  });
}

export async function loadPeople() {
  const tbody = document.querySelector("#people-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const playersSnap = await getDocs(collection(db, "players"));
  const peopleSnap  = await getDocs(collection(db, "people"));

// 🔑 map playerId -> playerName (bruges til tooltips)
const playerNameMap = {};
playersSnap.forEach(ps => {
  const data = ps.data();
  playerNameMap[ps.id] = data.name || data.playerName || ps.id;
});
   
  /* --------------------------------------------
     GROUP APPROVED PICKS BY NORMALIZED NAME
  -------------------------------------------- */

// Opret en mappe til at gemme grupperne
const groups = new Map();

// Opret en liste til admin players
window.__adminPlayers = []; // Tilføj dette for at gemme spillerne

// Gennemgå playersSnap og opbyg grupperne og admin players
playersSnap.forEach(ps => {
  const playerId = ps.id;
  const picks = ps.data().entries?.["2026"]?.picks || [];

  // Gem admin players med spillerdata
  window.__adminPlayers.push({
    id: playerId,
    picks: picks // Gem picks for denne spiller
  });

  // Gennemgå picks for at gruppere dem
  picks.forEach(pick => {
    if (pick.status !== "approved") return;

    const name = (pick.normalizedName || pick.raw || "").trim();
    if (!name) return;

    const key = normalizeName(name);

    // Hvis gruppen ikke findes, opret en ny
    if (!groups.has(key)) {
      groups.set(key, {
        displayName: name,
        playerIds: new Set(),
        birthDates: new Set(),
        deathDates: new Set(),
        personIds: new Set(),
        picks: []
      });
    }

    // Hent den eksisterende gruppe
    const g = groups.get(key);
    
    // Tilføj spilleren og dens picks
    g.playerIds.add(playerId);
    g.picks.push(pick);

    // Tilføj birthDate, deathDate og personId til gruppen
    if (pick.birthDate) g.birthDates.add(pick.birthDate);
    if (pick.deathDate) g.deathDates.add(pick.deathDate);
    if (pick.personId) g.personIds.add(pick.personId);
  });
});

   
const groupArray = [...groups.values()];

function namesAreSimilar(a, b) {
  const na = normalizeName(a.displayName);
  const nb = normalizeName(b.displayName);

  return na !== nb && (na.includes(nb) || nb.includes(na));
}

/* --------------------------------------------
   RENDER TABLE
-------------------------------------------- */

sortPeople(groups).forEach(g => {

  const similarGroups = groupArray.filter(
    other => other !== g && namesAreSimilar(g, other)
  );

const hasDuplicatePerPlayer =
  g.picks.length > g.playerIds.size;

const canMerge =
  g.birthDates.size > 1 ||
  g.personIds.size > 1 ||
  similarGroups.length > 0 ||
  hasDuplicatePerPlayer;

let statusText = "OK";
let statusClass = "";

if (hasDuplicatePerPlayer) {
  statusText = "Conflict (duplicate picks)";
  statusClass = "status-conflict";
} else if (g.birthDates.size === 0) {
  statusText = "Missing";
  statusClass = "status-missing";
} else if (g.birthDates.size > 1) {
  statusText = "Conflict";
  statusClass = "status-conflict";
}

  const usedBy = g.playerIds.size;

  const birthDate =
    g.birthDates.size === 1
      ? formatDateForDisplay([...g.birthDates][0])
      : "—";

  const deathDate =
    g.deathDates?.size === 1
      ? formatDateForDisplay([...g.deathDates][0])
      : "—";

   let potentialPoints = "—";

if (g.birthDates?.size === 1) {
  const birthISO = [...g.birthDates][0];

  // hvis død: brug deathDate, ellers i dag
  const deathISO =
    g.deathDates?.size === 1 ? [...g.deathDates][0] : "";

  potentialPoints = calculateHitPoints(birthISO, deathISO);
}
   
tbody.innerHTML += `
  <tr
  class="${statusClass} ${g.deathDates?.size === 1 ? "is-dead" : ""}"
  data-player-ids="${[...g.playerIds].join(",")}"
>
      <td class="people-name">
        ${g.displayName}
        ${g.deathDates?.size === 1 ? `<span class="death-mark" title="Deceased">✞</span>` : ""}
        ${
          similarGroups.length
            ? `<div style="font-size:0.8em;color:#666;">
                 Possible matches: ${similarGroups
                   .map(s => s.displayName)
                   .join(", ")}
               </div>`
               : ""
        }
      </td>


<td class="birth-date">${birthDate}</td>
<td class="death-date">${deathDate}</td>

<td style="text-align:center;">
  ${potentialPoints}
</td>

<td style="text-align:center;">
  <span
    class="used-by"
    data-names="${[...g.playerIds]
      .map(pid => playerNameMap[pid])
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
      .join(", ")
    }"
    title="${[...g.playerIds]
      .map(pid => playerNameMap[pid])
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
      .join(", ")
    }"
    style="cursor:pointer;"
  >
    ${usedBy}
  </span>
</td>

      <td class="wiki-cell">
        <button
          class="wiki-check-btn"
          data-name="${g.displayName}"
          data-key="${normalizeName(g.displayName)}">Wiki</button>
        <span
          class="wiki-result"
          data-key="${normalizeName(g.displayName)}">
        </span>
      </td>

      <td>
        <button
          class="edit-people-btn"
          ${statusText === "Conflict" ? "disabled" : ""}
          data-key="${normalizeName(g.displayName)}">
          Edit
        </button>

        <button
          class="delete-people-btn"
          data-key="${normalizeName(g.displayName)}">
          Delete
        </button>
      </td>

      <td>${statusText}</td>
    </tr>
  `;
});

// 🔑 gem grupper globalt til Apply Wikidata
window.__peopleGroups = groups;

   /* ===============================
   MERGE & CLEANUP – PLAN (READ ONLY)
   =============================== */

function scorePersonCandidate(candidate) {
  let score = 0;
  if (candidate.personId) score += 2;
  if (candidate.birthDate) score += 2;
  if (candidate.deathDate) score += 1;
  return score;
}

function buildMergePlan(groups, players) {
  const plan = {
    groups: [],
    totalApprovedUpdates: 0,
    orphanPeopleIds: new Set()
  };

  for (const g of groups.values()) {

    // kun grupper med reel konflikt
    const hasConflict =
      g.personIds.size > 1 ||
      g.birthDates.size > 1 ||
      g.picks.length > g.playerIds.size;

    if (!hasConflict) continue;

    // kandidater pr. personId
    const candidates = [...g.personIds].map(pid => {
      const pick = g.picks.find(p => p.personId === pid) || {};
      return {
        personId: pid,
        birthDate: pick.birthDate || null,
        deathDate: pick.deathDate || null
      };
    });

    // vælg master = flest informationer
    candidates.sort((a, b) => scorePersonCandidate(b) - scorePersonCandidate(a));
    const master = candidates[0];

    // find alle approved picks der skal opdateres
    const affectedPicks = [];

    for (const player of players) {
      const approved = (player.picks || []).filter(
        p =>
          p.status === "approved" &&
          normalizeName(p.normalizedName || p.raw) === normalizeName(g.displayName)
      );

      approved.forEach(p => {
        if (p.personId !== master.personId) {
          affectedPicks.push({
            playerId: player.id,
            from: p.personId,
            to: master.personId
          });
        }
      });
    }

    if (affectedPicks.length === 0) continue;

    plan.groups.push({
      name: g.displayName,
      master,
      merged: candidates.slice(1),
      affectedPicksCount: affectedPicks.length
    });

    plan.totalApprovedUpdates += affectedPicks.length;

    // orphan candidates (people uden picks)
    candidates.slice(1).forEach(c => {
      plan.orphanPeopleIds.add(c.personId);
    });
  }

  return plan;
   
}

   // DEBUG / PREVIEW – bruges senere i modal
window.previewMergePlan = function () {
  const players = window.__adminPlayers || [];
  const plan = buildMergePlan(window.__peopleGroups, players);

  console.group("MERGE & CLEAN UP – PREVIEW");

  console.log(`Grupper der merges: ${plan.groups.length}`);
  console.log(`Approved picks der opdateres: ${plan.totalApprovedUpdates}`);
  console.log(`Orphan people der kan slettes: ${plan.orphanPeopleIds.size}`);

  plan.groups.forEach(g => {
    console.group(g.name);
    console.log("Master:", g.master);
    console.log("Merged:", g.merged.map(m => m.personId));
    console.log("Affected approved picks:", g.affectedPicksCount);
    console.groupEnd();
  });

  console.groupEnd();

  return plan;
};

   const mergeAllBtn = document.getElementById("merge-all-btn");
if (mergeAllBtn) {
  mergeAllBtn.onclick = async () => {
    const plan = buildMergePlan(window.__peopleGroups, window.__adminPlayers || []);

    if (plan.groups.length === 0) {
      alert("No conflicts found. Nothing to merge.");
      return;
    }

    openMergeModal(plan);
  };
}

if (mergeAllBtn) mergeAllBtn.disabled = false;
   
   // Cache all rows for filtering
allPeopleRows = Array.from(
  document.querySelectorAll("#people-table tbody tr")
);
   
// Build + restore player filter dropdown
const playerFilter = document.getElementById("people-player-filter");
if (playerFilter) {
  playerFilter.innerHTML = `<option value="all">All players</option>`;

const players = playersSnap.docs
  .map(ps => ({
    id: ps.id,
    name: ps.data().name || ps.id
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

  players.forEach(player => {
    const opt = document.createElement("option");
    opt.value = player.id;
    opt.textContent = player.name;
    playerFilter.appendChild(opt);
  });

  // Restore previously selected filter
  playerFilter.value = currentPeoplePlayerFilter;
  applyPeoplePlayerFilter(currentPeoplePlayerFilter);
}

// 🔗 bind alle knapper (edit / merge / delete / wiki)
bindPeopleActions(groups, playersSnap);

// 📱 klik-tooltip til mobil (fallback)
document.querySelectorAll(".used-by").forEach(el => {
  el.addEventListener("click", () => {
    const names = el.dataset.names;
    if (!names) return;
    alert(`Picked by: ${names}`);
  });
});
}

document.addEventListener("click", e => {
  const th = e.target.closest("#people-table th[data-sort]");
  if (!th) return;

  const table = th.closest("table");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const key = th.dataset.sort;

  // toggle direction
  if (peopleSortKey === key) {
    peopleSortDir = peopleSortDir === "asc" ? "desc" : "asc";
  } else {
    peopleSortKey = key;
    peopleSortDir = "asc";
  }

  const rows = Array.from(tbody.querySelectorAll("tr"));

  rows.sort((a, b) => {
    let A, B;

    switch (key) {
      case "name":
        A = a.children[0].innerText.trim().toLowerCase();
        B = b.children[0].innerText.trim().toLowerCase();
        break;

      case "birth":
        A = a.children[1].innerText.trim();
        B = b.children[1].innerText.trim();
        break;

      case "death":
        A = a.children[2].innerText.trim();
        B = b.children[2].innerText.trim();
        break;

      case "pp":
        A = parseInt(a.children[3].innerText) || -1;
        B = parseInt(b.children[3].innerText) || -1;
        break;

      case "pb":
        A = parseInt(a.children[4].innerText) || -1;
        B = parseInt(b.children[4].innerText) || -1;
        break;

      case "status":
        A = a.children[7].innerText.trim();
        B = b.children[7].innerText.trim();
        break;

      default:
        return 0;
    }

    if (A === B) return 0;

    return peopleSortDir === "asc"
      ? A > B ? 1 : -1
      : A < B ? 1 : -1;
  });

  // re-append sorted rows
  rows.forEach(tr => tbody.appendChild(tr));
});

/* =====================================================
   PEOPLE ACTIONS (MERGE / DELETE)
===================================================== */

function bindPeopleActions(groups, playersSnap) {

  // 🔑 GØR GROUPS GLOBALT TILGÆNGELIG (bruges af Apply / Save)
  window.__peopleGroups = groups;

  /* ---------- WIKIDATA LOOKUP ---------- */

  document.querySelectorAll(".wiki-check-btn").forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.name;
      const key = btn.dataset.key;

      const resultEl = document.querySelector(
        `.wiki-result[data-key="${key}"]`
      );
      if (!resultEl) return;

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "Looking up…";
      resultEl.textContent = "";

      try {
        const data = await fetchWikidataPerson(name);

        if (!data) {
          resultEl.textContent = "No Wikidata match found";
          return;
        }

        const parts = [];

        if (data.birthDate) {
          parts.push(
            `Born: ${formatDateForDisplay(data.birthDate)}`
          );
        }

        if (data.deathDate) {
          parts.push(
            `⚰️ Died: ${formatDateForDisplay(data.deathDate)}`
          );
        }

        resultEl.innerHTML = `
          <div style="margin-top:4px;font-size:0.85em;">
            ${parts.join("<br>")}
            <br>
            <button class="apply-wikidata-btn"
              data-key="${key}"
              data-birth="${data.birthDate || ""}"
              data-death="${data.deathDate || ""}">
              Apply
            </button>
          </div>
        `;
      } catch {
        resultEl.textContent = "Lookup failed";
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    };
  });

  /* ---------- EDIT ---------- */

  document.querySelectorAll(".edit-people-btn").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      const group = groups.get(key);
      if (!group) return;

      currentEditPersonKey = key;

      const nameInput  = document.getElementById("edit-person-name");
      const birthInput = document.getElementById("edit-person-birthdate");
      const deathInput = document.getElementById("edit-person-deathdate");
      const modal      = document.getElementById("edit-person-modal");

      nameInput.value = group.displayName;

      birthInput.value =
        group.birthDates.size === 1
          ? formatDateForDisplay([...group.birthDates][0])
          : "";

      deathInput.value =
        group.deathDates?.size === 1
          ? formatDateForDisplay([...group.deathDates][0])
          : "";

      modal.classList.remove("hidden");
attachModalDirtyTracking(modal);
modal.__resetDirty();

    };
  });

  /* ---------- MERGE ---------- */

  document.querySelectorAll(".merge-people-btn").forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.key;
      const group = groups.get(key);
      if (!group) return;

      const canonicalBirthDate =
        group.birthDates.size === 1 ? [...group.birthDates][0] : "";

      let personId;
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
              name: group.displayName,
              nameNormalized: key,
              birthDate: canonicalBirthDate
            })
          ).id;
        }
      }

      for (const ps of playersSnap.docs) {
        const ref = doc(db, "players", ps.id);
        const data = ps.data();
        const picks = data.entries?.["2026"]?.picks || [];

        const matching = picks.filter(
          p =>
            p.status === "approved" &&
            normalizeName(p.normalizedName || p.raw) === key
        );

        if (matching.length <= 1) continue;

        const keep = {
          ...matching[0],
          normalizedName: normalizeName(
            matching[0].normalizedName || matching[0].raw
          ),
          personId,
          birthDate: canonicalBirthDate,
          deathDate:
            matching.map(p => p.deathDate).find(Boolean) || ""
        };

        const cleaned = picks.filter(
          p =>
            normalizeName(p.normalizedName || p.raw) !== key
        );

        cleaned.push(keep);

        await updateDoc(ref, {
          "entries.2026.picks": cleaned
        });
      }

      await refreshAdminViews();
    };
  });

  /* ---------- DELETE ---------- */

document.querySelectorAll(".delete-people-btn").forEach(btn => {
  btn.onclick = async () => {
    const key = btn.dataset.key;
    const group = groups.get(key);
    if (!group) return;

    if (!confirm(`Delete ALL picks named "${group.displayName}"?`)) return;

    btn.closest("tr")?.remove();
     
    const updates = [];

    for (const ps of playersSnap.docs) {
      const ref = doc(db, "players", ps.id);
      const data = ps.data();
      const picks = data.entries?.["2026"]?.picks || [];

      const filtered = picks.filter(
        p => normalizeName(p.normalizedName || p.raw) !== key
      );

      if (filtered.length !== picks.length) {
        updates.push(
          updateDoc(ref, {
            "entries.2026.picks": filtered
          })
        );
      }
    }

    // 🔥 Kør alle Firestore-opdateringer parallelt
    if (updates.length) {
      await Promise.all(updates);
    }

    // 🔄 Opdatér UI bagefter
    await refreshAdminViews();
  };
});
}

/* =====================================================
   APPLY WIKIDATA – EVENT DELEGATION
===================================================== */

document.addEventListener("click", async e => {
  const btn = e.target.closest(".apply-wikidata-btn");
  if (!btn) return;

  console.log("✅ APPLY CLICKED", btn.dataset);

  const key = btn.dataset.key;
  const wikiBirth = btn.dataset.birth || "";
  const wikiDeath = btn.dataset.death || "";

  // Hent korrekt group ud fra knappen, ikke fra currentEditPersonKey
  const group = window.__peopleGroups?.get(key);
  if (!group) {
    console.warn("No group found for key", key);
    return;
  }

  let finalBirth =
    group.birthDates.size === 1 ? [...group.birthDates][0] : "";
  let finalDeath = group.deathDate || "";

  if (!finalBirth && wikiBirth) {
    finalBirth = wikiBirth;
  } else if (finalBirth && wikiBirth && finalBirth !== wikiBirth) {
    if (
      confirm(
        `Birth date exists:\n\nLocal: ${formatDateForDisplay(finalBirth)}\nWikidata: ${formatDateForDisplay(wikiBirth)}\n\nOverwrite?`
      )
    ) {
      finalBirth = wikiBirth;
    }
  }

  if (!finalDeath && wikiDeath) {
    finalDeath = wikiDeath;
  } else if (finalDeath && wikiDeath && finalDeath !== wikiDeath) {
    if (
      confirm(
        `Death date exists:\n\nLocal: ${formatDateForDisplay(finalDeath)}\nWikidata: ${formatDateForDisplay(wikiDeath)}\n\nOverwrite?`
      )
    ) {
      finalDeath = wikiDeath;
    }
  }

  const q = query(
    collection(db, "people"),
    where("nameNormalized", "==", key)
  );
  const snap = await getDocs(q);

  let personId;

  if (!snap.empty) {
    personId = snap.docs[0].id;
    await updateDoc(doc(db, "people", personId), {
      birthDate: finalBirth,
      deathDate: finalDeath
    });
  } else {
    personId = (
      await addDoc(collection(db, "people"), {
        name: group.displayName,
        nameNormalized: key,
        birthDate: finalBirth,
        deathDate: finalDeath
      })
    ).id;
  }

  const playersSnap = await getDocs(collection(db, "players"));

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
         p.birthDate = finalBirth;
         p.deathDate = finalDeath;
         p.personId = personId;
         changed = true;
      }
    });

    if (changed) {
      await updateDoc(ref, {
        "entries.2026.picks": picks
      });
    }
  }

  await refreshAdminViews();
});

/* =====================================================
   SAVE PERSON – EVENT DELEGATION (single)
===================================================== */

document.addEventListener("click", async e => {
  const btn = e.target.closest("#save-person-btn");
  if (!btn) return;

  if (!currentEditPersonKey) return;

  const nameInput  = document.getElementById("edit-person-name");
  const birthInput = document.getElementById("edit-person-birthdate");
  const deathInput = document.getElementById("edit-person-deathdate");

  const name = (nameInput?.value || "").replace(/\s+/g, " ").trim();
  if (!name) return;

  const rawBirth = (birthInput?.value || "").trim();
  const rawDeath = (deathInput?.value || "").trim();

  const birthDate = rawBirth ? parseFlexibleDate(rawBirth) : "";
  const deathDate = rawDeath ? parseFlexibleDate(rawDeath) : "";

  const oldNormalized = currentEditPersonKey;
  const newNormalized = normalizeName(name);

  // 1) Upsert i people (find via oldNormalized)
  const qPeople = query(
    collection(db, "people"),
    where("nameNormalized", "==", oldNormalized)
  );
  const snapPeople = await getDocs(qPeople);

  let personId;

  if (!snapPeople.empty) {
    personId = snapPeople.docs[0].id;
    await updateDoc(doc(db, "people", personId), {
      name,
      nameNormalized: newNormalized,
      birthDate,
      deathDate
    });
  } else {
    const ref = await addDoc(collection(db, "people"), {
      name,
      nameNormalized: newNormalized,
      birthDate,
      deathDate
    });
    personId = ref.id;
  }

  // 2) Opdatér ALLE approved picks der matcher oldNormalized
  const playersSnap = await getDocs(collection(db, "players"));

  for (const ps of playersSnap.docs) {
    const playerRef = doc(db, "players", ps.id);
    const picks = ps.data().entries?.["2026"]?.picks || [];

    let changed = false;

    picks.forEach(p => {
      if (p.status !== "approved") return;

      const norm = normalizeName(p.normalizedName || p.raw || "");
      if (norm !== oldNormalized) return;

      // VIGTIGT: opdatér navnet i picks, ellers ændrer People-tabben sig ikke
      p.normalizedName = name;
      p.raw = name;

      p.birthDate = birthDate;
      p.deathDate = deathDate;
      p.personId = personId;

      changed = true;
    });

    if (changed) {
      await updateDoc(playerRef, { "entries.2026.picks": picks });
    }
  }

  // 3) Luk + refresh
  currentEditPersonKey = null;
  document.getElementById("edit-person-modal")?.classList.add("hidden");
  await refreshAdminViews();
});

function applyPeoplePlayerFilter(playerId) {
  allPeopleRows.forEach(row => {
    const ids = (row.dataset.playerIds || "").split(",").filter(Boolean);

    if (playerId === "all" || ids.includes(playerId)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

document.addEventListener("change", e => {
  if (e.target.id !== "people-player-filter") return;
  currentPeoplePlayerFilter = e.target.value;
  applyPeoplePlayerFilter(currentPeoplePlayerFilter);
});

function openMergeModal(plan) {
  const overlay = document.getElementById("merge-modal-overlay");
  const content = document.getElementById("merge-preview-content");

  content.innerHTML = "";  // Tøm indholdet af modalens preview

  const summary = document.createElement("p");
  summary.innerHTML = `
    Groups to merge: <strong>${plan.groups.length}</strong><br>
    Approved picks to update: <strong>${plan.totalApprovedUpdates}</strong><br>
    Orphan people to remove: <strong>${plan.orphanPeopleIds.size}</strong>
  `;
  content.appendChild(summary);

  // Gennemgå grupperne og vis deres oplysninger
  plan.groups.forEach(g => {
    const block = document.createElement("div");
    block.style.marginBottom = "0.75rem";
    block.innerHTML = `
      <strong>${g.name}</strong><br>
      Master personId: ${g.master.personId}<br>
      Approved picks updated: ${g.affectedPicksCount}
    `;
    content.appendChild(block);
  });

  // Vis modalen
  overlay.classList.remove("hidden"); // Fjern "hidden" for at vise modalens overlay

  // Lyt efter knapper til at lukke eller bekræfte modal
  document.getElementById("merge-cancel-btn").onclick = closeMergeModal;
  document.getElementById("merge-confirm-btn").onclick = () => executeMergePlan(plan);

  // Luk modal, hvis du klikker udenfor den
  overlay.onclick = e => {
    if (e.target === overlay) closeMergeModal();
  };

  // Lyt efter Escape-tasten for at lukke modalen
  document.onkeydown = e => {
    if (e.key === "Escape") closeMergeModal();
  };
}

function closeMergeModal() {
  document.getElementById("merge-modal-overlay").classList.add("hidden");
  document.onkeydown = null;
}

async function executeMergePlan(plan) {
  // Firebase v9 batch
  const batch = writeBatch(db);

  // 1) Update approved picks: align personId til master pr. group
  for (const group of plan.groups) {
    for (const ps of window.__adminPlayers || []) {
      const playerId = ps.id;
      const playerRef = doc(db, "players", playerId);

      // OBS: dine players i admin.people.js er typisk “plain objects” (id + name),
      // så vi skal læse picks fra snapshot igen for sikkerhed og korrekt feltsti.
      // Minimal belastning: vi samler reads i ét call pr player-id? Nej.
      // Vi bruger i stedet playersSnap i loadPeople-flow (eksisterer i scope dér).
      // Derfor: executeMergePlan skal kaldes med playersSnap også, hvis vi vil 0 reads.
      //
      // For nu: lav 0 gæt. Brug refreshAdminViews efter commit.

      // Hvis du allerede har players data med entries.2026.picks i __adminPlayers, brug det:
      const picks = ps.picks || ps.entries?.["2026"]?.picks || [];

      let changed = false;

      for (const p of picks) {
        if (p.status !== "approved") continue;

        const norm = normalizeName(p.normalizedName || p.raw || "");
        if (norm !== normalizeName(group.name)) continue;

        if (p.personId !== group.master.personId) {
          p.personId = group.master.personId;
          changed = true;
        }
      }

      if (changed) {
        batch.update(playerRef, { "entries.2026.picks": picks });
      }
    }
  }

  // 2) Delete orphan people-docs (safe: kun dem der IKKE er master)
  for (const personId of plan.orphanPeopleIds) {
    const isMasterSomewhere = plan.groups.some(g => g.master.personId === personId);
    if (isMasterSomewhere) continue;

    batch.delete(doc(db, "people", personId));
  }

  await batch.commit();

  closeMergeModal();
  alert("Merge completed");

  await refreshAdminViews();
}
