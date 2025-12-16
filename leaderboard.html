console.log("Leaderboard loaded");

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

function calculatePoints(age, scoring) {
  if (age >= scoring.minAgeForMinPoints) {
    return scoring.minPoints;
  }
  return scoring.base - age;
}

async function renderLeaderboard() {
  const people = await loadJSON("data/people.json");
  const players = await loadJSON("data/players.json");
  const deaths = await loadJSON("data/deaths.json");
  const config = await loadJSON("data/config.json");

  const peopleMap = Object.fromEntries(
    people.map(p => [p.id, p])
  );

  const deathMap = Object.fromEntries(
    deaths.map(d => [d.personId, d])
  );

  const results = [];

  players.forEach(player => {
    const entry = player.entries["2026"];
    if (!entry) return;

    const activeList = getActiveList(entry);

    let points = 0;
    let hits = 0;

    activeList.forEach(pid => {
      const death = deathMap[pid];
      if (!death) return;

      const person = peopleMap[pid];
      if (!person) return;

      const age = calculateAgeAtDeath(
        person.birthDate,
        death.deathDate
      );

      const p = calculatePoints(age, config.scoring);
      points += p;
      hits++;
    });

    results.push({
      name: player.name,
      points,
      hits
    });
  });

  results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.hits - a.hits;
  });

  const tbody = document.querySelector("#leaderboard tbody");
  tbody.innerHTML = "";

  results.forEach((r, i) => {
    tbody.innerHTML += `
      <tr>
        <td>${i + 1}</td>
        <td>${r.name}</td>
        <td>${r.points}</td>
        <td>${r.hits}</td>
      </tr>
    `;
  });
}

renderLeaderboard();
