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
  formatDateForDisplay
} from "./admin.core.js";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentEditPersonKey = null;

/* =====================================================
   PEOPLE TAB – DERIVED FROM APPROVED PICKS
===================================================== */

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
  playerIds: new Set(),
  birthDates: new Set(),
  deathDates: new Set(),
  personIds: new Set(),
  picks: []
});
      }

      const g = groups.get(key);
      g.playerIds.add(playerId);
      g.picks.push(pick);

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

[...groups.values()]
  .sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" })
  )
.forEach(g => {

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

  tbody.innerHTML += `
    <tr class="${statusClass}">
      <td>
        ${g.displayName}
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

      <td>${birthDate}</td>
      <td>${deathDate}</td>

      <td>
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
          style="cursor:pointer;text-decoration:underline dotted;"
        >
          ${usedBy}
        </span>
      </td>

      <td>
        <button
          class="wiki-check-btn"
          data-name="${g.displayName}"
          data-key="${normalizeName(g.displayName)}">
          Check Wiki
        </button>
        <span
          class="wiki-result"
          data-key="${normalizeName(g.displayName)}"
          style="margin-left:8px;font-size:0.9em;">
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
          class="merge-people-btn"
          ${canMerge ? "" : "disabled"}
          title="Merge ${g.picks.length} picks (${g.playerIds.size} player${g.playerIds.size > 1 ? "s" : ""})"
          data-key="${normalizeName(g.displayName)}">
          Merge (${g.picks.length})
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

  // groupsMap ligger i closure fra sidste loadPeople
const group = window.__peopleGroups?.get(currentEditPersonKey);
if (!group) return;

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
