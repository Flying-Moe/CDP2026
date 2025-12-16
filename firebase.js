const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  appId: "…"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
