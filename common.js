console.log("Common loaded");

/* === Active navigation === */
(function setActiveNav() {
  const links = document.querySelectorAll("nav a");
  const current = location.pathname.split("/").pop() || "index.html";

  links.forEach(link => {
    const href = link.getAttribute("href");
    if (href === current) {
      link.classList.add("active");
    }
  });
})();

/* === Build timestamp with timezone === */
(function renderBuildInfo() {
  const el = document.getElementById("build-info");
  if (!el) return;

  const d = new Date(document.lastModified);
  const pad = n => String(n).padStart(2, "0");

  const date =
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  const time =
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const tz =
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  el.innerHTML = `
    © 2026 Celebrity Dead Pool &nbsp;|&nbsp;
    <span class="build-timestamp">
      Last updated: ${date} ${time} (${tz})
    </span>
  `;
})();
