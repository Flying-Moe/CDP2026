/*
  BADGE ENGINE — FINAL v3
  ----------------------
  Single source of truth for badges.
  No DOM. No Firestore writes.
  Dates internally: YYYY-MM-DD
*/

const TIERS = [
  { id: "bronze", min: 1 },
  { id: "silver", min: 3 },
  { id: "gold", min: 5 },
  { id: "prestige", min: 8 }
];

function emptyTier() {
  return { unlocked: false, players: [] };
}

function buildEmptyTiers() {
  return {
    bronze: emptyTier(),
    silver: emptyTier(),
    gold: emptyTier(),
    prestige: emptyTier()
  };
}

function sortPlayers(a, b) {
  if (a.achievedAt !== b.achievedAt) {
    return a.achievedAt.localeCompare(b.achievedAt);
  }
  if (a.leaderboardScore !== b.leaderboardScore) {
    return b.leaderboardScore - a.leaderboardScore;
  }
  return a.name.localeCompare(b.name);
}

/* =====================================================
   BADGES
===================================================== */

export const BADGES = [

 /* ======================================================
   BADGES – SINGLE ACHIEVEMENTS
======================================================= */
  
/* ======================================================
   BADGES – SINGLE ACHIEVEMENTS
======================================================= */

/* ============ First Blood ======================== */
{
  id: "first_blood",
  name: "First Blood",
  description: "First confirmed death of the season",
  order: 0,
  type: "single",

evaluate({ deaths, players }) {
  // deaths = { playerId: [deathDate, ...] }

  let earliestDate = null;
  const winnerIds = new Set();

  Object.entries(deaths).forEach(([playerId, dates]) => {
    dates.forEach(date => {
      if (!earliestDate || date < earliestDate) {
        earliestDate = date;
        winnerIds.clear();
        winnerIds.add(playerId);
      } else if (date === earliestDate) {
        winnerIds.add(playerId);
      }
    });
  });

  if (!earliestDate) {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: "single",
      players: []
    };
  }

  const winners = players
    .filter(p => winnerIds.has(p.id))
    .map(p => ({
      id: p.id,
      name: p.name,
      achievedAt: earliestDate,
      leaderboardScore: p.totalScore
    }))
    .sort(sortPlayers);

return {
  id: this.id,
  name: this.name,
  description: this.description,
  type: "single",
  unlocked: winners.length > 0,
  players: winners.map(w => ({ id: w.id, name: w.name }))
};

}
},

/* ============ Optimist ========================= */
{
  id: "optimist",
  name: "Optimist",
  description: "Held a full list with no confirmed kills",
  order: 6,
  type: "single",

evaluate({ players }) {
  const winners = [];

  players.forEach(player => {
    const entry = player.entries?.["2026"];
    if (!entry || entry.active === false) return;

    const picks = (entry.picks || []).filter(p => p.status === "approved");
    if (picks.length !== 20) return;

    const hasDeath = picks.some(p => !!p.deathDate);
    if (hasDeath) return;

    winners.push({
      id: player.id,
      name: player.name
    });
  });

  return {
    id: this.id,
    name: this.name,
    description: this.description,
    type: "single",
    unlocked: winners.length > 0,
    players: winners
  };
 }
},

/* ============ July Sweep ========================= */
{
  id: "july_sweep",
  name: "July Sweep",
  description: "Performed a full July Sweep reset",
  order: 7,
  type: "single",

  evaluate() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: "single",
      players: []
    };
  }
},
  
/* ============ DEAD WEIGHT ================= */
{
  id: "dead_weight",
  name: "Dead Weight",
  description: "Suffered a death on your oldest pick",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const picks = (entry.picks || []).filter(
        p => p.status === "approved" && p.birthDate
      );

      if (!picks.length) return;

      // find oldest pick by birthDate (earliest birthdate)
      const oldestPick = picks.reduce((a, b) =>
        new Date(a.birthDate) < new Date(b.birthDate) ? a : b
      );

      if (!oldestPick.deathDate) return;

      winners.push({
        id: player.id,
        name: player.name
      });
    });

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: "single",
      unlocked: winners.length > 0,
      players: winners
    };
  }
},

/* ============ CLEAN KILL ================= */

  {
  id: "clean_kill",
  name: "Clean Kill",
  description: "A death that only one player had picked",
  order: 4,
  type: "single",

  evaluate({ deathsByPerson, players }) {
    const winners = [];

    Object.entries(deathsByPerson || {}).forEach(([pid, info]) => {
      if (info.players.length === 1) {
        const p = players.find(pl => pl.id === info.players[0]);
        if (p) winners.push({ id: p.id, name: p.name });
      }
    });

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: "single",
      unlocked: winners.length > 0,
      players: winners
    };
  }
},

/* ============ Placeholder Singles ================= */

{
  id: "last_laugh",
  name: "Last Laugh",
  description: "Final confirmed death of the season",
  order: 10,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

{
  id: "dead_on_arrival",
  name: "Dead on Arrival",
  description: "Death within the first week of the season",
  order: 12,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

{
  id: "friday_13",
  name: "Friday the 13th",
  description: "Death on Friday the 13th",
  order: 13,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

{
  id: "silent_night",
  name: "Silent Night",
  description: "Death during Christmas",
  order: 14,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

{
  id: "mass_casualty",
  name: "Mass Casualty Event",
  description: "One death affected half or more of the players",
  order: 15,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

{
  id: "dark_horse",
  name: "Dark Horse",
  description: "Unexpected young death",
  order: 16,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

{
  id: "too_soon",
  name: "Too Soon",
  description: "Death under 60 years of age",
  order: 17,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

{
  id: "zombie_alert",
  name: "Zombie Alert",
  description: "First 90+ year old pick",
  order: 19,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

{
  id: "vigilante_work",
  name: "Vigilante Work",
  description: "Two deaths within seven days",
  order: 20,
  type: "single",
  evaluate() {
    return { id: this.id, name: this.name, description: this.description, type: "single", players: [] };
  }
},

  
 /* ========================================================================
   BADGES – TIERED ACHIEVEMENTS
============================================================================ */
  
/* ============ AGENT OF CHAOS ============================= */
/* ====== ⚠ afhænger af Chaos-logik ======================== */

{
  id: "agent_of_chaos",
  name: "Agent of Chaos",
  description: "Chaos-driven mayhem",
  order: 8,
  type: "tiered",

  evaluate() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      globalUnlocked: true,   // synlig men låst
      tiers: buildEmptyTiers()
    };
  }
},

/* ============ THE STABILIZER ============================== */
/* ====== ⚠ afhænger af Chaos-logik ========================== */

{
  id: "the_stabilizer",
  name: "The Stabilizer",
  description: "Maintained control in a chaotic world",
  order: 9,
  type: "tiered",

  evaluate() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      globalUnlocked: true,   // synlig men låst
      tiers: buildEmptyTiers()
    };
  }
},

/* ============ THE UNDERTAKER ========================= */
/* ========== OK?  ===================================== */

  {
    id: "undertaker",
    name: "The Undertaker",
    description: "Confirmed kills accumulated",
    order: 1,
    type: "tiered",

    evaluate({ players, deaths }) {
      const tiers = buildEmptyTiers();
      let globalUnlocked = false;

      players.forEach(player => {
        const hits = player.hits || 0;
        if (hits <= 0) return;

        const deathDates = deaths[player.id] || [];
        if (!deathDates.length) return;

        const achievedAt = deathDates.sort()[0];

        TIERS.forEach(t => {
          if (hits >= t.min) {
            tiers[t.id].players.push({
              id: player.id,
              name: player.name,
              value: hits,
              achievedAt,
              leaderboardScore: player.totalScore
            });
          }
        });
      });

      Object.values(tiers).forEach(tier => {
        if (tier.players.length) {
          tier.unlocked = true;
          globalUnlocked = true;
          tier.players.sort(sortPlayers);
        }
      });

      return { id: this.id, name: this.name, description: this.description, globalUnlocked, tiers };
    }
  },

/* ============ GLASS CANNON ========================= */
/* =========== OK?  ================================== */

  {
    id: "glass_cannon",
    name: "Glass Cannon",
    description: "Accumulated minus points",
    order: 2,
    type: "tiered",

    evaluate({ players }) {
      const tiers = buildEmptyTiers();
      let globalUnlocked = false;

      const THRESHOLDS = {
        bronze: 3,
        silver: 6,
        gold: 9,
        prestige: 12
      };

      players.forEach(player => {
        const penalties = Math.abs(player.penalty || 0);
        if (penalties <= 0) return;

        const achievedAt = "9999-12-31";

        Object.entries(THRESHOLDS).forEach(([tierId, minPenalty]) => {
          if (penalties >= minPenalty) {
            tiers[tierId].players.push({
              id: player.id,
              name: player.name,
              value: penalties,
              achievedAt,
              leaderboardScore: player.totalScore
            });
          }
        });
      });

      Object.values(tiers).forEach(tier => {
        if (tier.players.length) {
          tier.unlocked = true;
          globalUnlocked = true;
          tier.players.sort(sortPlayers);
        }
      });

      return {
        id: this.id,
        name: this.name,
        description: this.description,
        globalUnlocked,
        tiers
      };
    }
  },

/* ============ THE VULTURE ========================= */
/* ====== ⚠ check grænser   ========================== */
  {
    id: "the_vulture",
    name: "The Vulture",
    description: "Low average age across approved picks",
    order: 3,
    type: "tiered",

    evaluate({ players }) {
      const tiers = buildEmptyTiers();
      let globalUnlocked = false;

      players.forEach(player => {
        if (!player.avgPickAge) return;

        const avg = player.avgPickAge;
        const achievedAt = "9999-12-31";

        const thresholds = {
          bronze: 70,
          silver: 65,
          gold: 60,
          prestige: 55
        };

        Object.entries(thresholds).forEach(([tierId, maxAge]) => {
          if (avg <= maxAge) {
            tiers[tierId].players.push({
              id: player.id,
              name: player.name,
              value: avg,
              achievedAt,
              leaderboardScore: player.totalScore
            });
          }
        });
      });

      Object.values(tiers).forEach(tier => {
        if (tier.players.length) {
          tier.unlocked = true;
          globalUnlocked = true;
          tier.players.sort(sortPlayers);
        }
      });

      return { id: this.id, name: this.name, description: this.description, globalUnlocked, tiers };
    }
  },

/* ============ PENSION SNIPER ========================= */
/* ====== ⚠ check grænser   ========================== */
  {
    id: "pension_sniper",
    name: "Pension Sniper",
    description: "High average age across approved picks",
    order: 4,
    type: "tiered",

    evaluate({ players }) {
      const tiers = buildEmptyTiers();
      let globalUnlocked = false;

      players.forEach(player => {
        if (!player.avgPickAge) return;

        const avg = player.avgPickAge;
        const achievedAt = "9999-12-31";

        const thresholds = {
          bronze: 75,
          silver: 80,
          gold: 85,
          prestige: 90
        };

        Object.entries(thresholds).forEach(([tierId, minAge]) => {
          if (avg >= minAge) {
            tiers[tierId].players.push({
              id: player.id,
              name: player.name,
              value: avg,
              achievedAt,
              leaderboardScore: player.totalScore
            });
          }
        });
      });

      Object.values(tiers).forEach(tier => {
        if (tier.players.length) {
          tier.unlocked = true;
          globalUnlocked = true;
          tier.players.sort(sortPlayers);
        }
      });

      return { id: this.id, name: this.name, description: this.description, globalUnlocked, tiers };
    }
  },
  
/* ============ BODY COUNT =========================== */
{
  id: "body_count",
  name: "Body Count",
  description: "Confirmed kills accumulated",
  order: 21,
  type: "tiered",

  evaluate({ players, deaths }) {
    const tiers = buildEmptyTiers();
    let globalUnlocked = false;

    players.forEach(player => {
      const hits = player.hits || 0;
      if (hits <= 0) return;

      const deathDates = deaths[player.id] || [];
      if (!deathDates.length) return;

      const achievedAt = deathDates.sort()[0];

      TIERS.forEach(t => {
        if (hits >= t.min) {
          tiers[t.id].players.push({
            id: player.id,
            name: player.name,
            value: hits,
            achievedAt,
            leaderboardScore: player.totalScore
          });
        }
      });
    });

    Object.values(tiers).forEach(tier => {
      if (tier.players.length) {
        tier.unlocked = true;
        globalUnlocked = true;
        tier.players.sort(sortPlayers);
      }
    });

    return { id: this.id, name: this.name, description: this.description, globalUnlocked, tiers };
  }
},
  
/* ============ MOMENTUM ============================== */
/* ====== ⚠ kræver tidslogik  ========================= */


  
/* ============ POINT HOARDER ========================= */
/* ====== ⚠ afhænger af score-skala  ================== */


  
/* ============ YOLO ================================= */
{
  id: "body_count",
  name: "Body Count",
  description: "Confirmed kills accumulated",
  order: 21,
  type: "tiered",

  evaluate({ players, deaths }) {
    const tiers = buildEmptyTiers();
    let globalUnlocked = false;

    players.forEach(player => {
      const hits = player.hits || 0;
      if (hits <= 0) return;

      const deathDates = deaths[player.id] || [];
      if (!deathDates.length) return;

      const achievedAt = deathDates.sort()[0];

      TIERS.forEach(t => {
        if (hits >= t.min) {
          tiers[t.id].players.push({
            id: player.id,
            name: player.name,
            value: hits,
            achievedAt,
            leaderboardScore: player.totalScore
          });
        }
      });
    });

    Object.values(tiers).forEach(tier => {
      if (tier.players.length) {
        tier.unlocked = true;
        globalUnlocked = true;
        tier.players.sort(sortPlayers);
      }
    });

    return { id: this.id, name: this.name, description: this.description, globalUnlocked, tiers };
  }
},
  
/* ============ HIGH-RISK PICKER (80+) ================================ */
/* ======   =================== */

  
/* ============ COWARD ================================ */
/* ====== ⚠ semantisk modsat YOLO  =================== */



/* ============ COPYCAT =============================== */
/* ====== ⚠ kræver overlap-logik  ==================== */



/* ============ LONE WOLF ============================= */
{
  id: "lone_wolf",
  name: "Lone Wolf",
  description: "Picked celebrities no one else dared to pick",
  order: 23,
  type: "tiered",

  evaluate({ players }) {
    const tiers = buildEmptyTiers();
    let globalUnlocked = false;

    players.forEach(player => {
      const ratio = player.uniquePickRatio;
      if (ratio == null) return;

      const achievedAt = "9999-12-31";

      const thresholds = {
        bronze: 0.25,
        silver: 0.5,
        gold: 0.75,
        prestige: 1
      };

      Object.entries(thresholds).forEach(([tierId, min]) => {
        if (ratio >= min) {
          tiers[tierId].players.push({
            id: player.id,
            name: player.name,
            value: Math.round(ratio * 100),
            achievedAt,
            leaderboardScore: player.totalScore
          });
        }
      });
    });

    Object.values(tiers).forEach(tier => {
      if (tier.players.length) {
        tier.unlocked = true;
        globalUnlocked = true;
        tier.players.sort(sortPlayers);
      }
    });

    return { id: this.id, name: this.name, description: this.description, globalUnlocked, tiers };
  }
},

/* ============ EARLY GAME PREDATOR ==================== */
/* ====== ⚠ Q1-logik  ================================= */



/* ============ LATE GAME REAPER ====================== */
/* ====== ⚠ Q4-logik  ================================= */



/* ============ ZOMBIE INDEX ========================== */
{
  id: "zombie_index",
  name: "Zombie Index",
  description: "Picked celebrities who refuse to die",
  order: 24,
  type: "tiered",

  evaluate({ players }) {
    const tiers = buildEmptyTiers();
    let globalUnlocked = false;

    players.forEach(player => {
      const count = player.picksOver90 || 0;
      if (count <= 0) return;

      const achievedAt = "9999-12-31";

      const thresholds = {
        bronze: 1,
        silver: 2,
        gold: 3,
        prestige: 5
      };

      Object.entries(thresholds).forEach(([tierId, min]) => {
        if (count >= min) {
          tiers[tierId].players.push({
            id: player.id,
            name: player.name,
            value: count,
            achievedAt,
            leaderboardScore: player.totalScore
          });
        }
      });
    });

    Object.values(tiers).forEach(tier => {
      if (tier.players.length) {
        tier.unlocked = true;
        globalUnlocked = true;
        tier.players.sort(sortPlayers);
      }
    });

    return { id: this.id, name: this.name, description: this.description, globalUnlocked, tiers };
  }
},

];

/* =====================================================
   ENGINE ENTRY
===================================================== */

export function evaluateBadges(context) {
  return BADGES
    .sort((a, b) => a.order - b.order)
    .map(badge => badge.evaluate(context));
}
