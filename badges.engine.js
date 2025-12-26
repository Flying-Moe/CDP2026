/*
  BADGE ENGINE
  - Read-only
  - No DOM
  - No Firestore
*/

export const BADGE_DEFINITIONS = [
  {
    id: "undertaker",
    icon: "☠️",
    name: "The Undertaker",
    description: "Most confirmed deaths",
    evaluate(players) {
      const max = Math.max(...players.map(p => p.hits));
      if (max <= 0) return null;

      return players
        .filter(p => p.hits === max)
        .map(p => p.name);
    }
  },

  {
    id: "grim_favorite",
    icon: "🥇",
    name: "Grim’s Favorite",
    description: "Highest total score",
    evaluate(players) {
      const max = Math.max(...players.map(p => p.totalScore));
      if (max <= 0) return null;

      return players
        .filter(p => p.totalScore === max)
        .map(p => p.name);
    }
  }
];

export function evaluateBadges(players) {
  const unlocked = [];

  BADGE_DEFINITIONS.forEach(def => {
    const winners = def.evaluate(players);
    if (!winners || winners.length === 0) return;

    unlocked.push({
      id: def.id,
      icon: def.icon,
      name: def.name,
      description: def.description,
      winners
    });
  });

  return unlocked;
}
