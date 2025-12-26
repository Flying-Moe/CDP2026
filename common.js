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

function buildScoreTable(players, year = "2026") {
  const result = [];

  players.forEach(player => {
    const entry = player.entries?.[year];
    if (!entry || entry.active === false) return;

    let total = 0;
    let hits = 0;
    let penalty = entry.penalty || 0;

    (entry.picks || []).forEach(pick => {
      if (
        pick.status === "approved" &&
        pick.birthDate &&
        pick.deathDate
      ) {
        const points = calculatePoints(
          pick.birthDate,
          pick.deathDate
        );
        total += points;
        hits++;
      }
    });

    total += penalty;

    result.push({
      id: player.id,
      name: player.name,
      total,
      hits,
      penalty,
      picks: entry.picks || []
    });
  });

  return result;
}

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

  el.textContent =
    `© 2026 Celebrity Dead Pool          |          Last updated: ${date} ${time} (${tz})`;
})();

