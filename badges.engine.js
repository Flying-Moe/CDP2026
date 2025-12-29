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

  /* =========================
     THE UNDERTAKER
     Confirmed kills accumulated
  ========================= */

  {
    id: "undertaker",
    name: "The Undertaker",
    description: "Confirmed kills accumulated",
    order: 1,

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

  /* =========================
     GLASS CANNON
     Accumulated minus points
  ========================= */

  {
    id: "glass_cannon",
    name: "Glass Cannon",
    description: "Accumulated minus points",
    order: 2,

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

  /* =========================
     THE VULTURE
     Low average age on picks
  ========================= */

  {
    id: "the_vulture",
    name: "The Vulture",
    description: "Low average age across approved picks",
    order: 3,

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

  /* =========================
     PENSION SNIPER
     High average age on picks
  ========================= */

  {
    id: "pension_sniper",
    name: "Pension Sniper",
    description: "High average age across approved picks",
    order: 4,

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

   /* =========================
     FIRST BLOOD
     First confirmed kill
  ========================= */

  {
    id: "first_blood",
    name: "First Blood",
    description: "First confirmed kill of the season",
    order: 0,

    evaluate({ players, deaths }) {
      const tiers = buildEmptyTiers();
      let earliest = null;

      players.forEach(p => {
        const dates = deaths[p.id] || [];
        if (!dates.length) return;
        const first = dates.sort()[0];
        if (!earliest || first < earliest) earliest = first;
      });

      if (!earliest) {
        return {
          id: this.id,
          name: this.name,
          description: this.description,
          globalUnlocked: false,
          tiers
        };
      }

      players.forEach(player => {
        const dates = deaths[player.id] || [];
        if (dates.includes(earliest)) {
          tiers.bronze.players.push({
            id: player.id,
            name: player.name,
            value: 1,
            achievedAt: earliest,
            leaderboardScore: player.totalScore
          });
        }
      });

      tiers.bronze.unlocked = true;
      tiers.bronze.players.sort(sortPlayers);

      return {
        id: this.id,
        name: this.name,
        description: this.description,
        globalUnlocked: true,
        tiers
      };
    }
  },

  /* =========================
     OPTIMIST
     Full list, no kills (historical)
  ========================= */

  {
    id: "optimist",
    name: "Optimist",
    description: "Held a full list with no confirmed kills",
    order: 6,

    evaluate({ players }) {
      const tiers = buildEmptyTiers();
      let globalUnlocked = false;

      players.forEach(player => {
        if (player.approvedPicks === 20 && player.hits === 0) {
          tiers.bronze.players.push({
            id: player.id,
            name: player.name,
            value: 0,
            achievedAt: "9999-12-31",
            leaderboardScore: player.totalScore
          });
        }
      });

      if (tiers.bronze.players.length) {
        tiers.bronze.unlocked = true;
        globalUnlocked = true;
        tiers.bronze.players.sort(sortPlayers);
      }

      return { id: this.id, name: this.name, description: this.description, globalUnlocked, tiers };
    }
  },

  /* =========================
     JULY SWEEP
     Single season action
  ========================= */

  {
    id: "july_sweep",
    name: "July Sweep",
    description: "Performed a full July Sweep reset",
    order: 7,

    evaluate() {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        globalUnlocked: false,
        tiers: buildEmptyTiers()
      };
    }
  },

  /* =========================
     AGENT OF CHAOS
  ========================= */

  {
    id: "agent_of_chaos",
    name: "Agent of Chaos",
    description: "Chaos-driven mayhem",
    order: 8,

    evaluate() {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        globalUnlocked: false,
        tiers: buildEmptyTiers()
      };
    }
  },

  /* =========================
     THE STABILIZER
  ========================= */

  {
    id: "the_stabilizer",
    name: "The Stabilizer",
    description: "Maintained control in a chaotic world",
    order: 9,

    evaluate() {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        globalUnlocked: false,
        tiers: buildEmptyTiers()
      };
    }
  }

];

/* =====================================================
   ENGINE ENTRY
===================================================== */

export function evaluateBadges(context) {
  return BADGES
    .sort((a, b) => a.order - b.order)
    .map(badge => badge.evaluate(context));
}
