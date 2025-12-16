const loginDiv = document.getElementById("login");
const adminPanel = document.getElementById("adminPanel");
const errorEl = document.getElementById("loginError");

document.getElementById("loginBtn").onclick = async () => {
  try {
    await auth.signInWithEmailAndPassword(
      email.value,
      password.value
    );
  } catch (err) {
    errorEl.textContent = err.message;
  }
};

document.getElementById("logoutBtn").onclick = () => {
  auth.signOut();
};

auth.onAuthStateChanged(async user => {
  if (!user) {
    loginDiv.style.display = "block";
    adminPanel.style.display = "none";
    return;
  }

  // Check admin rights
  const snap = await db
    .collection("admins")
    .where("email", "==", user.email)
    .where("active", "==", true)
    .get();

  if (snap.empty) {
    errorEl.textContent = "Not authorized";
    auth.signOut();
    return;
  }

  // Authorized
  loginDiv.style.display = "none";
  adminPanel.style.display = "block";
});
