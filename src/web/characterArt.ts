// Zero-asset "models": an emoji + accent color per character. Good enough to
// tell combatants apart and get real animation feedback without needing any
// actual art pipeline yet.
export interface CharacterArt {
  emoji: string;
  color: string;
}

export const HERO_ART: CharacterArt = { emoji: "🤺", color: "#3b6fd6" };

const ENEMY_ART: Record<string, CharacterArt> = {
  Bandit: { emoji: "🥷", color: "#7a5230" },
  Skeleton: { emoji: "💀", color: "#b9b9b9" },
  Wolf: { emoji: "🐺", color: "#5b6b73" },
  Cultist: { emoji: "🧙", color: "#7d3fc9" },
  "Feral Boar": { emoji: "🐗", color: "#8a5a3b" },
  "Rotting Ogre": { emoji: "🧟", color: "#4b6b2f" },
  "Blackguard Knight": { emoji: "🛡️", color: "#3a3a3a" },
  "The Warden": { emoji: "👁️", color: "#7a1f1f" },
  "The Undying King": { emoji: "👑", color: "#8a1f8a" },
  "Herald of Ruin": { emoji: "🔥", color: "#c14a1f" },
  "The Endless Maw": { emoji: "🕳️", color: "#1a1a1a" },
};

const DEFAULT_ENEMY_ART: CharacterArt = { emoji: "👹", color: "#8a1f1f" };

export function artForEnemy(name: string): CharacterArt {
  return ENEMY_ART[name] ?? DEFAULT_ENEMY_ART;
}

const CATEGORY_ICON: Record<string, string> = {
  offense: "⚔️",
  defense: "🛡️",
  vitality: "❤️",
  utility: "✨",
  sustain: "🍞",
  boon: "🌟",
  curse: "🩸",
  move: "📖",
};

export function iconForCategory(category: string): string {
  return CATEGORY_ICON[category] ?? "❔";
}
