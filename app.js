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

function calculatePotentialPoints(age) {
  if (age >= 99) return 1;
  return 100 - age;
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

  /* Hvor mange har valgt hver person */
  const pickCounter = {};
  players.forEach(player => {
    const entry = player.entries["2026"];
    if (!entry) return;

    getActiveList(entry).forEach(pid => {
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

    const rows = activeList.map(pid => {
      const p = peopleMap[pid];
      const age = calculateAge(p.birthDate);
      const potential = calculatePotentialPoints(age);
      return {
        name: p.name,
        age,
        potential,
        count: pickCounter[pid] || 0
      };
    });

    const totalPotential = rows.reduce(
      (sum, r) => sum + r.potential,
      0
    );

    const section = document.createElement("section");

    section.innerHTML = `
      <h2 class="player-header">
        ${player.name} (${rows.length}/20)
        ${usedJulySweep ? "🟣 July sweep" : ""}
      </h2>

      <div class="player-list" style="display:block;">
        <table>
          <thead>
            <tr>
              <th data-sort="name">Name</th>
              <th data-sort="age">Age</th>
              <th data-sort="potential">Potential points</th>
              <th data-sort="count">Picked by</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.name}</td>
                <td>${r.age}</td>
                <td>${r.potential}</td>
                <td>${r.count}</td>
              </tr>
            `).join("")}

            <tr class="total-row">
              <td></td>
              <td>Total</td>
              <td>${totalPotential}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    container.appendChild(section);

    /* Fold ind / ud */
    const header = section.querySelector(".player-header");
    const panel = section.querySelector(".player-list");

    header.addEventListener("click", () => {
      panel.style.display =
        panel.style.display === "none" ? "block" : "none";
    });

    /* Sortering */
    const table = section.querySelector("table");
    const headers = table.querySelectorAll("th");
    let currentSort = { key: null, direction: "asc" };

    headers.forEach(th => {
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

        table.querySelector("tbody").innerHTML = `
          ${rows.map(r => `
            <tr>
              <td>${r.name}</td>
              <td>${r.age}</td>
              <td>${r.potential}</td>
              <td>${r.count}</td>
            </tr>
          `).join("")}

          <tr class="total-row">
            <td></td>
            <td>Total</td>
            <td>${rows.reduce((s, r) => s + r.potential, 0)}</td>
            <td></td>
          </tr>
        `;
      });
    });
  });
}

renderLists();
