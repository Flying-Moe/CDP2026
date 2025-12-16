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

function sortRows(rows, key, direction) {
  return rows.sort((a, b) => {
    if (a[key] < b[key]) return direction === "asc" ? -1 : 1;
    if (a[key] > b[key]) return direction === "asc" ? 1 : -1;
    return 0;
  });
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
  container.innerHTML = "";

  players.forEach(player => {
    const entry = player.entries["2026"];
    if (!entry) return;

    const activeList = getActiveList(entry);
    const usedJulySweep =
      entry.lists.july && entry.lists.july.length > 0;

    const rows = activeList
      .map(pid => {
        const p = peopleMap[pid];
        if (!p) return null;
        return {
          name: p.name,
          age: calculateAge(p.birthDate),
          count: pickCounter[pid] || 0
        };
      })
      .filter(Boolean);

    const section = document.createElement("section");
    section.style.marginBottom = "2rem";

    section.innerHTML = `
      <h2>
        ${player.name}
        (${rows.length}/20)
        ${usedJulySweep ? "🟣 July sweep" : ""}
      </h2>
      <table>
        <thead>
          <tr>
            <th data-sort="name">Navn</th>
            <th data-sort="age">Alder</th>
            <th data-sort="count">Valgt af</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.name}</td>
              <td>${r.age}</td>
              <td>${r.count}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    container.appendChild(section);

    // Sorteringslogik (lokal pr. tabel)
    const table = section.querySelector("table");
    const headers = table.querySelectorAll("th");
    let currentSort = { key: null, direction: "asc" };

    headers.forEach(th => {
      th.style.cursor = "pointer";

      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (!key) return;

        if (currentSort.key === key) {
          currentSort.direction =
            currentSort.direction === "asc" ? "desc" : "asc";
        } else {
          currentSort.key = key;
          currentSort.direction = "asc";
        }

        sortRows(rows, key, currentSort.direction);

        const tbody = table.querySelector("tbody");
        tbody.innerHTML = rows.map(r => `
          <tr>
            <td>${r.name}</td>
            <td>${r.age}</td>
            <td>${r.count}</td>
          </tr>
        `).join("");
      });
    });
  });
}

renderLists();
