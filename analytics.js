import { db } from "./firebase.js";
import {
  doc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const SESSION_KEY = "cdp_session_started";
const SESSION_ID_KEY = "cdp_session_id";
const LIVE_PING_INTERVAL = 60000; // 60 sek

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

async function startSessionIfNeeded() {
  if (sessionStorage.getItem(SESSION_KEY)) return;

  sessionStorage.setItem(SESSION_KEY, "1");

  const totalRef = doc(db, "analytics", "site");
  const todayRef = doc(
    collection(db, "analytics", "site", "daily"),
    getTodayKey()
  );

  await Promise.all([
    setDoc(totalRef, { totalViews: increment(1) }, { merge: true }),
    setDoc(todayRef, { views: increment(1) }, { merge: true })
  ]);
}

async function pingLiveSession() {
  const sessionId = getSessionId();
  const ref = doc(
    collection(db, "analytics", "site", "liveSessions"),
    sessionId
  );

  await setDoc(
    ref,
    { lastSeen: serverTimestamp() },
    { merge: true }
  );
}

export async function initAnalytics() {
  await startSessionIfNeeded();
  await pingLiveSession();
  setInterval(pingLiveSession, LIVE_PING_INTERVAL);
}
