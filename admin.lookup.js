
import { db, refreshAdminViews, invalidateAdminCache } from "./admin.core.js";
import {
  doc,
  updateDoc,
  getDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const lookupState = {
  loading: false,
  results: [] // { personId, name, foundDeathDate, source, confidence, flagged }
};

const lookupState = {
  loading: false,
  results: [
    {
      personId,
      name,
      foundDeathDate,     // ISO
      source,             // "wiki" | "google" | "news"
      confidence,         // "high" | "medium" | "low"
      flagged: false      // eksisterende flag i people
    }
  ]
};

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

export async function applyLookupResult(result) {
  if (result.confidence === "low") {
    const ok = confirm(
      "This death date has LOW confidence.\n\nAre you sure you want to apply it?"
    );
    if (!ok) return;
  }

  const ref = doc(db, "people", result.personId);
  await updateDoc(ref, {
    deathDate: result.foundDeathDate,
    "flags.pendingDeath": false
  });

  invalidateAdminCache("people", "players");
  await refreshAdminViews({ force: true });
}

export async function applyAllHighConfidence() {
  const batch = writeBatch(db);

  lookupState.results.forEach(r => {
    if (r.confidence !== "high") return;
    if (r.flagged) return;

    batch.update(doc(db, "people", r.personId), {
      deathDate: r.foundDeathDate,
      "flags.pendingDeath": false
    });
  });

  await batch.commit();

  invalidateAdminCache("people", "players");
  await refreshAdminViews({ force: true });
}

export async function toggleLookupFlag(result) {
  result.flagged = !result.flagged;
  await setPendingDeathFlag(result.personId, result.flagged);
}


