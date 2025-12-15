console.log("CDP2026 loaded");
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

function calculateAge(birthDate) {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) {
    age--;
  }
  return age;
}

async function renderLists() {
  const people = await loadJSON("data/people.json");
  const players = await loadJSON("data/players.json");

  const peopleMap = Object.fromEntries(
    people.map(p => [p.id, p])
  );

  const allPicks = [];

  players.forEach(player => {
    const entry = player.entries["2026"];
    if (!entry) return;

    const list = getActiveList(entry);

    list.forEach(pid => {
      allPicks.push(pid);
    });
  });

  const pickCount = id =>
    allPicks.filter(pid => pid === id).length;

  const container = document.getElementById("lists");

  players.forEach(player => {
    const entry = player.entries["2026"];
    if (!entry) return;

    const activeList = getActiveList(entry);

    const section = document.createElement("section");
    section.style.marginBottom = "2rem";

    section.innerHTML = `
      <h2>${player.name} (${activeList.length}/20)</h2>
      <table>
        <thead>
          <tr>
            <th>Navn</th>
            <th>Alder</th>
            <th>Valgt af</th>
          </tr>
        </thead>
        <tbody>
          ${activeList.map(pid => {
            const p = peopleMap[pid];
            return `
              <tr>
                <td>${p.name}</td>
                <td>${calculateAge(p.birthDate)}</td>
                <td>${pickCount(pid)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    container.appendChild(section);
  });
}

renderLists();
