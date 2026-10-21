import { HERO_CLASSES, type HeroClassId } from "./heroClass.js";
import type { Hero } from "./types.js";

export function createHero(name = "Hero", heroClass: HeroClassId = "warrior"): Hero {
  const def = HERO_CLASSES[heroClass];
  return {
    name,
    heroClass,
    maxHp: def.baseStats.maxHp,
    hp: def.baseStats.maxHp,
    attack: def.baseStats.attack,
    defense: def.baseStats.defense,
    speed: def.baseStats.speed,
    critChance: def.baseStats.critChance,
    lifesteal: 0,
    thorns: 0,
    executeThreshold: 0,
    reviveCharges: 0,
    guaranteedFirstStrikeCrit: false,
    gold: 0,
    categoryPicks: {},
    upgrades: [],
    moves: [def.startingMove],
    allies: [],
  };
}
