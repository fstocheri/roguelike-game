import { ARCANE_BOLT, CLEAVE, QUICK_SHOT, type Move } from "./move.js";

export type HeroClassId = "warrior" | "ranger" | "wizard";

export interface HeroClassDef {
  id: HeroClassId;
  name: string;
  flavor: string;
  baseStats: { maxHp: number; attack: number; defense: number; speed: number; critChance: number };
  startingMove: Move;
}

// Three distinct starting spreads (tank/bulwark, fast/balanced, glass
// cannon) so picking a class is a real choice, not just flavor text. Class
// identity is reinforced further by class-exclusive learnable moves (see
// classRestriction in src/upgrades/pool.ts) on top of these base stats.
export const HERO_CLASSES: Record<HeroClassId, HeroClassDef> = {
  warrior: {
    id: "warrior",
    name: "Warrior",
    flavor: "Sturdy and relentless - built to outlast a fight, not rush it.",
    baseStats: { maxHp: 65, attack: 9, defense: 4, speed: 3, critChance: 0.05 },
    startingMove: CLEAVE,
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    flavor: "Quick and precise - strikes first and finds the weak point.",
    baseStats: { maxHp: 45, attack: 9, defense: 2, speed: 8, critChance: 0.1 },
    startingMove: QUICK_SHOT,
  },
  wizard: {
    id: "wizard",
    name: "Wizard",
    flavor: "Devastating power, paper-thin defenses.",
    baseStats: { maxHp: 35, attack: 11, defense: 1, speed: 5, critChance: 0.05 },
    startingMove: ARCANE_BOLT,
  },
};
