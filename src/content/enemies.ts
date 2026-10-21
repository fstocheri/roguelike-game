import type { Enemy, StatBlock } from "../entities/types.js";
import type { Move } from "../entities/move.js";
import type { Rng } from "../util/rng.js";

interface EnemyTemplate {
  name: string;
  base: StatBlock;
  moves: Move[];
}

function move(id: string, name: string, power: number): Move {
  return { id, name, flavor: "", power, target: "single-enemy" };
}

// A modest bump over the original numbers (floor-1, zero-upgrade combat was
// already reasonably paced at ~3 hits to kill a trash mob - the actual
// snowball problem was later floors, handled by steeper scaling below plus
// the crit/diminishing-returns/rarity nerfs elsewhere). Each enemy has two
// moves so the AI (src/combat/ai.ts) has a real choice to make each round.
const REGULAR_TEMPLATES: EnemyTemplate[] = [
  {
    name: "Bandit",
    base: { maxHp: 23, hp: 23, attack: 6, defense: 1, speed: 5 },
    moves: [move("bandit-slash", "Slash", 1.0), move("bandit-dirty-trick", "Dirty Trick", 1.3)],
  },
  {
    name: "Skeleton",
    base: { maxHp: 19, hp: 19, attack: 7, defense: 1, speed: 6 },
    moves: [move("skeleton-bone-jab", "Bone Jab", 1.0), move("skeleton-rattling-strike", "Rattling Strike", 1.3)],
  },
  {
    name: "Wolf",
    base: { maxHp: 16, hp: 16, attack: 8, defense: 1, speed: 8 },
    moves: [move("wolf-bite", "Bite", 1.0), move("wolf-savage-lunge", "Savage Lunge", 1.4)],
  },
  {
    name: "Cultist",
    base: { maxHp: 21, hp: 21, attack: 7, defense: 2, speed: 4 },
    moves: [move("cultist-hex-bolt", "Hex Bolt", 1.0), move("cultist-dark-ritual-strike", "Dark Ritual Strike", 1.3)],
  },
  {
    name: "Feral Boar",
    base: { maxHp: 28, hp: 28, attack: 6, defense: 2, speed: 3 },
    moves: [move("boar-gore", "Gore", 1.0), move("boar-charge", "Charge", 1.4)],
  },
];

const BOSS_TEMPLATES: Record<number, EnemyTemplate> = {
  1: {
    name: "Rotting Ogre",
    base: { maxHp: 70, hp: 70, attack: 10, defense: 4, speed: 3 },
    moves: [move("ogre-slam", "Slam", 1.0), move("ogre-crushing-blow", "Crushing Blow", 1.5)],
  },
  2: {
    name: "Blackguard Knight",
    base: { maxHp: 95, hp: 95, attack: 13, defense: 6, speed: 5 },
    moves: [move("knight-cleave", "Cleave", 1.0), move("knight-execute-strike", "Execute Strike", 1.5)],
  },
  3: {
    name: "The Warden",
    base: { maxHp: 130, hp: 130, attack: 16, defense: 7, speed: 6 },
    moves: [move("warden-judgement", "Judgement", 1.0), move("warden-wrath", "Warden's Wrath", 1.6)],
  },
};

const ENDLESS_BOSS_NAMES = ["The Undying King", "Herald of Ruin", "The Endless Maw"];

// Floors 1-3 use a fixed, curated scaling curve. Floor 4+ (endless) keeps
// scaling using the same formula so difficulty growth doesn't have a seam.
// Exponential rather than linear so endless mode keeps pace with a hero who
// is still picking up upgrades every single fight - a linear curve let late
// floors fall behind and become trivial.
export function scaleFor(floor: number): number {
  return 1.25 ** (floor - 1);
}

function scaleStats(base: StatBlock, multiplier: number): StatBlock {
  return {
    maxHp: Math.round(base.maxHp * multiplier),
    hp: Math.round(base.maxHp * multiplier),
    attack: Math.round(base.attack * multiplier),
    defense: Math.round(base.defense * multiplier),
    speed: base.speed,
  };
}

export function generateEnemy(floor: number, isBoss: boolean, rng: Rng): Enemy {
  const multiplier = scaleFor(floor);

  if (isBoss) {
    const template =
      BOSS_TEMPLATES[floor] ??
      {
        name: ENDLESS_BOSS_NAMES[(floor - 4) % ENDLESS_BOSS_NAMES.length],
        base: BOSS_TEMPLATES[3].base,
        moves: BOSS_TEMPLATES[3].moves,
      };
    // Endless bosses keep scaling past floor 3's baseline curve.
    const bossMultiplier = floor <= 3 ? 1 : multiplier / scaleFor(3);
    return {
      name: template.name,
      isBoss: true,
      moves: template.moves,
      ...scaleStats(template.base, bossMultiplier),
    };
  }

  const template = REGULAR_TEMPLATES[Math.floor(rng() * REGULAR_TEMPLATES.length)];
  return {
    name: template.name,
    isBoss: false,
    moves: template.moves,
    ...scaleStats(template.base, multiplier),
  };
}

const MAX_PARTY_SIZE = 3;

// Floor 1 is always a solo enemy (keep the very first fights simple to
// learn from). From floor 2 the odds of a second enemy grow with floor, and
// a third can join from floor 6+. Bosses are solo through the campaign
// (floors 1-3); deep into endless mode a boss may drag along one add.
function regularPartySize(floor: number, rng: Rng): number {
  if (floor === 1) return 1;
  const secondEnemyChance = floor <= 3 ? 0.2 : Math.min(0.6, 0.2 + (floor - 3) * 0.08);
  if (rng() >= secondEnemyChance) return 1;
  if (floor >= 6 && rng() < secondEnemyChance * 0.5) return 3;
  return 2;
}

export function generateEnemyParty(floor: number, isBoss: boolean, rng: Rng): Enemy[] {
  if (isBoss) {
    const boss = generateEnemy(floor, true, rng);
    if (floor >= 6 && rng() < 0.3) {
      return [boss, generateEnemy(floor, false, rng)];
    }
    return [boss];
  }

  const size = Math.min(MAX_PARTY_SIZE, regularPartySize(floor, rng));
  const party: Enemy[] = [];
  for (let i = 0; i < size; i++) party.push(generateEnemy(floor, false, rng));
  return party;
}
