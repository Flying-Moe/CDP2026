console.log("admin.people.js loaded");

/* =====================================================
   IMPORTS
===================================================== */

import {
  db,
  normalizeName,
  parseFlexibleDate
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

/* =====================================================
   PEOPLE TAB – DERIVED FROM APPROVED PICKS
===================================================== */

export async function loadPeople() {
  const tbody = document.querySelector("#people-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const playersSnap = await getDocs(collection(db, "players"));
  const peopleSnap  = await getDocs(collection(db, "people"));

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

  /* --------------------------------------------
     RENDER TABLE
  -------------------------------------------- */

  [...groups.values()]
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" })
    )
    .forEach(g => {
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
          <td>${g.displayName}</td>
          <td>${birthDate}</td>
          <td>${status}</td>
          <td title="Used by ${[...g.playerIds].length} player(s)">
             ${usedBy} 
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
            ${
              g.picks.length > 1
                ? `<button class="merge-people-btn"
                     data-key="${normalizeName(g.displayName)}">
                     Merge
                   </button>`
                : ""
            }
            <button class="delete-people-btn"
              data-key="${normalizeName(g.displayName)}">
              Delete
            </button>
          </td>
        </tr>
      `;
    });

  bindPeopleActions(groups, playersSnap);
}

/* =====================================================
   PEOPLE ACTIONS (MERGE / DELETE)
===================================================== */

function bindPeopleActions(groups, playersSnap) {

  /* ---------- MERGE ---------- */

  document.querySelectorAll(".merge-people-btn").forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.key;
      const group = groups.get(key);
      if (!group) return;

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
              name: group.displayName,
              nameNormalized: key,
              birthDate
            })
          ).id;
        }
      }

      // Apply to ALL approved picks
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
            p.normalizedName = group.displayName;
            changed = true;
          }
        });

        if (changed) {
          await updateDoc(ref, {
            "entries.2026.picks": picks
          });
        }
      }

         await autoLinkApprovedPicks();
         await loadPeople();
         await loadPlayers();
       
    };
  });

  /* ---------- EDIT ---------- */

<button
  class="edit-people-btn"
  data-key="${normalizeName(g.displayName)}">
  Edit
</button>

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

await autoLinkApprovedPicks();
await loadPeople();
await loadPlayers();

    };
  });
}
