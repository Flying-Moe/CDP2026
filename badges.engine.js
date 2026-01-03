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
  description: "Performed a July Sweep reset",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      if (entry.julySweepUsed === true) {
        winners.push({ id: player.id, name: player.name });
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
  description: "Killed a celebrity no one else had picked",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    // byg frekvens-map for deaths
    const deathFreq = {};

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      (entry.picks || []).forEach(pick => {
        if (pick.status !== "approved") return;
        if (!pick.deathDate) return;

        const pid = pick.personId || pick.normalizedName;
        if (!pid) return;

        deathFreq[pid] = (deathFreq[pid] || 0) + 1;
      });
    });

    // find clean kills
    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const hasCleanKill = (entry.picks || []).some(pick => {
        if (pick.status !== "approved") return false;
        if (!pick.deathDate) return false;

        const pid = pick.personId || pick.normalizedName;
        return pid && deathFreq[pid] === 1;
      });

      if (hasCleanKill) {
        winners.push({ id: player.id, name: player.name });
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

  /* ============ TOO SOON ================= */

  {
  id: "too_soon",
  name: "Too Soon",
  description: "Lost a celebrity under the age of 60",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const hasTooSoon = (entry.picks || []).some(pick => {
        if (pick.status !== "approved") return false;
        if (!pick.birthDate || !pick.deathDate) return false;

        const age =
          (new Date(pick.deathDate) - new Date(pick.birthDate)) /
          (1000 * 60 * 60 * 24 * 365.25);

        return age < 60;
      });

      if (hasTooSoon) {
        winners.push({ id: player.id, name: player.name });
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

/* ============ LAST LAUGH ================= */

{
  id: "last_laugh",
  name: "Last Laugh",
  description: "Scored the last death of the year",
  type: "single",

  evaluate({ players }) {
    let lastDate = null;
    const lastPlayers = new Set();

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      (entry.picks || []).forEach(pick => {
        if (pick.status !== "approved") return;
        if (!pick.deathDate) return;

        const d = new Date(pick.deathDate);
        if (!lastDate || d > lastDate) {
          lastDate = d;
          lastPlayers.clear();
          lastPlayers.add(player.id);
        } else if (+d === +lastDate) {
          lastPlayers.add(player.id);
        }
      });
    });

    const winners = players
      .filter(p => lastPlayers.has(p.id))
      .map(p => ({ id: p.id, name: p.name }));

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

/* ============ DEAD ON ARRIVAL ================= */
  
{
  id: "dead_on_arrival",
  name: "Dead on Arrival",
  description: "A death occurred within 7 days of season start",
  type: "single",

  evaluate({ players }) {
    const winners = [];
    const seasonStart = new Date("2026-01-01");

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const hit = (entry.picks || []).some(pick => {
        if (pick.status !== "approved") return false;
        if (!pick.deathDate) return false;

        const d = new Date(pick.deathDate);
        const days = (d - seasonStart) / (1000 * 60 * 60 * 24);
        return days >= 0 && days <= 7;
      });

      if (hit) winners.push({ id: player.id, name: player.name });
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
}
,

  /* ============ FRIDAY THE 13TH ================= */
  
{
  id: "friday_13",
  name: "Friday the 13th",
  description: "A death occurred on Friday the 13th",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const hasFriday13 = (entry.picks || []).some(pick => {
        if (pick.status !== "approved") return false;
        if (!pick.deathDate) return false;

        const d = new Date(pick.deathDate);
        return d.getDay() === 5 && d.getDate() === 13; // fredag + 13.
      });

      if (hasFriday13) {
        winners.push({ id: player.id, name: player.name });
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

    /* ============ SILENT NIGHT ================= */
  
{
  id: "silent_night",
  name: "Silent Night",
  description: "A death occurred between December 24 and 26",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const hit = (entry.picks || []).some(pick => {
        if (pick.status !== "approved") return false;
        if (!pick.deathDate) return false;

        const d = new Date(pick.deathDate);
        const m = d.getMonth(); // 0-based
        const day = d.getDate();

        return m === 11 && day >= 24 && day <= 26;
      });

      if (hit) winners.push({ id: player.id, name: player.name });
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

    /* ============ MASS CASUALTY EVENT ================= */
  
{
  id: "mass_casualty",
  name: "Mass Casualty Event",
  description: "A single death affected at least half of all players",
  type: "single",

  evaluate({ players }) {
    const winners = [];
    const totalPlayers = players.length;

    const deathFreq = {};

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      (entry.picks || []).forEach(pick => {
        if (pick.status !== "approved") return;
        if (!pick.deathDate) return;

        const pid = pick.personId || pick.normalizedName;
        if (!pid) return;

        deathFreq[pid] = (deathFreq[pid] || new Set());
        deathFreq[pid].add(player.id);
      });
    });

    const massPids = Object.values(deathFreq)
      .filter(set => set.size / totalPlayers >= 0.5);

    if (massPids.length === 0) {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        type: "single",
        unlocked: false,
        players: []
      };
    }

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const hit = (entry.picks || []).some(pick => {
        if (pick.status !== "approved") return false;
        if (!pick.deathDate) return false;

        const pid = pick.personId || pick.normalizedName;
        return pid && deathFreq[pid] && (deathFreq[pid].size / totalPlayers >= 0.5);
      });

      if (hit) winners.push({ id: player.id, name: player.name });
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
  
    /* ============ DARK HORSE ================= */
  
{
  id: "dark_horse",
  name: "Dark Horse",
  description: "A young celebrity died (under 60)",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const hit = (entry.picks || []).some(pick => {
        if (pick.status !== "approved") return false;
        if (!pick.birthDate || !pick.deathDate) return false;

        const age =
          (new Date(pick.deathDate) - new Date(pick.birthDate)) /
          (1000 * 60 * 60 * 24 * 365.25);

        return age < 60;
      });

      if (hit) winners.push({ id: player.id, name: player.name });
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
  
    /* ============ ZOMBIE ALERT ================= */
  
{
  id: "zombie_alert",
  name: "Zombie Alert",
  description: "Picked a celebrity aged 90 or older",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const hit = (entry.picks || []).some(pick => {
        if (pick.status !== "approved") return false;
        if (!pick.birthDate) return false;

        const today = new Date("2026-01-01"); // reference start
        const age =
          (today - new Date(pick.birthDate)) /
          (1000 * 60 * 60 * 24 * 365.25);

        return age >= 90;
      });

      if (hit) winners.push({ id: player.id, name: player.name });
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

  /* ============ VIGILANTE WORK ================= */
  
{
  id: "vigilante_work",
  name: "Vigilante Work",
  description: "Two deaths within 7 days",
  type: "single",

  evaluate({ players }) {
    const winners = [];

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const dates = (entry.picks || [])
        .filter(p => p.status === "approved" && p.deathDate)
        .map(p => new Date(p.deathDate))
        .sort((a, b) => a - b);

      for (let i = 1; i < dates.length; i++) {
        const diffDays = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        if (diffDays <= 7) {
          winners.push({ id: player.id, name: player.name });
          break;
        }
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
  name: "Undertaker",
  description: "Confirmed kills accumulated",
  type: "tiered",
  tiers: [
    { id: "bronze", label: "Bronze", threshold: 1 },
    { id: "silver", label: "Silver", threshold: 3 },
    { id: "gold", label: "Gold", threshold: 5 },
    { id: "prestige", label: "Prestige", threshold: 8 }
  ],

  evaluate({ players }) {
    const progress = {};

    players.forEach(player => {
      const entry = player.entries?.["2026"];
      if (!entry || entry.active === false) return;

      const kills = (entry.picks || []).filter(
        p => p.status === "approved" && !!p.deathDate
      ).length;

      progress[player.id] = kills;
    });

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: "tiered",
      tiers: this.tiers,
      progress
    };
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
