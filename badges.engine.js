/*
  BADGE ENGINE v2
  - Read-only
  - No DOM
  - No Firestore
  - Tier-aware
*/

export const BADGES = [
  {
    id: "undertaker",
    name: "The Undertaker",
    description: "Most confirmed deaths",
    order: 1,
    tiers: [
      { tier: "bronze", min: 1 },
      { tier: "silver", min: 3 },
      { tier: "gold", min: 5 },
      { tier: "prestige", min: 8 }
    ],
    evaluate(players) {
      const max = Math.max(...players.map(p => p.hits));
      if (max <= 0) return null;

      const tier = [...this.tiers]
        .reverse()
        .find(t => max >= t.min)?.tier;

      return {
        tier,
        winners: players
          .filter(p => p.hits === max)
          .map(p => ({ name: p.name, value: p.hits }))
      };
    }
  },

  {
    id: "grim_favorite",
    name: "Grim’s Favorite",
    description: "Highest total score",
    order: 2,
    tiers: [
      { tier: "bronze", min: 1 },
      { tier: "silver", min: 50 },
      { tier: "gold", min: 100 },
      { tier: "prestige", min: 150 }
    ],
    evaluate(players) {
      const max = Math.max(...players.map(p => p.totalScore));
      if (max <= 0) return null;

      const tier = [...this.tiers]
        .reverse()
        .find(t => max >= t.min)?.tier;

      return {
        tier,
        winners: players
          .filter(p => p.totalScore === max)
          .map(p => ({ name: p.name, value: p.totalScore }))
      };
    }
  }
];

export function evaluateBadges(players) {
  return BADGES
    .sort((a, b) => a.order - b.order)
    .map(badge => {
      const result = badge.evaluate(players);
      if (!result) return null;

      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        tier: result.tier,
        winners: result.winners
      };
    })
    .filter(Boolean);
}
