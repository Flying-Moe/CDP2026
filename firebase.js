// firebase.js
const auth = firebase.auth();
const db = firebase.firestore();
// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZgxQo-r6x7hkoFv8O8DZOXi-7qMKem0k",
  authDomain: "cdp2026-dcce0.firebaseapp.com",
  projectId: "cdp2026-dcce0",
  appId: "1:330380456184:web:919db178cf1c2678decb0d"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
