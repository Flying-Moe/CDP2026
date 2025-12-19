console.log("admin.people.js loaded");

/* =====================================================
   IMPORTS
===================================================== */

import {
  db,
  normalizeName,
  parseFlexibleDate,
  refreshAdminViews
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
          personIds: new Set(),
          picks: []
        });
      }

      const g = groups.get(key);
      g.playerIds.add(playerId);
      g.picks.push(pick);

      if (pick.birthDate) g.birthDates.add(pick.birthDate);
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
       const canMerge =
  g.birthDates.size > 1 ||
  g.personIds.size > 1 ||
  similarGroups.length > 0;

       const similarGroups = groupArray.filter(
  other => other !== g && namesAreSimilar(g, other)
);

let status = "OK";
let statusClass = "";

if (g.birthDates.size === 0) {
  status = "Missing";
  statusClass = "status-missing";
}

if (g.birthDates.size > 1) {
  status = "Conflict";
  statusClass = "status-conflict";
}
       
      const usedBy = g.playerIds.size;
      const birthDate =
        g.birthDates.size === 1 ? [...g.birthDates][0] : "—";

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
          <td>${status}</td>
<td>
  <span>
    class="used-by"
    data-names="${[...g.playerIds]
.map(pid => playerNameMap[pid])
.filter(Boolean)
.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
.join(", ")
    title="${[...g.playerIds]
.map(pid => playerNameMap[pid])
.filter(Boolean)
.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
.join(", ")
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
              Check Wikipedia
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
    ${status === "Conflict" ? "disabled" : ""}
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
        </tr>
      `;
    });

  bindPeopleActions(groups, playersSnap);
   // 📱 klik-tooltip til mobil (alert som fallback)
document.querySelectorAll(".used-by").forEach(el => {
  el.addEventListener("click", e => {
    const names = el.dataset.names;
    if (!names) return;
    alert(`Used by: ${names}`);
  });
});
}

/* =====================================================
   PEOPLE ACTIONS (MERGE / DELETE)
===================================================== */

function bindPeopleActions(groups, playersSnap) {

  /* ---------- EDIT ---------- */

  document.querySelectorAll(".edit-people-btn").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      const group = groups.get(key);
      if (!group) return;

      currentEditPersonKey = key;

      const nameInput = document.getElementById("edit-person-name");
      const birthInput = document.getElementById("edit-person-birthdate");
      const modal = document.getElementById("edit-person-modal");

      nameInput.value = group.displayName;
      birthInput.value =
        group.birthDates.size === 1 ? [...group.birthDates][0] : "";

      modal.classList.remove("hidden");
    };
  });

/* ---------- MERGE ---------- */

document.querySelectorAll(".merge-people-btn").forEach(btn => {
  btn.onclick = async () => {
    const key = btn.dataset.key;
    const group = groups.get(key);
    if (!group) return;

    // 🔑 fastlæg canonical birthDate (hvis entydig)
    const canonicalBirthDate =
      group.birthDates.size === 1 ? [...group.birthDates][0] : "";

    // 🔑 find / opret canonical person
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

    // 🔥 DEDUPLIKÉR PICKS PR. PLAYER
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

      // behold én canonical pick
      const keep = {
        ...matching[0],
        normalizedName: key,
        personId,
        birthDate: canonicalBirthDate
      };

      // fjern alle matches og indsæt den ene
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

document.getElementById("save-person-btn")?.addEventListener("click", async () => {
  if (!currentEditPersonKey) return;

  const name = document.getElementById("edit-person-name").value.trim();
  const rawDate = document.getElementById("edit-person-birthdate").value.trim();
  const birthDate = rawDate ? parseFlexibleDate(rawDate) : "";

  // Find canonical person
  const q = query(
    collection(db, "people"),
    where("nameNormalized", "==", currentEditPersonKey)
  );
  const snap = await getDocs(q);

  let personId;

  if (!snap.empty) {
    personId = snap.docs[0].id;
    await updateDoc(doc(db, "people", personId), {
      name,
      nameNormalized: normalizeName(name),
      birthDate
    });
  } else {
    personId = (
      await addDoc(collection(db, "people"), {
        name,
        nameNormalized: normalizeName(name),
        birthDate
      })
    ).id;
  }

  // Update ALL approved picks
  const playersSnap = await getDocs(collection(db, "players"));

  for (const ps of playersSnap.docs) {
    const ref = doc(db, "players", ps.id);
    const data = ps.data();
    const picks = data.entries?.["2026"]?.picks || [];

    let changed = false;

    picks.forEach(p => {
      if (
        p.status === "approved" &&
        normalizeName(p.normalizedName || p.raw) === currentEditPersonKey
      ) {
        p.normalizedName = name;
        p.birthDate = birthDate;
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

  document.getElementById("edit-person-modal").classList.add("hidden");

});

