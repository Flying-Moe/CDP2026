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
  
/* ============ First Blood ======================== */
{
  id: "first_blood",
  name: "First Blood",
  description: "First confirmed death of the season",
  type: "single",

  // Rendering / ordering
  order: 0,

  // Evaluation result
  globalUnlocked: false,   // sættes true når betingelsen rammes
  earned: false,           // redundant men eksplicit
  players: [],             // én eller flere hvis samme dag

  evaluate(context) {
    const deaths = context.deaths
      .filter(d => d.confirmed)
      .sort((a, b) => new Date(a.deathDate) - new Date(b.deathDate));

    if (!deaths.length) return this;

    const firstDate = deaths[0].deathDate;

    const firstDeaths = deaths.filter(
      d => d.deathDate === firstDate
    );

    this.players = [
      ...new Set(firstDeaths.flatMap(d => d.playerIds))
    ];

    this.globalUnlocked = this.players.length > 0;
    this.earned = this.globalUnlocked;

    return this;
  }
},

/* ============ OPTIMIST ========================= */
/* ====== Single-forkerte ========================== */

  {
  id: "optimist",
  name: "Optimist",
  description: "Held a full list with no confirmed kills",
  order: 6,
  type: "single",

  evaluate({ players }) {
    const winners = players
      .filter(p => p.approvedPicks === 20 && p.hits === 0)
      .map(p => ({
        id: p.id,
        name: p.name,
        achievedAt: "9999-12-31",
        leaderboardScore: p.totalScore
      }))
      .sort(sortPlayers);

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      earned: winners.length > 0,
      players: winners
    };
  }
},

/* ============ JULY SWEEP ========================= */
/* ====== Single-forkerte ========================== */

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
      type: this.type,
      earned: false,
      players: []
    };
  }
},


  
/* ============ LAST LAUGH ============================ */
/* ====== korrekt single ============================== */
  

  
/* ============ CLEAN KILL ============================ */
/* ====== korrekt single ============================== */

  
  
/* ============ DEAD ON ARRIVAL ======================= */
/* ====== korrekt single ============================== */


  
/* ============ FRIDAY THE 13TH======================== */
/* ====== korrekt single ============================== */

  
  
/* ============ SILENT NIGHT ========================== */
/* ====== korrekt single ============================== */

  
  
/* ============ MASS CASUALTY EVENT =================== */
/* ====== korrekt single ============================== */
  

  
/* ============ DARK HORSE ============================ */
/* ====== korrekt single ============================== */


  
/* ============ TOO SOON ============================= */
/* ====== korrekt single ============================= */


  
/* ============ DEAD WEIGHT =========================== */
/* ====== korrekt single ============================== */


  
/* ============ ZOMBIE ALERT ========================== */
/* ====== korrekt single ============================== */

  
  
/* ============ VIGILANTE WORK ======================== */
/* ====== korrekt single ============================== */

  
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
/* ====== ✅ 1 / 3 / 5 / 8  ========================== */


  
/* ============ MOMENTUM ============================== */
/* ====== ⚠ kræver tidslogik  ========================= */


  
/* ============ POINT HOARDER ========================= */
/* ====== ⚠ afhænger af score-skala  ================== */


  
/* ============ YOLO ================================= */
/* ====== ✅ 1 / 2 / 3 / 5  ========================== */


  
/* ============ COWARD ================================ */
/* ====== ⚠ semantisk modsat YOLO  =================== */



/* ============ COPYCAT =============================== */
/* ====== ⚠ kræver overlap-logik  ==================== */



/* ============ LONE WOLF ============================= */
/* ====== ✅ %-baseret  =============================== */



/* ============ EARLY GAME PREDATOR ==================== */
/* ====== ⚠ Q1-logik  ================================= */



/* ============ LATE GAME REAPER ====================== */
/* ====== ⚠ Q4-logik  ================================= */



/* ============ ZOMBIE INDEX ========================== */
/* ====== ✅ count-baseret ============================ */

  

];

/* =====================================================
   ENGINE ENTRY
===================================================== */

export function evaluateBadges(context) {
  return BADGES
    .sort((a, b) => a.order - b.order)
    .map(badge => badge.evaluate(context));
}
