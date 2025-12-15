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

  // Optæl hvor mange gange hver person er valgt
  const pickCounter = {};

  players.forEach(player => {
    const entry = player.entries["2026"];
    if (!entry) return;

    const list = getActiveList(entry);
    list.forEach(pid => {
      pickCounter[pid] = (pickCounter[pid] || 0) + 1;
    });
  });

  const container = document.getElementById("lists");
  container.innerHTML = ""; // sikkerhed ved re-render

  players.forEach(player => {
    const entry = player.entries["2026"];
    if (!entry) return;

    const activeList = getActiveList(entry);
    const usedJulySweep =
      entry.lists.july && entry.lists.july.length > 0;

    const section = document.createElement("section");
    section.style.marginBottom = "2rem";

    section.innerHTML = `
      <h2>
        ${player.name}
        (${activeList.length}/20)
        ${usedJulySweep ? "🟣 July sweep" : ""}
      </h2>
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
            if (!p) return "";
            return `
              <tr>
                <td>${p.name}</td>
                <td>${calculateAge(p.birthDate)}</td>
                <td>${pickCounter[pid] || 0}</td>
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
