console.log("Stats loaded");

async function loadJSON(path) {
  const res = await fetch(path);
  return res.json();
}

function getActiveList(entry) {
  if (entry.lists.july && entry.lists.july.length > 0) {
    return entry.lists.july;
  }
  return entry.lists.initial;
}

function calculateAgeAtDeath(birthDate, deathDate) {
  const b = new Date(birthDate);
  const d = new Date(deathDate);
  let age = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) {
    age--;
  }
  return age;
}

async function renderStats() {
  const people = await loadJSON("data/people.json");
  const players = await loadJSON("data/players.json");
  const deaths = await loadJSON("data/deaths.json");
  const config = await loadJSON("data/config.json");

  const peopleMap = Object.fromEntries(
    people.map(p => [p.id, p])
  );

  // Collect all active picks
  const allPicks = [];
  players.forEach(player => {
    const entry = player.entries["2026"];
    if (!entry) return;
    getActiveList(entry).forEach(pid => allPicks.push(pid));
  });

  const pickCounter = {};
  allPicks.forEach(pid => {
    pickCounter[pid] = (pickCounter[pid] || 0) + 1;
  });

  // Death statistics
  const deathAges = [];
  deaths.forEach(d => {
    const person = peopleMap[d.personId];
    if (!person) return;
    deathAges.push(
      calculateAgeAtDeath(person.birthDate, d.deathDate)
    );
  });

  const avgDeathAge =
    deathAges.length > 0
      ? (deathAges.reduce((a, b) => a + b, 0) / deathAges.length).toFixed(1)
      : "–";

  const youngest = deathAges.length ? Math.min(...deathAges) : "–";
  const oldest = deathAges.length ? Math.max(...deathAges) : "–";

  // Missed opportunities (dead but never picked)
  const pickedIds = new Set(allPicks);
  const missed = deaths.filter(d => !pickedIds.has(d.personId));

  // Most picked celebrities
  const mostPicked = Object.entries(pickCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({
      name: peopleMap[id]?.name,
      count
    }));

  const totalPlayers = players.length;
  const totalPool = totalPlayers * config.game.entryFee;

  const container = document.getElementById("stats");
  container.innerHTML = `
    <h2>Overview</h2>
    <ul>
      <li>Players: ${totalPlayers}</li>
      <li>Celebrities in pool: ${people.length}</li>
      <li>Total picks: ${allPicks.length}</li>
      <li>Prize pool: ${totalPool} ${config.game.currency}</li>
    </ul>

    <h2>Death statistics</h2>
    <ul>
      <li>Confirmed deaths: ${deaths.length}</li>
      <li>Average age at death: ${avgDeathAge}</li>
      <li>Youngest death: ${youngest}</li>
      <li>Oldest death: ${oldest}</li>
    </ul>

    <h2>Most picked celebrities</h2>
    <ul>
      ${mostPicked.length === 0
        ? "<li>No picks yet</li>"
        : mostPicked.map(p => `
            <li>${p.name} (${p.count})</li>
          `).join("")}
    </ul>

    <h2>Missed opportunities</h2>
    <ul>
      ${missed.length === 0
        ? "<li>None so far</li>"
        : missed.map(d => `
            <li>${peopleMap[d.personId]?.name}</li>
          `).join("")}
    </ul>
  `;
}

renderStats();
