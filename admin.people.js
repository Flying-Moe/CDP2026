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
  attachModalDirtyTracking,
  getPlayersSnap,
  getPeopleSnap,
  invalidateAdminCache
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

// 🔧 Enrich admin picks with people birth/death dates (runtime only)
function enrichAdminPlayersWithPeopleData(adminPlayers, peopleById) {
  if (!Array.isArray(adminPlayers) || !peopleById) return;

  adminPlayers.forEach(player => {
    (player.picks || []).forEach(pick => {
      if (!pick.personId) return;

      const person = peopleById[pick.personId];
      if (!person) return;

      if (!pick.birthDate && person.birthDate) {
        pick.birthDate = person.birthDate;
      }
      if (!pick.deathDate && person.deathDate) {
        pick.deathDate = person.deathDate;
      }
    });
  });
}

export async function loadPeople(options = {}) {
  const { force = false } = options;

  const tbody = document.querySelector("#people-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const playersSnap = await getPlayersSnap(force);
  const peopleSnap  = await getPeopleSnap(force);

   // 🔑 Build peopleById map (bruges til runtime-berigelse)
const peopleById = {};
peopleSnap.forEach(d => {
  peopleById[d.id] = d.data();
});

// 🔑 Enrich admin players with birth/death dates from people
enrichAdminPlayersWithPeopleData(window.__adminPlayers, peopleById);

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

const hasRealMergeConflict =
  g.birthDates.size > 1 ||
  g.personIds.size > 1;

let statusText = "OK";
let statusClass = "";

if (hasRealMergeConflict) {
  statusText = "Mergeable people";
  statusClass = "status-conflict";
} else if (hasDuplicatePerPlayer) {
  statusText = "Duplicate picks (auto-clean)";
  statusClass = "status-warning";
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
  data-key="${normalizeName(g.displayName)}"
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

function buildMergePlan(groups, players, peopleSnap) {

  // 🔎 Alle personIds som faktisk bruges af approved picks
  const usedPersonIds = new Set();

  for (const player of players) {
    (player.picks || []).forEach(p => {
      if (p.status === "approved" && p.personId) {
        usedPersonIds.add(p.personId);
      }
    });
  }

const plan = {
  groups: [],
  totalApprovedUpdates: 0,
  orphanPeopleIds: new Set(),
  hasDuplicatePicks: false
};

  for (const g of groups.values()) {

    // 🔴 Kun REELLE merge-konflikter
const hasConflict =
  g.personIds.size > 1 ||
  (g.birthDates.size > 1 && g.birthDates.has("")) ||
  g.picks.length > g.playerIds.size;

     if (g.picks.length > g.playerIds.size) {
  plan.hasDuplicatePicks = true;
}

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
      (player.picks || []).forEach(p => {
        if (
          p.status === "approved" &&
          normalizeName(p.normalizedName || p.raw) === normalizeName(g.displayName) &&
          p.personId !== master.personId
        ) {
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

    // merge-orphans (personIds der forsvinder pga merge)
    candidates.slice(1).forEach(c => {
      plan.orphanPeopleIds.add(c.personId);
    });
  }

// 🧹 PURE ORPHANS FROM PEOPLE COLLECTION
// people docs der ikke bruges af NOGEN approved picks
if (peopleSnap) {
  peopleSnap.forEach(docu => {
    const pid = docu.id;
    if (!usedPersonIds.has(pid)) {
      plan.orphanPeopleIds.add(pid);
    }
  });
}
  return plan;
}

const mergeAllBtn = document.getElementById("merge-all-btn");

if (mergeAllBtn) {
  const plan = buildMergePlan(
    window.__peopleGroups,
    window.__adminPlayers || [],
    await getPeopleSnap(false)
  );

  const hasMergeConflicts = plan.groups.length > 0;
  const hasOrphans = plan.orphanPeopleIds.size > 0;
  const hasDuplicatePicks = plan.hasDuplicatePicks;

  mergeAllBtn.disabled = !(hasMergeConflicts || hasOrphans || hasDuplicatePicks);

  // Tooltip – forklar hvorfor knappen er (in)aktiv
  if (mergeAllBtn.disabled) {
    mergeAllBtn.title = "No conflicts, duplicate picks, or unused people found";
  } else if (hasMergeConflicts && hasOrphans) {
    mergeAllBtn.title = "Conflicting people and unused entries detected";
  } else if (hasMergeConflicts) {
    mergeAllBtn.title = "Mergeable people detected";
  } else if (hasDuplicatePicks) {
    mergeAllBtn.title = "Duplicate picks can be auto-cleaned";
  } else if (hasOrphans) {
    mergeAllBtn.title = "Unused people can be removed";
  }

  mergeAllBtn.onclick = async () => {
    openMergeModal(plan);
  };
}
   
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

  /* ---------- DELETE ---------- */

document.querySelectorAll(".delete-people-btn").forEach(btn => {
  btn.onclick = async () => {
    const key = btn.dataset.key;
    const group = groups.get(key);
    if (!group) return;

    if (!confirm(`Delete ALL picks named "${group.displayName}"?`)) return;

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

    if (updates.length) {
      await Promise.all(updates);
    }

    invalidateAdminCache("players", "people");
    await loadPeople({ force: true });
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

// 🔄 Optimistic UI – opdatér rækken direkte
const row = btn.closest("tr");

if (row) {
  const birthCell = row.querySelector(".birth-date");
  const deathCell = row.querySelector(".death-date");

  if (birthCell) {
    birthCell.textContent = finalBirth
      ? formatDateForDisplay(finalBirth)
      : "—";
  }

  if (deathCell) {
    deathCell.textContent = finalDeath
      ? formatDateForDisplay(finalDeath)
      : "—";
  }
}

invalidateAdminCache("players", "people");
await loadPeople({ force: true });

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

// 🔄 Optimistic UI – opdatér people-row direkte
const row = document.querySelector(
  `#people-table tr[data-player-ids][data-key="${oldNormalized}"]`
);

if (row) {
  row.dataset.key = newNormalized;

  const nameCell = row.querySelector(".people-name");
  const birthCell = row.querySelector(".birth-date");
  const deathCell = row.querySelector(".death-date");

  if (nameCell) nameCell.firstChild.textContent = name;
  if (birthCell) {
    birthCell.textContent = birthDate
      ? formatDateForDisplay(birthDate)
      : "—";
  }
  if (deathCell) {
    deathCell.textContent = deathDate
      ? formatDateForDisplay(deathDate)
      : "—";
  }
}

currentEditPersonKey = null;
document.getElementById("edit-person-modal")?.classList.add("hidden");

invalidateAdminCache("players", "people");
await loadPeople({ force: true });

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
  const modal = document.getElementById("merge-modal");
  const content = document.getElementById("merge-preview-content");
  const cancelBtn = document.getElementById("merge-cancel-btn");
  const confirmBtn = document.getElementById("merge-confirm-btn");

  if (!overlay || !modal || !content || !cancelBtn || !confirmBtn) {
    console.error("Merge modal elements missing");
    return;
  }

  content.innerHTML = `
    <p><strong>Groups to merge:</strong> ${plan.groups.length}</p>
    <p><strong>Approved picks to update:</strong> ${plan.totalApprovedUpdates}</p>
    <p><strong>Orphan people to remove:</strong> ${plan.orphanPeopleIds.size}</p>
${plan.duplicateSummary ? `
  <p style="margin-top:0.4rem;">
    <strong>Duplicate picks to clean:</strong><br>
    ${plan.duplicateSummary.join("<br>")}
  </p>
` : ""}

    <p style="margin-top:0.6rem; font-size:0.9em; color:#555;">
      Approved picks will be reassigned to a single canonical person.
      Unused people documents will be permanently removed.
    </p>
  `;

  // VIS
  overlay.classList.remove("hidden");
  modal.classList.remove("hidden");

  cancelBtn.onclick = () => closeMergeModal();

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    await executeMergePlan(plan);
    closeMergeModal();
  };
}

async function executeMergePlan(plan) {
  const batch = writeBatch(db);

  const peopleSnap = await getPeopleSnap(true);
  const peopleById = {};
  peopleSnap.forEach(d => peopleById[d.id] = d.data());

  const playersSnap = await getDocs(collection(db, "players"));

  // 🔁 1) Re-link + REPAIR picks
  for (const ps of playersSnap.docs) {
    const ref = doc(db, "players", ps.id);
    const data = ps.data();
    const picks = data.entries?.["2026"]?.picks || [];

    let changed = false;

    picks.forEach(p => {

       // ✅ REPAIR: udfyld manglende birth/deathDate fra people/{personId}
if (p.status === "approved" && p.personId) {
  const person = peopleById[p.personId];
  if (person) {
    if (!p.birthDate && person.birthDate) {
      p.birthDate = person.birthDate;
      changed = true;
    }
    if (!p.deathDate && person.deathDate) {
      p.deathDate = person.deathDate;
      changed = true;
    }
  }
}

      if (p.status !== "approved") return;

      const group = plan.groups.find(
        g => normalizeName(g.name) === normalizeName(p.normalizedName || p.raw)
      );
      if (!group) return;

      const masterId = group.master.personId;
      if (!masterId) return;

      const person = peopleById[masterId];
      if (!person) return;

      // 🔑 REPAIR PASS
      p.personId = masterId;
      if (!p.birthDate && person.birthDate) {
        p.birthDate = person.birthDate;
        changed = true;
      }
      if (!p.deathDate && person.deathDate) {
        p.deathDate = person.deathDate;
        changed = true;
      }
    });

    if (changed) {
      batch.update(ref, { "entries.2026.picks": picks });
    }
  }

  // 🧹 2) Slet orphan people
  plan.orphanPeopleIds.forEach(pid => {
    batch.delete(doc(db, "people", pid));
  });

await batch.commit();

// ✅ VIGTIGT: ingen kald til loadPlayers/loadPeople/refreshAdminViews her,
// fordi de kan være module-scopede og give "not defined".
// I stedet: invalidér cache og genindlæs siden (sikkert og stabilt).
invalidateAdminCache("players", "people");

closeMergeModal();
alert("Merge & clean-up completed");

// 🔄 Hard refresh af admin (sikrer at People/Players UI samt grupper er 100% i sync)
location.reload();

}

function closeMergeModal() {
  document.getElementById("merge-modal-overlay")?.classList.add("hidden");
  document.getElementById("merge-modal")?.classList.add("hidden");
  document.onkeydown = null;
}
